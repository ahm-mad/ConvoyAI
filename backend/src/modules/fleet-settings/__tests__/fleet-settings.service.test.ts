import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetSettingsService } from '../fleet-settings.service.js';
import {
  DEFAULT_FLEET_SETTINGS,
  type StoredFleetSettings,
  type UpdateFleetSettingsInput,
} from '../fleet-settings.types.js';
import { UpdateFleetSettingsRequestSchema } from '../fleet-settings.schemas.js';
import type { FleetSettingsRepository } from '../fleet-settings.repository.js';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: '7',
    companyId: '1',
    roles: [],
    perms: [],
    jti: 't',
    exp: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

const stored = (overrides: Partial<StoredFleetSettings> = {}): StoredFleetSettings => ({
  ...DEFAULT_FLEET_SETTINGS,
  id: '5',
  createdAt: new Date('2026-09-25T10:00:00Z'),
  updatedAt: new Date('2026-09-25T10:00:00Z'),
  updatedBy: '7',
  ...overrides,
});

function build(
  row: StoredFleetSettings | undefined,
  onUpsert?: (input: UpdateFleetSettingsInput) => void
) {
  const repo = {
    find: () => Promise.resolve(row),
    upsert: (input: UpdateFleetSettingsInput) => {
      onUpsert?.(input);
      return Promise.resolve({
        ...(row ?? stored()),
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
      });
    },
  } as unknown as FleetSettingsRepository;
  const users = {
    findContactsByIds: () =>
      Promise.resolve(new Map([['7', { id: '7', firstName: 'Ada', lastName: 'Lovelace' }]])),
  };
  return new FleetSettingsService(repo, users);
}

