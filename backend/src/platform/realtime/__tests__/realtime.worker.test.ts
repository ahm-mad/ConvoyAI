import { describe, expect, it } from 'vitest';
import { processRealtimeJob } from '../realtime.worker.js';
import { REALTIME_EVENTS } from '../events.js';
import type { RealtimeEmitterPort } from '../emitter.js';

function fakeEmitter(): RealtimeEmitterPort & {
  calls: { userId: string; event: string; payload: unknown }[];
  companyCalls: { companyId: string; event: string; payload: unknown }[];
} {
  const calls: { userId: string; event: string; payload: unknown }[] = [];
  const companyCalls: { companyId: string; event: string; payload: unknown }[] = [];
  return {
    emitToUser: (userId, event, payload) => {
      calls.push({ userId, event, payload });
    },
    emitToCompany: (companyId, event, payload) => {
      companyCalls.push({ companyId, event, payload });
    },
    calls,
    companyCalls,
  };
}

describe('processRealtimeJob (module 2.6 realtime bridge, D-0066)', () => {
  it("'broadcast-packet' -> DEVICE_VALUE, to the job's own userId room", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'broadcast-packet',
        id: '1',
        data: { productId: 'p1', userId: 'u1', deviceId: 'd1', cleanedPacket: { temp: 21 } },
      },
      emitter
    );
    expect(emitter.calls).toEqual([
      {
        userId: 'u1',
        event: REALTIME_EVENTS.DEVICE_VALUE,
        payload: { deviceId: 'd1', productId: 'p1', cleanedPacket: { temp: 21 } },
      },
    ]);
  });

  it("'alarm-state' -> ALARM_STATE", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'alarm-state',
        id: '2',
        data: {
          ruleId: 'r1',
          deviceId: 'd1',
          userId: 'u1',
          state: 'alert',
          message: 'Rule X triggered alert',
        },
      },
      emitter
    );
    expect(emitter.calls).toEqual([
      {
        userId: 'u1',
        event: REALTIME_EVENTS.ALARM_STATE,
        payload: {
          ruleId: 'r1',
          deviceId: 'd1',
          state: 'alert',
          message: 'Rule X triggered alert',
        },
      },
    ]);
  });

  it("'initial-packet' -> PACKET_INITIAL", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      { name: 'initial-packet', id: '3', data: { productId: 'p1', userId: 'u1' } },
      emitter
    );
    expect(emitter.calls).toEqual([
      { userId: 'u1', event: REALTIME_EVENTS.PACKET_INITIAL, payload: { productId: 'p1' } },
    ]);
  });

  it("'notification' -> NOTIFICATION_NEW (D-0089, module 6.1)", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'notification',
        id: '6',
        data: {
          notificationId: 'n1',
          userId: 'u1',
          title: 'Rule Triggered: High Temp',
          message: 'Device 1 is hot',
        },
      },
      emitter
    );
    expect(emitter.calls).toEqual([
      {
        userId: 'u1',
        event: REALTIME_EVENTS.NOTIFICATION_NEW,
        payload: {
          notificationId: 'n1',
          title: 'Rule Triggered: High Temp',
          message: 'Device 1 is hot',
        },
      },
    ]);
  });

  it("'dashboard-update' -> DASHBOARD_UPDATE (D-0139)", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'dashboard-update',
        id: '7',
        data: {
          userId: 'u1',
          dashboardId: 'd1',
          widgets: [
            {
              widgetId: 'w1',
              values: [{ attribute_name: 'Temp', attribute_value: 90, is_alert: 1 }],
            },
          ],
        },
      },
      emitter
    );
    expect(emitter.calls).toEqual([
      {
        userId: 'u1',
        event: REALTIME_EVENTS.DASHBOARD_UPDATE,
        payload: {
          dashboardId: 'd1',
          widgets: [
            {
              widgetId: 'w1',
              values: [{ attribute_name: 'Temp', attribute_value: 90, is_alert: 1 }],
            },
          ],
        },
      },
    ]);
  });

  it("'building-update' -> BUILDING_UPDATE (D-0139)", () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'building-update',
        id: '8',
        data: {
          userId: 'u1',
          buildingId: '77',
          deviceId: 'd1',
          deviceIdentifier: 'abc-123',
          asset: { id: '77', name: 'HQ', children: [] },
        },
      },
      emitter
    );
    expect(emitter.calls).toEqual([
      {
        userId: 'u1',
        event: REALTIME_EVENTS.BUILDING_UPDATE,
        payload: {
          buildingId: '77',
          deviceId: 'd1',
          deviceIdentifier: 'abc-123',
          asset: { id: '77', name: 'HQ', children: [] },
        },
      },
    ]);
  });

  it('an unknown job name emits nothing and logs a warning instead of throwing', () => {
    const emitter = fakeEmitter();
    expect(() => {
      processRealtimeJob({ name: 'mystery-job', id: '4', data: {} }, emitter);
    }).not.toThrow();
    expect(emitter.calls).toHaveLength(0);
  });

  it('payload never leaks userId (redundant with the room identity, D-0066/realtime-channels.md §4)', () => {
    const emitter = fakeEmitter();
    processRealtimeJob(
      {
        name: 'broadcast-packet',
        id: '5',
        data: { productId: 'p1', userId: 'u1', deviceId: 'd1', cleanedPacket: {} },
      },
      emitter
    );
    expect(emitter.calls[0]?.payload).not.toHaveProperty('userId');
  });
});

