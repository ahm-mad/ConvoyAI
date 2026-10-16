import type { Job, Worker } from 'bullmq';
import { createWorker } from '../queue/queue-factory.js';
import { logger } from '../logging/logger.js';
import {
  REALTIME_EVENTS,
  type AlarmStateEvent,
  type BuildingUpdateEvent,
  type DashboardUpdateEvent,
  type DeviceValueEvent,
  type FleetChangedEvent,
  type FleetStatusSummaryEvent,
  type FleetPositionEvent,
  type GeofenceEventPayload,
  type NotificationEvent,
  type PacketInitialEvent,
  type TripUpdateEvent,
} from './events.js';
import type { RealtimeEmitterPort } from './emitter.js';

/**
 * The branching logic itself, factored out of `registerRealtimeWorker` so
 * it's unit-testable against a fake `RealtimeEmitterPort` with no real
 * BullMQ `Job`/Redis connection needed — only `job.name`/`job.data` are
 * read here.
 */
export function processRealtimeJob(
  job: Pick<Job, 'name' | 'data' | 'id'>,
  emitter: RealtimeEmitterPort
): void {
  switch (job.name) {
    case 'broadcast-packet': {
      const data = job.data as {
        productId: string;
        userId: string;
        deviceId: string;
        cleanedPacket: Record<string, unknown>;
      };
      const payload: DeviceValueEvent = {
        deviceId: data.deviceId,
        productId: data.productId,
        cleanedPacket: data.cleanedPacket,
      };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.DEVICE_VALUE, payload);
      return;
    }
    case 'alarm-state': {
      const data = job.data as {
        ruleId: string;
        deviceId: string;
        userId: string;
        state: 'alert' | 'normal';
        message: string;
      };
      const payload: AlarmStateEvent = {
        ruleId: data.ruleId,
        deviceId: data.deviceId,
        state: data.state,
        message: data.message,
      };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.ALARM_STATE, payload);
      return;
    }
    case 'initial-packet': {
      const data = job.data as { productId: string; userId: string };
      const payload: PacketInitialEvent = { productId: data.productId };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.PACKET_INITIAL, payload);
      return;
    }
    case 'notification': {
      const data = job.data as {
        notificationId: string;
        userId: string;
        title: string;
        message: string;
      };
      const payload: NotificationEvent = {
        notificationId: data.notificationId,
        title: data.title,
        message: data.message,
      };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.NOTIFICATION_NEW, payload);
      return;
    }
    case 'dashboard-update': {
      const data = job.data as {
        userId: string;
        dashboardId: string;
        widgets: DashboardUpdateEvent['widgets'];
      };
      const payload: DashboardUpdateEvent = {
        dashboardId: data.dashboardId,
        widgets: data.widgets,
      };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.DASHBOARD_UPDATE, payload);
      return;
    }
    case 'building-update': {
      const data = job.data as {
        userId: string;
        buildingId: string;
        deviceId: string;
        deviceIdentifier: string;
        asset: Record<string, unknown>;
      };
      const payload: BuildingUpdateEvent = {
        buildingId: data.buildingId,
        deviceId: data.deviceId,
        deviceIdentifier: data.deviceIdentifier,
        asset: data.asset,
      };
      emitter.emitToUser(data.userId, REALTIME_EVENTS.BUILDING_UPDATE, payload);
      return;
    }
    // D-0161 — fleet events: `{ companyId, payload }`, delivered to the `company:{companyId}` room.
    case 'fleet-position': {
      const data = job.data as { companyId: string; payload: FleetPositionEvent };
      emitter.emitToCompany(data.companyId, REALTIME_EVENTS.FLEET_POSITION, data.payload);
      return;
    }
    case 'geofence-event': {
      const data = job.data as { companyId: string; payload: GeofenceEventPayload };
      emitter.emitToCompany(data.companyId, REALTIME_EVENTS.GEOFENCE_EVENT, data.payload);
      return;
    }
    case 'trip-update': {
      const data = job.data as { companyId: string; payload: TripUpdateEvent };
      emitter.emitToCompany(data.companyId, REALTIME_EVENTS.TRIP_UPDATE, data.payload);
      return;
    }
    case 'fleet-changed': {
      const data = job.data as { companyId: string; payload: FleetChangedEvent };
      emitter.emitToCompany(data.companyId, REALTIME_EVENTS.FLEET_CHANGED, data.payload);
      return;
    }
    case 'fleet-status-summary': {
      const data = job.data as { companyId: string; payload: FleetStatusSummaryEvent };
      emitter.emitToCompany(data.companyId, REALTIME_EVENTS.FLEET_STATUS_SUMMARY, data.payload);
      return;
    }
    default:
      logger.warn(
        { jobName: job.name, jobId: job.id },
        'Unknown realtime job name — nothing emitted'
      );
  }
}

/**
 * The real `"realtime"` queue worker (ARCHITECTURE.md §8, D-0066/D-0067) —
 * replaces the last of `platform/queue/stub-processors.ts`'s log-only
 * stubs (module 2.5 already replaced `"rule-actions"`; that file is now
 * fully retired and deleted). Six job names land on this one queue
 * (module 2.4's `"broadcast-packet"`/`"dashboard-update"`/`"building-
 * update"` — the last two added D-0139 — 2.5's `"alarm-state"`, this
 * module's own `"initial-packet"` added to ingestion's entrypoint — see
 * `modules/ingestion/ingestion.service.ts` — and module 6.1's
 * `"notification"`, D-0089) — branches on `job.name` to know which typed
 * event to emit, since `Emitter`'s cross-process emit
 * (D-0067) has no way to introspect a job's origin queue/producer beyond
 * that.
 */
export function registerRealtimeWorker(emitter: RealtimeEmitterPort): Worker {
  return createWorker('realtime', job => {
    processRealtimeJob(job, emitter);
    return Promise.resolve();
  });
}