describe('FleetSettingsService', () => {
  it('a company with no row gets the defaults (is_default: true) and effectiveSettings() returns a copy of them', async () => {
    const service = build(undefined);
    const result = (await runWithContextAsync(ctx(), () => service.getSettings())) as {
      data: Record<string, unknown>;
    };
    expect(result.data).toMatchObject({
      is_default: true,
      timezone: 'UTC',
      position_freshness_minutes: 15,
      idle_threshold_minutes: 5,
      scheduled_hours_per_vehicle_per_day: 24,
      on_time_grace_minutes: 0,
      maintenance_due_soon_days: 7,
      maintenance_due_soon_km: 500,
      unit_system: 'metric', // D-0192 (U1): the default = today's behaviour
      utilisation_target_pct: null,
      updated_at: null,
      updated_by: null,
    });
    const effective = await runWithContextAsync(ctx(), () => service.effectiveSettings());
    expect(effective).toEqual(DEFAULT_FLEET_SETTINGS);
    expect(effective).not.toBe(DEFAULT_FLEET_SETTINGS);
  });

  it('D-0192 (U1): unit_system is returned (a saved `us` row says so), passed through by updateSettings and never touched by an update that does not send it', async () => {
    const saved = build(stored({ unitSystem: 'us' }));
    const got = (await runWithContextAsync(ctx(), () => saved.getSettings())) as {
      data: Record<string, unknown>;
    };
    expect(got.data['unit_system']).toBe('us');
    expect((await runWithContextAsync(ctx(), () => saved.effectiveSettings())).unitSystem).toBe(
      'us'
    );
    let received: UpdateFleetSettingsInput | undefined;
    const service = build(stored(), input => (received = input));
    const changed = (await runWithContextAsync(ctx(), () =>
      service.updateSettings({ unitSystem: 'uk' }, undefined)
    )) as { data: Record<string, unknown> };
    expect(received).toEqual({ unitSystem: 'uk' });
    expect(changed.data['unit_system']).toBe('uk');
    const untouched = (await runWithContextAsync(ctx(), () =>
      build(stored({ unitSystem: 'us' }), input => (received = input)).updateSettings(
        { timezone: 'Asia/Karachi' },
        undefined
      )
    )) as { data: Record<string, unknown> };
    expect(received).toEqual({ timezone: 'Asia/Karachi' }); // no unitSystem in the write
    expect(untouched.data['unit_system']).toBe('us');
  });

  it("a saved row is returned with its audit fields and the editor's name", async () => {
    const service = build(
      stored({ timezone: 'Asia/Karachi', positionFreshnessMinutes: 20, utilisationTargetPct: 70 })
    );
    const result = (await runWithContextAsync(ctx(), () => service.getSettings())) as {
      data: Record<string, unknown>;
    };
    expect(result.data).toMatchObject({
      is_default: false,
      timezone: 'Asia/Karachi',
      position_freshness_minutes: 20,
      utilisation_target_pct: 70,
      updated_by: '7',
      updated_by_user: { id: '7', first_name: 'Ada', last_name: 'Lovelace' },
    });
  });

  it('updateSettings passes only what was sent (targets may be cleared with null) and creates the row on first save', async () => {
    let received: UpdateFleetSettingsInput | undefined;
    const service = build(undefined, input => (received = input));
    const result = (await runWithContextAsync(ctx(), () =>
      service.updateSettings({ timezone: 'Asia/Karachi', onTimeTargetPct: null }, undefined)
    )) as {
      message: string;
      data: Record<string, unknown>;
    };
    expect(received).toEqual({ timezone: 'Asia/Karachi', onTimeTargetPct: null });
    expect(result.message).toBe('Fleet settings updated successfully.');
    expect(result.data).toMatchObject({
      is_default: false,
      timezone: 'Asia/Karachi',
      on_time_target_pct: null,
    });
  });

  it('expected_updated_at: a stale value is a 409 with the current version and nothing is written; a fresh one (whole seconds) passes; a first save with an expected date is stale', async () => {
    let writes = 0;
    const service = build(
      stored({ updatedAt: new Date('2026-09-25T10:00:00.400Z') }),
      () => writes++
    );
    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateSettings({ timezone: 'UTC' }, new Date('2026-09-25T09:59:00Z'))
      )
    ).rejects.toBeInstanceOf(ConflictError);
    expect(writes).toBe(0);
    await runWithContextAsync(ctx(), () =>
      service.updateSettings({ timezone: 'UTC' }, new Date('2026-09-25T10:00:00Z'))
    );
    expect(writes).toBe(1);
    const first = build(undefined, () => writes++);
    await expect(
      runWithContextAsync(ctx(), () => first.updateSettings({}, new Date('2026-09-25T10:00:00Z')))
    ).rejects.toBeInstanceOf(ConflictError);
    await runWithContextAsync(ctx(), () => first.updateSettings({}, null)); // "I saw nothing" on a company without a row is fine
    expect(writes).toBe(2);
  });

  it('refuses a caller without a company', async () => {
    const service = build(undefined);
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () => service.getSettings())
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('UpdateFleetSettingsRequestSchema', () => {
  it('accepts a valid partial body, coercing numbers', () => {
    const parsed = UpdateFleetSettingsRequestSchema.parse({
      timezone: 'Asia/Karachi',
      position_freshness_minutes: '20',
      utilisation_target_pct: null,
    });
    expect(parsed).toMatchObject({
      timezone: 'Asia/Karachi',
      position_freshness_minutes: 20,
      utilisation_target_pct: null,
    });
  });

  it('D-0192 (U1): unit_system accepts metric | us | uk, is optional, and is not nullable', () => {
    for (const unit of ['metric', 'us', 'uk'] as const)
      expect(UpdateFleetSettingsRequestSchema.parse({ unit_system: unit }).unit_system).toBe(unit);
    expect(UpdateFleetSettingsRequestSchema.parse({ timezone: 'UTC' }).unit_system).toBeUndefined();
    for (const bad of ['imperial', 'US', '', null, 1]) {
      const result = UpdateFleetSettingsRequestSchema.safeParse({ unit_system: bad });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('The selected unit system is invalid.');
    }
  });

  it.each([
    [
      'timezone',
      { timezone: 'Mars/Olympus' },
      'The timezone must be a valid IANA time zone name, for example Asia/Karachi.',
    ],
    ['freshness 0', { position_freshness_minutes: 0 }, undefined],
    ['freshness above a day', { position_freshness_minutes: 1441 }, undefined],
    ['scheduled hours above 24', { scheduled_hours_per_vehicle_per_day: 25 }, undefined],
    ['a percentage target above 100', { utilisation_target_pct: 101 }, undefined],
    ['a negative target', { cost_per_km_target: -1 }, undefined],
  ])('rejects %s', (_label, body, message) => {
    const result = UpdateFleetSettingsRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
    if (message) expect(result.error?.issues[0]?.message).toBe(message);
  });
});