describe('REALTIME_EVENTS (event-naming scheme, D-0066)', () => {
  it('one consistent concern:verb name per event, not the old per-resource-id-in-the-name convention', () => {
    expect(REALTIME_EVENTS.DEVICE_VALUE).toBe('device:value');
    expect(REALTIME_EVENTS.ALARM_STATE).toBe('alarm:state');
    expect(REALTIME_EVENTS.PACKET_INITIAL).toBe('packet:initial');
    expect(REALTIME_EVENTS.NOTIFICATION_NEW).toBe('notification:new');
    expect(REALTIME_EVENTS.DASHBOARD_UPDATE).toBe('dashboard:update');
    expect(REALTIME_EVENTS.BUILDING_UPDATE).toBe('building:update');
  });
});

describe('processRealtimeJob — fleet events go to the company room, never a user room (D-0161)', () => {
  it.each([
    ['fleet-position', REALTIME_EVENTS.FLEET_POSITION],
    ['geofence-event', REALTIME_EVENTS.GEOFENCE_EVENT],
    ['trip-update', REALTIME_EVENTS.TRIP_UPDATE],
  ] as const)(
    "'%s' -> %s, emitted to company:{companyId} with the payload untouched",
    (jobName, event) => {
      const emitter = fakeEmitter();
      const payload = { anything: 'the producer built', tripId: '7' };

      processRealtimeJob({ name: jobName, id: '1', data: { companyId: '42', payload } }, emitter);

      expect(emitter.companyCalls).toEqual([{ companyId: '42', event, payload }]);
      expect(emitter.calls).toEqual([]);
    }
  );

  it('the event names are the ones published in 05-fleet-api-design.md §7', () => {
    expect(REALTIME_EVENTS.FLEET_POSITION).toBe('fleet:position');
    expect(REALTIME_EVENTS.GEOFENCE_EVENT).toBe('geofence:event');
    expect(REALTIME_EVENTS.TRIP_UPDATE).toBe('trip:update');
  });
});

describe('processRealtimeJob — fleet:changed (D-0163)', () => {
  it("'fleet-changed' -> FLEET_CHANGED to company:{companyId}, payload untouched, never a user room", () => {
    const emitter = fakeEmitter();
    const payload = {
      entity: 'vehicle',
      id: '5',
      action: 'updated',
      occurredAt: '2026-09-24T09:00:00.000Z',
    };

    processRealtimeJob(
      { name: 'fleet-changed', id: '1', data: { companyId: '42', payload } },
      emitter
    );

    expect(emitter.companyCalls).toEqual([{ companyId: '42', event: 'fleet:changed', payload }]);
    expect(emitter.calls).toEqual([]);
    expect(REALTIME_EVENTS.FLEET_CHANGED).toBe('fleet:changed');
  });
});

describe('processRealtimeJob — fleet:status_summary (D-0185, A9)', () => {
  it("'fleet-status-summary' -> FLEET_STATUS_SUMMARY to company:{companyId}, payload untouched, never a user room", () => {
    const emitter = fakeEmitter();
    const payload = {
      total: 66,
      moving: 1,
      idle: 0,
      parked: 0,
      offline: 1,
      no_tracker: 64,
      occurredAt: '2026-09-25T09:00:00.000Z',
    };

    processRealtimeJob(
      { name: 'fleet-status-summary', id: '1', data: { companyId: '42', payload } },
      emitter
    );

    expect(emitter.companyCalls).toEqual([
      { companyId: '42', event: 'fleet:status_summary', payload },
    ]);
    expect(emitter.calls).toEqual([]);
    expect(REALTIME_EVENTS.FLEET_STATUS_SUMMARY).toBe('fleet:status_summary');
  });
});
