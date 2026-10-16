import { getQueue } from '../queue/queue-factory.js';
import { logger } from '../logging/logger.js';
import type {
  FleetChangedEvent,
  FleetPositionEvent,
  FleetStatusSummaryEvent,
  GeofenceEventPayload,
  TripUpdateEvent,
} from './events.js';

/**
 * D-0161 (fleet completion step 6): the producer side of the three fleet socket events. Producers run in BOTH processes —
 * the ingestion worker (positions, geofence events, sensor stop updates, destination reached) and the HTTP process (manual
 * arrive/depart, trip start/complete/cancel) — so every producer does the same thing: put a job on the existing `"realtime"`
 * BullMQ queue; `realtime.worker.ts` (worker process) turns it into a Socket.IO emit through the Redis emitter (D-0067).
 * One path for everything, no in-process emits.
 *
 * **Publishing never fails the caller**: a realtime hiccup (Redis/queue down) must not turn a successful arrive/complete or a
 * processed packet into an error — it is logged and dropped (the frontend refetches on reconnect/focus and polls slowly anyway).
 */
export interface FleetRealtimePort {
  publishPosition(companyId: string, payload: FleetPositionEvent): Promise<void>;
  publishGeofenceEvent(companyId: string, payload: GeofenceEventPayload): Promise<void>;
  publishTripUpdate(companyId: string, payload: TripUpdateEvent): Promise<void>;
  /** D-0163: "a fleet record changed — refetch that list" (vehicle / driver / yard / yard slot / geofence). */
  publishFleetChanged(companyId: string, payload: FleetChangedEvent): Promise<void>;
  /** D-0185 (A9): the fleet status counts changed — sent by the scheduled status job only when they differ from the last announcement. */
  publishFleetStatusSummary(companyId: string, payload: FleetStatusSummaryEvent): Promise<void>;
}

export class BullMqFleetRealtime implements FleetRealtimePort {
  publishPosition(companyId: string, payload: FleetPositionEvent): Promise<void> {
    return this.add('fleet-position', companyId, payload);
  }

  publishGeofenceEvent(companyId: string, payload: GeofenceEventPayload): Promise<void> {
    return this.add('geofence-event', companyId, payload);
  }

  publishTripUpdate(companyId: string, payload: TripUpdateEvent): Promise<void> {
    return this.add('trip-update', companyId, payload);
  }

  publishFleetChanged(companyId: string, payload: FleetChangedEvent): Promise<void> {
    return this.add('fleet-changed', companyId, payload);
  }

  publishFleetStatusSummary(companyId: string, payload: FleetStatusSummaryEvent): Promise<void> {
    return this.add('fleet-status-summary', companyId, payload);
  }

  private async add(jobName: string, companyId: string, payload: unknown): Promise<void> {
    try {
      await getQueue('realtime').add(jobName, { companyId, payload });
    } catch (err) {
      logger.warn(
        { err, jobName, companyId },
        'Fleet realtime publish failed — dropped (never fails the caller)'
      );
    }
  }
}

/** For tests and for wiring points that have no realtime (nothing is emitted). */
export class NoopFleetRealtime implements FleetRealtimePort {
  publishPosition(): Promise<void> {
    return Promise.resolve();
  }
  publishGeofenceEvent(): Promise<void> {
    return Promise.resolve();
  }
  publishTripUpdate(): Promise<void> {
    return Promise.resolve();
  }
  publishFleetChanged(): Promise<void> {
    return Promise.resolve();
  }
  publishFleetStatusSummary(): Promise<void> {
    return Promise.resolve();
  }
}
