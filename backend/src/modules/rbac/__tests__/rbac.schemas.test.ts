import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../platform/errors/app-error.js';
import { parseOrThrow } from '../../../platform/http/validate.js';
import { CreateCompanyRequestSchema, UpdateCompanyRequestSchema } from '../rbac.schemas.js';

/** D-0158 — the optional company `currency` (ISO 4217, stored upper-case). */
const BODY = {
  name: 'Acme',
  email: 'acme@example.com',
  address: '1 Main St',
  city: 'Lahore',
  state: 'Punjab',
  country: 'PK',
  zip_code: '54000',
};

describe('company currency on POST/PUT /companies (D-0158)', () => {
  it.each([
    ['create', CreateCompanyRequestSchema],
    ['update', UpdateCompanyRequestSchema],
  ] as const)(
    '%s: optional — omitting it is fine (existing form callers keep working)',
    (_name, schema) => {
      expect(parseOrThrow(schema, BODY).currency).toBeUndefined();
    }
  );

  it.each([
    ['create', CreateCompanyRequestSchema],
    ['update', UpdateCompanyRequestSchema],
  ] as const)('%s: a 3-letter code is accepted and normalised to upper-case', (_name, schema) => {
    expect(parseOrThrow(schema, { ...BODY, currency: 'pkr' }).currency).toBe('PKR');
    expect(parseOrThrow(schema, { ...BODY, currency: 'USD' }).currency).toBe('USD');
  });

  it.each(['', 'US', 'USDD', '12A', 'P K'])('rejects %j with the fixed message', bad => {
    let error: unknown;
    try {
      parseOrThrow(UpdateCompanyRequestSchema, { ...BODY, currency: bad });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors).toEqual({
      currency: ['The currency must be a 3-letter ISO 4217 code.'],
    });
  });
});
