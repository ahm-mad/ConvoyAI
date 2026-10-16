import { describe, expect, it } from 'vitest';
import { RuleRequestSchema, RuleUpdateRequestSchema } from '../rules.schemas.js';

/** D-0130: the real frontend's `POST /rules/store` payload must pass `RuleBuilderController::store`'s validation. */
const FRONTEND_PAYLOAD = {
  ruleName: 'testing rule',
  is_active: true,
  executionInterval: '60',
  allowRetriggering: false,
  conditions: [
    {
      selectedProduct: 11281,
      selectedAttribute: 'object.battery_voltage',
      selectedCondition: 'equal to',
      conditionValue: '999988',
      logicalOperator: 'If',
    },
  ],
  actions: { sendEmail: true, sendMessage: true, systemNotification: true },
  emailData: {
    to: ['jd@g.com'],
    newRecipient: '',
    subject: 'jkljhio',
    message: 'sup {{rule_name}}',
  },
  smsData: { to: ['039393939'], newRecipient: '', message: 'fiei32' },
  notificationData: { message: ' {{rule_id}} ' },
};

describe('RuleRequestSchema (POST /rules/store)', () => {
  it("accepts the frontend's payload: numeric selectedProduct, array emailData.to, string executionInterval", () => {
    const parsed = RuleRequestSchema.parse(FRONTEND_PAYLOAD) as Record<string, unknown> & {
      conditions: { selectedProduct: unknown }[];
    };

    expect(parsed.conditions[0]?.selectedProduct).toBe(11281);
    expect(parsed['executionInterval']).toBe(60);
    expect(parsed['emailData']).toEqual({
      to: ['jd@g.com'],
      newRecipient: null, // ConvertEmptyStringsToNull, applied to nested input too
      subject: 'jkljhio',
      message: 'sup {{rule_name}}',
    });
    expect(parsed['notificationData']).toEqual({ message: '{{rule_id}}' }); // TrimStrings
    expect(parsed['smsData']).toMatchObject({ to: ['039393939'] });
  });

  it.each([
    ['is_active', { is_active: 1 }],
    ['is_active', { is_active: '0' }],
    ['allowRetriggering', { allowRetriggering: '1' }],
  ])("boolean fields accept Laravel's 0/1/'0'/'1' (%s)", (_name, override) => {
    expect(RuleRequestSchema.safeParse({ ...FRONTEND_PAYLOAD, ...override }).success).toBe(true);
  });

  it('emailData/smsData/notificationData are optional, nullable, and free-form arrays/objects only', () => {
    const { emailData: _e, smsData: _s, notificationData: _n, ...rest } = FRONTEND_PAYLOAD;
    expect(RuleRequestSchema.safeParse(rest).success).toBe(true);
    expect(RuleRequestSchema.safeParse({ ...rest, emailData: null }).success).toBe(true);
    expect(RuleRequestSchema.safeParse({ ...rest, emailData: 'a@b.c' }).success).toBe(false);
  });

  it("still enforces Laravel's required fields", () => {
    const bad = (override: Record<string, unknown>) =>
      RuleRequestSchema.safeParse({ ...FRONTEND_PAYLOAD, ...override }).success;
    expect(bad({ executionInterval: 0 })).toBe(false);
    expect(bad({ executionInterval: 'abc' })).toBe(false);
    expect(bad({ conditions: [] })).toBe(false);
    expect(bad({ actions: { sendEmail: true } })).toBe(false);
    expect(bad({ is_active: 'yes' })).toBe(false);
  });

  it('logicalOperator is required on store but nullable on update', () => {
    const noOperator = {
      ...FRONTEND_PAYLOAD,
      conditions: [{ selectedProduct: 1, selectedAttribute: 'a', selectedCondition: 'equal to' }],
    };
    expect(RuleRequestSchema.safeParse(noOperator).success).toBe(false);
    expect(RuleUpdateRequestSchema.safeParse(noOperator).success).toBe(true);
  });

  it('conditionValue stays a string rule (a bare number is rejected, as in Laravel)', () => {
    const withNumber = {
      ...FRONTEND_PAYLOAD,
      conditions: [{ ...FRONTEND_PAYLOAD.conditions[0], conditionValue: 999988 }],
    };
    expect(RuleRequestSchema.safeParse(withNumber).success).toBe(false);
  });
});
