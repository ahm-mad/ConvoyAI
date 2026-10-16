import type {
  FleetChangedEvent,
  FleetPositionEvent,
  FleetStatusSummaryEvent,
  GeofenceEventPayload,
  TripUpdateEvent,
} from '../events.js';
import type { FleetRealtimePort } from '../fleet-realtime.js';

/** Test double for `FleetRealtimePort` (D-0161): records every publication instead of touching BullMQ. */
export class RecordingFleetRealtime implements FleetRealtimePort {
  readonly positions: { companyId: string; payload: FleetPositionEvent }[] = [];
  readonly geofenceEvents: { companyId: string; payload: GeofenceEventPayload }[] = [];
  readonly tripUpdates: { companyId: string; payload: TripUpdateEvent }[] = [];
  readonly fleetChanges: { companyId: string; payload: FleetChangedEvent }[] = [];
  readonly statusSummaries: { companyId: string; payload: FleetStatusSummaryEvent }[] = [];

  publishPosition(companyId: string, payload: FleetPositionEvent): Promise<void> {
    this.positions.push({ companyId, payload });
    return Promise.resolve();
  }

  publishGeofenceEvent(companyId: string, payload: GeofenceEventPayload): Promise<void> {
    this.geofenceEvents.push({ companyId, payload });
    return Promise.resolve();
  }

  publishTripUpdate(companyId: string, payload: TripUpdateEvent): Promise<void> {
    this.tripUpdates.push({ companyId, payload });
    return Promise.resolve();
  }

  publishFleetStatusSummary(companyId: string, payload: FleetStatusSummaryEvent): Promise<void> {
    this.statusSummaries.push({ companyId, payload });
    return Promise.resolve();
  }

  publishFleetChanged(companyId: string, payload: FleetChangedEvent): Promise<void> {
    this.fleetChanges.push({ companyId, payload });
    return Promise.resolve();
  }
}
