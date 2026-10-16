import { NotFoundError } from '../../platform/errors/app-error.js';
import { pointInBbox, type Bbox } from '../../platform/http/bbox.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type {
  FleetPositionsDevicesLookup,
  FleetPositionsVehicleAssignmentLookup,
} from './fleet-positions.types.js';

type Json = Record<string, unknown>;

/**
 * Module 4.8 — `FleetController::positions()` ported exactly: latest
 * known position for every device whose product belongs to the caller's
 * company, each with its currently assigned vehicle (if any) so the map
 * can show "Truck 5" instead of a raw tracker identifier.
 */
export class FleetPositionsService {
  constructor(
    private readonly devicesLookup: FleetPositionsDevicesLookup,
    private readonly assignmentsLookup: FleetPositionsVehicleAssignmentLookup,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  /**
   * Frontend decision (D9, 2026-09-24): **assigned-only by default** — only trackers currently installed in a vehicle;
   * `includeUnassigned` restores Laravel's original "every device that has ever reported" behaviour (B6).
   */
  async positions(
    companyId: string,
    includeUnassigned = false,
    view: { bbox?: Bbox | undefined; limit?: number | undefined } = {}
  ): Promise<Json> {
    // D-0180 (B8): `meta` appears only when the caller asked for a viewport and/or a cap — otherwise the body is exactly as before.
    const withMeta = view.bbox !== undefined || view.limit !== undefined;
    const meta = (total: number, shown: number) =>
      withMeta ? { meta: { total, limit: view.limit ?? null, truncated: total > shown } } : {};
    const allDeviceIds = await this.devicesLookup.deviceIdsForCompany(companyId);
    if (allDeviceIds.length === 0) {
      return { success: true, message: 'No devices found.', data: [], ...meta(0, 0) };
    }

    const assignments = await this.assignmentsLookup.currentAssignmentsForDeviceIds(allDeviceIds);
    const assignedDeviceIds = new Set(assignments.map(assignment => assignment.deviceId));
    const deviceIds = includeUnassigned
      ? allDeviceIds
      : allDeviceIds.filter(id => assignedDeviceIds.has(id));
    if (deviceIds.length === 0) {
      return {
        success: true,
        message: 'Fleet positions retrieved successfully.',
        data: [],
        ...meta(0, 0),
      };
    }

    const latest = await this.devicesLookup.latestPositionsForDeviceIds(deviceIds);
    const inView = view.bbox
      ? latest.filter(p => pointInBbox(p.latitude, p.longitude, view.bbox as Bbox))
      : latest;
    // a cap keeps the most recently reported trackers (newest first); without one the order is untouched
    const positions =
      view.limit !== undefined && inView.length > view.limit
        ? [...inView]
            .sort(
              (a, b) =>
                b.recordedAt.getTime() - a.recordedAt.getTime() ||
                Number(BigInt(b.id) - BigInt(a.id))
            )
            .slice(0, view.limit)
        : inView;
    const devices = await this.devicesLookup.findBriefByIds(positions.map(p => p.deviceId));

    const deviceById = new Map(devices.map(device => [device.id, device]));
    const assignmentByDeviceId = new Map(
      assignments.map(assignment => [assignment.deviceId, assignment])
    );

    const shownDeviceIds = new Set(positions.map(position => position.deviceId));
    const vehicleIds = [
      ...new Set(
        assignments
          .filter(assignment => shownDeviceIds.has(assignment.deviceId))
          .map(assignment => assignment.vehicleId)
      ),
    ];
    const vehicles = await Promise.all(
      vehicleIds.map(id => this.assignmentsLookup.findVehicleById(id))
    );
    const vehicleById = new Map(
      vehicles
        .filter((vehicle): vehicle is NonNullable<typeof vehicle> => vehicle !== undefined)
        .map(v => [v.id, v])
    );

    // D-0183 (A4): how old the position is and whether it is still fresh under the company's threshold (the same one the dashboard's `offline` uses)
    const freshnessSeconds =
      (await this.settingsLookup.effectiveSettings()).positionFreshnessMinutes * 60;
    const nowMs = Date.now();

    const data = positions.map(position => {
      const device = deviceById.get(position.deviceId);
      const ageSeconds = Math.max(0, Math.floor((nowMs - position.recordedAt.getTime()) / 1000));
      const assignment = assignmentByDeviceId.get(position.deviceId);

      let currentVehicleAssignment: Json | null = null;
      if (assignment) {
        const vehicle = vehicleById.get(assignment.vehicleId);
        currentVehicleAssignment = {
          id: Number(assignment.id),
          vehicle_id: Number(assignment.vehicleId),
          device_id: Number(assignment.deviceId),
          assigned_at: assignment.assignedAt,
          unassigned_at: assignment.unassignedAt,
          created_at: assignment.createdAt,
          updated_at: assignment.updatedAt,
          vehicle: vehicle
            ? {
                id: Number(vehicle.id),
                name: vehicle.name,
                vehicle_category: vehicle.vehicleCategory,
              }
            : null,
        };
      }

      return {
        id: Number(position.id),
        device_id: Number(position.deviceId),
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        heading: position.heading,
        recorded_at: position.recordedAt,
        age_seconds: ageSeconds,
        fresh: ageSeconds <= freshnessSeconds,
        created_at: position.createdAt,
        updated_at: position.updatedAt,
        device: device
          ? {
              id: Number(device.id),
              name: device.name,
              device_unique_identifier: device.deviceUniqueIdentifier,
              product_id: Number(device.productId),
              current_vehicle_assignment: currentVehicleAssignment,
            }
          : null,
      };
    });

    return {
      success: true,
      message: 'Fleet positions retrieved successfully.',
      data,
      ...meta(inView.length, data.length),
    };
  }

  /** `FleetController::history` — the most recent `limit` (default 500, max 2000) positions of one company device, oldest → newest. */
  async history(companyId: string, deviceId: string, limit: number): Promise<Json> {
    if (!(await this.devicesLookup.deviceInCompany(companyId, deviceId))) {
      throw new NotFoundError('Device not found.');
    }
    const positions = await this.devicesLookup.positionHistory(deviceId, limit);
    return {
      success: true,
      message: 'Position history retrieved successfully.',
      data: positions.map(p => ({
        id: Number(p.id),
        device_id: Number(p.deviceId),
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        heading: p.heading,
        recorded_at: p.recordedAt,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
    };
  }
}
