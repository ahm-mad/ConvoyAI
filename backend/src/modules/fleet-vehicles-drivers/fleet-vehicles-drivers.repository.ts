import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import {
  containsInsensitive,
  dateWithinDays,
  orderByWithTieBreak,
} from '../../platform/http/list-query.js';
import { LICENSE_EXPIRING_DAYS } from './fleet-vehicles-drivers.constants.js';
import {
  toVehicle,
  toDriver,
  toVehicleDeviceAssignment,
  toDriverVehicleAssignment,
  toDriverIncident,
  toMaintenanceSchedule,
  toMaintenanceLog,
  toFuelLog,
} from './fleet-vehicles-drivers.mapper.js';
import type {
  AssignmentHistoryFilters,
  CreateDriverInput,
  CreateIncidentInput,
  CreateVehicleInput,
  Driver,
  DriverIncident,
  DriverListQuery,
  DriverOption,
  FuelLogListQuery,
  IncidentListQuery,
  MaintenanceLogListQuery,
  DriverOptionsQuery,
  DriverVehicleAssignment,
  DevicePositionPoint,
  FuelLog,
  MaintenanceLog,
  MaintenanceSchedule,
  UpdateDriverInput,
  UpdateIncidentInput,
  UpdateVehicleInput,
  Vehicle,
  VehicleCurrentPosition,
  VehicleDeviceAssignment,
  VehicleListQuery,
  VehicleOption,
  VehicleOptionsQuery,
} from './fleet-vehicles-drivers.types.js';

/**
 * All Prisma access for module 4.1. `vehicles`/`drivers` are `company`-
 * ruled (tenant-rules.ts) — list/find/create rely on the default scoping
 * extension via the ambient request context. Every assignment/history/log
 * table below (`vehicle_device_assignments`, `driver_vehicle_assignments`,
 * `driver_incidents`, `vehicle_maintenance_schedules`,
 * `vehicle_maintenance_logs`, `fuel_logs`) is `parent`-ruled (no own
 * tenant column, schema-tables.md) — queried directly (the extension
 * passes `parent`-ruled models through unscoped by design), scoped in
 * practice by only ever being reached through an already company-scoped
 * `vehicle_id`/`driver_id` this repository or its caller already
 * verified. `device_positions` (also `parent`-ruled, registered by module
 * 2.3) is read the same way.
 */
export class FleetVehiclesDriversRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Vehicles
  // ===========================================================================

  /** The vehicle list's `where`. `forCounts` (D-0179, B7) leaves out `status` and `include_inactive` — a status chip must count every status. */
  private vehicleWhere(query: VehicleListQuery, forCounts = false): Prisma.vehiclesWhereInput {
    const and: Prisma.vehiclesWhereInput[] = [];
    if (!forCounts) {
      if (query.status) and.push({ lifecycle_status: query.status });
      else if (!query.includeInactive)
        and.push({ lifecycle_status: { notIn: ['retired', 'sold'] } });
    }
    // D-0167 (R2): category is free text — match it case-insensitively ("Van" = "van")
    if (query.vehicleCategory)
      and.push({ vehicle_category: { equals: query.vehicleCategory, mode: 'insensitive' } });
    if (query.fuelType) and.push({ fuel_type: query.fuelType });
    if (query.ownershipType) and.push({ ownership_type: query.ownershipType });
    if (query.hasTracker !== undefined) {
      and.push(
        query.hasTracker
          ? { vehicle_device_assignments: { some: { unassigned_at: null } } }
          : { vehicle_device_assignments: { none: { unassigned_at: null } } }
      );
    }
    if (query.hasDriver !== undefined) {
      and.push(
        query.hasDriver
          ? { driver_vehicle_assignments: { some: { unassigned_at: null } } }
          : { driver_vehicle_assignments: { none: { unassigned_at: null } } }
      );
    }
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({
        OR: [
          { name: term },
          { plate: term },
          { vin: term },
          { make: term },
          { model: term },
          { vehicle_category: term },
        ],
      });
    }
    return { AND: and };
  }

  /**
   * D-0162: `retired`/`sold` vehicles (a deactivated vehicle is `retired`) are left out of the default list — `?include_inactive=1`
   * brings them back. D-0164 (B1): search / filters / sort / optional paging; an explicit `status` wins over `include_inactive`.
   */
  async listVehicles(query: VehicleListQuery): Promise<{ items: Vehicle[]; total: number }> {
    const where = this.vehicleWhere(query);
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ name: 'asc' }],
      ['plate', 'odometer_km', 'created_at', 'year']
    ) as Prisma.vehiclesOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.vehicles.findMany({
        where,
        orderBy,
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : {}),
      }),
      query.window ? this.prisma.vehicles.count({ where }) : Promise.resolve(0),
    ]);
    return { items: rows.map(toVehicle), total: query.window ? total : rows.length };
  }

  /** D-0179 (B7): vehicles per `lifecycle_status` under the list's filters and search — `status` and `include_inactive` are ignored so every chip has its true count. */
  async vehicleStatusCounts(
    query: VehicleListQuery
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.vehicles.groupBy({
      by: ['lifecycle_status'],
      where: this.vehicleWhere(query, true),
      _count: { _all: true },
    });
    return rows.map(row => ({ status: row.lifecycle_status, count: row._count._all }));
  }

  /**
   * D-0167 (R2): the distinct vehicle categories in use in the caller's company, collapsed case-insensitively (the first spelling in
   * alphabetical order wins) and sorted, for a Category dropdown — `vehicle_category` is free text.
   */
  async distinctVehicleCategories(): Promise<string[]> {
    const rows = await this.prisma.vehicles.findMany({
      where: { vehicle_category: { not: null } },
      distinct: ['vehicle_category'],
      select: { vehicle_category: true },
      orderBy: { vehicle_category: 'asc' },
    });
    const byLower = new Map<string, string>();
    for (const row of rows) {
      const value = row.vehicle_category?.trim();
      if (value && !byLower.has(value.toLowerCase())) byLower.set(value.toLowerCase(), value);
    }
    return [...byLower.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }

  /**
   * D-0165 (B2): the vehicle picker — the same selection rules as `listVehicles` (active vehicles only, name order), capped at
   * `limit`, plus three flags a picker needs to grey rows out: an active driver, an installed tracker, a yard-slot check-in.
   */
  async vehicleOptions(
    query: VehicleOptionsQuery
  ): Promise<{ items: VehicleOption[]; total: number }> {
    const { items, total } = await this.listVehicles({
      includeInactive: query.includeInactive === true,
      search: query.search,
      hasDriver: query.hasDriver,
      hasTracker: query.hasTracker,
      window: { page: 1, perPage: query.limit },
    });
    return { items: await this.vehicleFlags(items), total };
  }

  /** The `has_driver` / `has_tracker` / `checked_in` flags for a batch of vehicles (three small queries, whatever the batch size) — shared by the options endpoint and the CSV export (D-0168). */
  async vehicleFlags(vehicles: Vehicle[]): Promise<VehicleOption[]> {
    const ids = vehicles.map(vehicle => BigInt(vehicle.id));
    const [drivers, trackers, parked] = await Promise.all([
      this.prisma.driver_vehicle_assignments.findMany({
        where: { vehicle_id: { in: ids }, unassigned_at: null },
        select: { vehicle_id: true },
      }),
      this.prisma.vehicle_device_assignments.findMany({
        where: { vehicle_id: { in: ids }, unassigned_at: null },
        select: { vehicle_id: true },
      }),
      this.prisma.yard_slot_events.findMany({
        where: { vehicle_id: { in: ids }, checked_out_at: null },
        select: { vehicle_id: true },
      }),
    ]);
    const withDriver = new Set(drivers.map(row => row.vehicle_id.toString()));
    const withTracker = new Set(trackers.map(row => row.vehicle_id.toString()));
    const checkedIn = new Set(parked.map(row => row.vehicle_id.toString()));
    return vehicles.map(vehicle => ({
      vehicle,
      hasDriver: withDriver.has(vehicle.id),
      hasTracker: withTracker.has(vehicle.id),
      checkedIn: checkedIn.has(vehicle.id),
    }));
  }

  /** D-0162 (`PUT /vehicles/{id}`) — only the fields that were sent. `lifecycle_status` is deliberately not editable here (deactivate/reactivate own it). */
  async updateVehicle(id: string, input: UpdateVehicleInput): Promise<Vehicle | undefined> {
    if (!(await this.findVehicleById(id))) return undefined;
    const data: Prisma.vehiclesUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.vehicleCategory !== undefined) data.vehicle_category = input.vehicleCategory;
    if (input.make !== undefined) data.make = input.make;
    if (input.model !== undefined) data.model = input.model;
    if (input.lengthM !== undefined) data.length_m = input.lengthM;
    if (input.widthM !== undefined) data.width_m = input.widthM;
    if (input.heightM !== undefined) data.height_m = input.heightM;
    if (input.acquisitionDate !== undefined) data.acquisition_date = input.acquisitionDate;
    if (input.acquisitionCost !== undefined) data.acquisition_cost = input.acquisitionCost;
    if (input.plate !== undefined) data.plate = input.plate;
    if (input.vin !== undefined) data.vin = input.vin;
    if (input.year !== undefined) data.year = input.year;
    if (input.fuelType !== undefined) data.fuel_type = input.fuelType;
    if (input.tankCapacityLiters !== undefined)
      data.tank_capacity_liters = input.tankCapacityLiters;
    if (input.odometerKm !== undefined) data.odometer_km = input.odometerKm;
    if (input.ownershipType !== undefined) data.ownership_type = input.ownershipType;
    if (input.costCentre !== undefined) data.cost_centre = input.costCentre;
    if (input.grossWeightKg !== undefined) data.gross_weight_kg = input.grossWeightKg;
    if (input.payloadKg !== undefined) data.payload_kg = input.payloadKg;
    const row = await this.prisma.vehicles.update({ where: { id: BigInt(id) }, data });
    return toVehicle(row);
  }

  async setVehicleLifecycleStatus(
    id: string,
    status: 'active' | 'retired'
  ): Promise<Vehicle | undefined> {
    if (!(await this.findVehicleById(id))) return undefined;
    const row = await this.prisma.vehicles.update({
      where: { id: BigInt(id) },
      data: { lifecycle_status: status },
    });
    return toVehicle(row);
  }

  /** `company_id` placeholder — always overwritten by the tenant-scoping extension from the caller's own context (same pattern as `ProductsRepository.create`). */
  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const row = await this.prisma.vehicles.create({
      data: {
        company_id: 0n,
        name: input.name,
        vehicle_category: input.vehicleCategory,
        make: input.make,
        model: input.model,
        length_m: input.lengthM,
        width_m: input.widthM,
        height_m: input.heightM,
        acquisition_date: input.acquisitionDate,
        acquisition_cost: input.acquisitionCost,
        plate: input.plate,
        vin: input.vin,
        year: input.year,
        fuel_type: input.fuelType,
        tank_capacity_liters: input.tankCapacityLiters,
        odometer_km: input.odometerKm,
        ownership_type: input.ownershipType,
        cost_centre: input.costCentre,
        gross_weight_kg: input.grossWeightKg,
        payload_kg: input.payloadKg,
      },
    });
    return toVehicle(row);
  }

  async findVehicleById(id: string): Promise<Vehicle | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.vehicles.findFirst({ where: { id: BigInt(id) } });
    return row ? toVehicle(row) : undefined;
  }

  /** D-0156: `POST /trips/{id}/complete` with `odometer_end_km` sets the vehicle's odometer to the operator's reading (owner D4). */
  async setOdometerKm(id: string, odometerKm: number): Promise<void> {
    if (!(await this.findVehicleById(id))) return;
    await this.prisma.vehicles.update({
      where: { id: BigInt(id) },
      data: { odometer_km: odometerKm },
    });
  }

  async updateVehicleImagePath(id: string, imagePath: string | null): Promise<Vehicle | undefined> {
    if (!(await this.findVehicleById(id))) return undefined;
    const row = await this.prisma.vehicles.update({
      where: { id: BigInt(id) },
      data: { image_path: imagePath },
    });
    return toVehicle(row);
  }

  // ===========================================================================
  // Vehicle <-> device assignment (append + close, never mutate a closed row)
  // ===========================================================================

  async currentDeviceAssignmentForVehicle(
    vehicleId: string
  ): Promise<VehicleDeviceAssignment | undefined> {
    const row = await this.prisma.vehicle_device_assignments.findFirst({
      where: { vehicle_id: BigInt(vehicleId), unassigned_at: null },
      orderBy: { assigned_at: 'desc' },
    });
    return row ? toVehicleDeviceAssignment(row) : undefined;
  }

  async vehicleHasActiveDeviceAssignment(vehicleId: string): Promise<boolean> {
    const count = await this.prisma.vehicle_device_assignments.count({
      where: { vehicle_id: BigInt(vehicleId), unassigned_at: null },
    });
    return count > 0;
  }

  /** Global — a tracker can only be installed in one vehicle system-wide, matching Laravel's own unscoped `deviceAlreadyInstalled` check exactly. */
  async deviceHasActiveAssignment(deviceId: string): Promise<boolean> {
    const count = await this.prisma.vehicle_device_assignments.count({
      where: { device_id: BigInt(deviceId), unassigned_at: null },
    });
    return count > 0;
  }

  /** Reverse of `currentDeviceAssignmentForVehicle` — `GeofenceService::checkPosition`'s device→vehicle resolution (module 4.3's `GeofencesVehicleAssignmentLookup`). Global, unscoped by device id, same discipline as `deviceHasActiveAssignment`. */
  async currentVehicleIdForDevice(deviceId: string): Promise<string | undefined> {
    const row = await this.prisma.vehicle_device_assignments.findFirst({
      where: { device_id: BigInt(deviceId), unassigned_at: null },
      orderBy: { assigned_at: 'desc' },
    });
    return row ? row.vehicle_id.toString() : undefined;
  }

  /** Batched `currentVehicleIdForDevice` — every currently-active assignment among the given device ids in one query, avoiding N+1 (module 4.8's `/fleet/positions`, `FleetController::positions()`'s `device.currentVehicleAssignment` eager load). */
  async currentAssignmentsForDeviceIds(deviceIds: string[]): Promise<VehicleDeviceAssignment[]> {
    if (deviceIds.length === 0) return [];
    const rows = await this.prisma.vehicle_device_assignments.findMany({
      where: { device_id: { in: deviceIds.map(id => BigInt(id)) }, unassigned_at: null },
    });
    return rows.map(toVehicleDeviceAssignment);
  }

  async createDeviceAssignment(
    vehicleId: string,
    deviceId: string
  ): Promise<VehicleDeviceAssignment> {
    const row = await this.prisma.vehicle_device_assignments.create({
      data: { vehicle_id: BigInt(vehicleId), device_id: BigInt(deviceId), assigned_at: new Date() },
    });
    return toVehicleDeviceAssignment(row);
  }

  async closeActiveDeviceAssignment(
    vehicleId: string
  ): Promise<VehicleDeviceAssignment | undefined> {
    const active = await this.prisma.vehicle_device_assignments.findFirst({
      where: { vehicle_id: BigInt(vehicleId), unassigned_at: null },
    });
    if (!active) return undefined;
    const row = await this.prisma.vehicle_device_assignments.update({
      where: { id: active.id },
      data: { unassigned_at: new Date() },
    });
    return toVehicleDeviceAssignment(row);
  }

  // ===========================================================================
  // Drivers
  // ===========================================================================

  /** The driver list's `where`. `forCounts` (D-0179, B7) leaves out `status` and `include_inactive`. */
  private driverWhere(query: DriverListQuery, forCounts = false): Prisma.driversWhereInput {
    const and: Prisma.driversWhereInput[] = [];
    if (!forCounts) {
      if (query.status) and.push({ status: query.status });
      else if (!query.includeInactive) and.push({ status: { not: 'inactive' } });
    }
    if (query.availabilityStatus) and.push({ availability_status: query.availabilityStatus });
    if (query.employmentStatus) and.push({ employment_status: query.employmentStatus });
    if (query.assigned !== undefined) {
      and.push(
        query.assigned
          ? { driver_vehicle_assignments: { some: { unassigned_at: null } } }
          : { driver_vehicle_assignments: { none: { unassigned_at: null } } }
      );
    }
    if (query.licenseExpiringWithinDays !== undefined) {
      const { from, to } = dateWithinDays(query.licenseExpiringWithinDays);
      and.push({ license_expiry_date: { gte: from, lte: to } });
    }
    if (query.licenseState) {
      const { from: today, to: soonEnd } = dateWithinDays(LICENSE_EXPIRING_DAYS);
      const byState: Record<
        NonNullable<DriverListQuery['licenseState']>,
        Prisma.driversWhereInput
      > = {
        expired: { license_expiry_date: { lt: today } },
        expiring: { license_expiry_date: { gte: today, lte: soonEnd } },
        valid: { license_expiry_date: { gt: soonEnd } },
        none: { license_expiry_date: null },
      };
      and.push(byState[query.licenseState]);
    }
    if (query.search) {
      const term = containsInsensitive(query.search);
      const parts = query.search.split(/\s+/).filter(Boolean);
      // "first last" / "last first" typed into one box: every word must match the first or last name.
      const nameMatch: Prisma.driversWhereInput = {
        AND: parts.map(part => {
          const word = containsInsensitive(part);
          return { OR: [{ first_name: word }, { last_name: word }] };
        }),
      };
      and.push({
        OR: [
          nameMatch,
          { first_name: term },
          { last_name: term },
          { license_number: term },
          { email: term },
          { phone: term },
        ],
      });
    }
    return { AND: and };
  }

  /**
   * D-0162: an explicit `status` filter wins; otherwise `inactive` (deactivated) drivers are left out unless `includeInactive`.
   * D-0164 (B1): search / filters / sort / optional paging. "Assigned" = an open `driver_vehicle_assignments` row.
   */
  async listDrivers(query: DriverListQuery): Promise<{ items: Driver[]; total: number }> {
    const where = this.driverWhere(query);
    const nameOrder = query.sortOrder ?? 'asc';
    const orderBy: Prisma.driversOrderByWithRelationInput[] =
      query.sortBy === 'name'
        ? [{ last_name: nameOrder }, { first_name: nameOrder }, { id: nameOrder }]
        : orderByWithTieBreak(
            query.sortBy,
            query.sortOrder,
            [{ last_name: 'asc' }],
            ['license_expiry_date', 'hire_date', 'created_at']
          );
    const [rows, total] = await Promise.all([
      this.prisma.drivers.findMany({
        where,
        orderBy,
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : {}),
      }),
      query.window ? this.prisma.drivers.count({ where }) : Promise.resolve(0),
    ]);
    return { items: rows.map(toDriver), total: query.window ? total : rows.length };
  }

  /** D-0179 (B7): drivers per `status` under the list's filters and search — `status` and `include_inactive` are ignored. */
  async driverStatusCounts(
    query: DriverListQuery
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.drivers.groupBy({
      by: ['status'],
      where: this.driverWhere(query, true),
      _count: { _all: true },
    });
    return rows.map(row => ({ status: row.status, count: row._count._all }));
  }

  /** D-0165 (B2): the driver picker — `active` drivers only (deactivated and suspended ones are not offered), last-name order, capped at `limit`, with an `assigned` (on a vehicle now) flag. */
  async driverOptions(
    query: DriverOptionsQuery
  ): Promise<{ items: DriverOption[]; total: number }> {
    const { items, total } = await this.listDrivers({
      includeInactive: query.includeInactive === true,
      // D-0171: active drivers only, unless the caller asked for inactive ones too (then every status is offered)
      status: query.includeInactive === true ? undefined : 'active',
      search: query.search,
      assigned: query.assigned,
      availabilityStatus: query.availabilityStatus,
      window: { page: 1, perPage: query.limit },
    });
    return { items: await this.driverFlags(items), total };
  }

  /** The `assigned` (on a vehicle now) flag for a batch of drivers — shared by the options endpoint and the CSV export (D-0168). */
  async driverFlags(drivers: Driver[]): Promise<DriverOption[]> {
    const assignments = await this.prisma.driver_vehicle_assignments.findMany({
      where: { driver_id: { in: drivers.map(driver => BigInt(driver.id)) }, unassigned_at: null },
      select: { driver_id: true },
    });
    const assigned = new Set(assignments.map(row => row.driver_id.toString()));
    return drivers.map(driver => ({ driver, assigned: assigned.has(driver.id) }));
  }

  /** D-0162 (`PUT /drivers/{id}`) — only the fields that were sent. `status` is not editable here (deactivate/reactivate own it). */
  async updateDriver(id: string, input: UpdateDriverInput): Promise<Driver | undefined> {
    if (!(await this.findDriverById(id))) return undefined;
    const data: Prisma.driversUpdateInput = {};
    if (input.firstName !== undefined) data.first_name = input.firstName;
    if (input.lastName !== undefined) data.last_name = input.lastName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.licenseNumber !== undefined) data.license_number = input.licenseNumber;
    if (input.licenseClass !== undefined) data.license_class = input.licenseClass;
    if (input.licenseExpiryDate !== undefined) data.license_expiry_date = input.licenseExpiryDate;
    if (input.hireDate !== undefined) data.hire_date = input.hireDate;
    if (input.employmentStatus !== undefined) data.employment_status = input.employmentStatus;
    if (input.availabilityStatus !== undefined) data.availability_status = input.availabilityStatus;
    if (input.certifications !== undefined) {
      data.certifications = input.certifications === null ? Prisma.DbNull : input.certifications;
    }
    if (input.payrollReference !== undefined) data.payroll_reference = input.payrollReference;
    const row = await this.prisma.drivers.update({ where: { id: BigInt(id) }, data });
    return toDriver(row);
  }

  async setDriverStatus(id: string, status: 'active' | 'inactive'): Promise<Driver | undefined> {
    if (!(await this.findDriverById(id))) return undefined;
    const row = await this.prisma.drivers.update({ where: { id: BigInt(id) }, data: { status } });
    return toDriver(row);
  }

  /** `company_id` placeholder — always overwritten by the tenant-scoping extension from the caller's own context (same pattern as `ProductsRepository.create`). */
  async createDriver(input: CreateDriverInput): Promise<Driver> {
    const row = await this.prisma.drivers.create({
      data: {
        company_id: 0n,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        license_number: input.licenseNumber,
        license_class: input.licenseClass,
        license_expiry_date: input.licenseExpiryDate,
        hire_date: input.hireDate,
        employment_status: input.employmentStatus,
        availability_status: input.availabilityStatus,
        certifications:
          input.certifications === null
            ? Prisma.DbNull
            : (input.certifications as Prisma.InputJsonValue),
        payroll_reference: input.payrollReference,
      },
    });
    return toDriver(row);
  }

  /** D-0174: lean driver / vehicle briefs for the incident responses — one query each for a whole page, company-scoped by the tenant extension (a foreign or unknown id is simply absent). */
  async driverBriefsByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; firstName: string; lastName: string }>> {
    const numeric = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    if (numeric.length === 0) return new Map();
    const rows = await this.prisma.drivers.findMany({
      where: { id: { in: numeric } },
      select: { id: true, first_name: true, last_name: true },
    });
    return new Map(
      rows.map(
        row =>
          [
            row.id.toString(),
            { id: row.id.toString(), firstName: row.first_name, lastName: row.last_name },
          ] as const
      )
    );
  }

  async vehicleBriefsByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; name: string; plate: string | null }>> {
    const numeric = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    if (numeric.length === 0) return new Map();
    const rows = await this.prisma.vehicles.findMany({
      where: { id: { in: numeric } },
      select: { id: true, name: true, plate: true },
    });
    return new Map(
      rows.map(
        row =>
          [row.id.toString(), { id: row.id.toString(), name: row.name, plate: row.plate }] as const
      )
    );
  }

  /**
   * D-0178 (C14): what still references this vehicle, as human labels — an EMPTY list means it was never used and may be hard-deleted.
   * (Trips block the delete at the database level; everything else would silently cascade away, so it is checked here, in one place.)
   */
  async vehicleUsage(id: string): Promise<string[]> {
    if (!/^\d+$/.test(id)) return [];
    const vehicleId = BigInt(id);
    const [
      trips,
      driverAssignments,
      trackerAssignments,
      fuelLogs,
      maintenanceLogs,
      schedules,
      incidents,
      geofenceEvents,
      yardCheckIns,
      documents,
    ] = await Promise.all([
      this.prisma.trips.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.driver_vehicle_assignments.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.vehicle_device_assignments.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.fuel_logs.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.vehicle_maintenance_logs.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.vehicle_maintenance_schedules.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.driver_incidents.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.geofence_events.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.yard_slot_events.count({ where: { vehicle_id: vehicleId } }),
      this.prisma.compliance_documents.count({
        where: { documentable_type: 'vehicle', documentable_id: vehicleId },
      }),
    ]);
    return [
      trips > 0 ? 'trips' : null,
      driverAssignments > 0 ? 'driver assignments' : null,
      trackerAssignments > 0 ? 'tracker assignments' : null,
      fuelLogs > 0 ? 'fuel logs' : null,
      maintenanceLogs > 0 ? 'maintenance logs' : null,
      schedules > 0 ? 'maintenance schedules' : null,
      incidents > 0 ? 'incidents' : null,
      geofenceEvents > 0 ? 'geofence events' : null,
      yardCheckIns > 0 ? 'yard check-ins' : null,
      documents > 0 ? 'compliance documents' : null,
    ].filter((label): label is string => label !== null);
  }

  /** D-0178 (C14): hard delete — the caller has already verified the vehicle is the caller's and never used (`vehicleUsage` is empty). */
  async deleteVehicle(id: string): Promise<boolean> {
    if (!(await this.findVehicleById(id))) return false;
    await this.prisma.vehicles.delete({ where: { id: BigInt(id) } });
    return true;
  }

  /** D-0178 (C14): what still references this driver, as human labels — empty = never used. */
  async driverUsage(id: string): Promise<string[]> {
    if (!/^\d+$/.test(id)) return [];
    const driverId = BigInt(id);
    const [trips, assignments, incidents, documents] = await Promise.all([
      this.prisma.trips.count({ where: { driver_id: driverId } }),
      this.prisma.driver_vehicle_assignments.count({ where: { driver_id: driverId } }),
      this.prisma.driver_incidents.count({ where: { driver_id: driverId } }),
      this.prisma.compliance_documents.count({
        where: { documentable_type: 'driver', documentable_id: driverId },
      }),
    ]);
    return [
      trips > 0 ? 'trips' : null,
      assignments > 0 ? 'vehicle assignments' : null,
      incidents > 0 ? 'incidents' : null,
      documents > 0 ? 'compliance documents' : null,
    ].filter((label): label is string => label !== null);
  }

  /** D-0178 (C14): hard delete — the caller has already verified the driver is the caller's and never used. */
  async deleteDriver(id: string): Promise<boolean> {
    if (!(await this.findDriverById(id))) return false;
    await this.prisma.drivers.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async findDriverById(id: string): Promise<Driver | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.drivers.findFirst({ where: { id: BigInt(id) } });
    return row ? toDriver(row) : undefined;
  }

  // ===========================================================================
  // Driver <-> vehicle assignment (append + close, never mutate a closed row)
  // ===========================================================================

  async currentAssignmentForDriver(driverId: string): Promise<DriverVehicleAssignment | undefined> {
    const row = await this.prisma.driver_vehicle_assignments.findFirst({
      where: { driver_id: BigInt(driverId), unassigned_at: null },
      orderBy: { assigned_at: 'desc' },
    });
    return row ? toDriverVehicleAssignment(row) : undefined;
  }

  async currentAssignmentForVehicle(
    vehicleId: string
  ): Promise<DriverVehicleAssignment | undefined> {
    const row = await this.prisma.driver_vehicle_assignments.findFirst({
      where: { vehicle_id: BigInt(vehicleId), unassigned_at: null },
      orderBy: { assigned_at: 'desc' },
    });
    return row ? toDriverVehicleAssignment(row) : undefined;
  }

  async driverHasActiveAssignment(driverId: string): Promise<boolean> {
    const count = await this.prisma.driver_vehicle_assignments.count({
      where: { driver_id: BigInt(driverId), unassigned_at: null },
    });
    return count > 0;
  }

  async createDriverVehicleAssignment(
    driverId: string,
    vehicleId: string,
    assignedBy: string,
    notes: string | null
  ): Promise<DriverVehicleAssignment> {
    const row = await this.prisma.driver_vehicle_assignments.create({
      data: {
        driver_id: BigInt(driverId),
        vehicle_id: BigInt(vehicleId),
        assigned_at: new Date(),
        assigned_by: BigInt(assignedBy),
        notes,
      },
    });
    return toDriverVehicleAssignment(row);
  }

  async closeActiveAssignmentForDriver(
    driverId: string,
    unassignedBy: string,
    notes: string | null
  ): Promise<DriverVehicleAssignment | undefined> {
    const active = await this.prisma.driver_vehicle_assignments.findFirst({
      where: { driver_id: BigInt(driverId), unassigned_at: null },
    });
    if (!active) return undefined;
    const row = await this.prisma.driver_vehicle_assignments.update({
      where: { id: active.id },
      data: {
        unassigned_at: new Date(),
        unassigned_by: BigInt(unassignedBy),
        notes: notes ?? active.notes,
      },
    });
    return toDriverVehicleAssignment(row);
  }

  /**
   * `TripService::incrementAssignmentMetrics` (module 4.2 fleet-trips) — a
   * targeted UPDATE (no read-modify-write) on the `driver_vehicle_
   * assignments` row that was open during the trip, matching Laravel's own
   * raw-SQL increment exactly (avoids a race under concurrent trip
   * completions). Kept here rather than in module 4.2's own repository
   * since this module owns `driver_vehicle_assignments` — exposed to 4.2
   * via `TripsAssignmentMetricsLookup` (interface-typed, CONVENTIONS.md
   * "Modules").
   */
  async incrementAssignmentMetrics(
    driverId: string,
    vehicleId: string,
    asOf: Date,
    distanceKm: number
  ): Promise<void> {
    await this.prisma.driver_vehicle_assignments.updateMany({
      where: {
        driver_id: BigInt(driverId),
        vehicle_id: BigInt(vehicleId),
        assigned_at: { lte: asOf },
        OR: [{ unassigned_at: null }, { unassigned_at: { gt: asOf } }],
      },
      data: {
        trip_count: { increment: 1 },
        distance_km: { increment: distanceKm },
      },
    });
  }

  // ===========================================================================
  // Assignment history (paginated) + summary aggregates
  // ===========================================================================

  /** `applyHistoryFilters`/`scopeInPeriod` (`DriverVehicleAssignment.php`) ported exactly. */
  private historyFilterWhere(
    filters: AssignmentHistoryFilters
  ): Prisma.driver_vehicle_assignmentsWhereInput {
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {};
    const { dateFrom, dateTo } = filters;
    if (dateFrom && dateTo) {
      where.assigned_at = { lte: new Date(dateTo) };
      where.OR = [{ unassigned_at: null }, { unassigned_at: { gte: new Date(dateFrom) } }];
    } else if (dateFrom) {
      where.OR = [{ unassigned_at: null }, { unassigned_at: { gte: new Date(dateFrom) } }];
    } else if (dateTo) {
      where.assigned_at = { lte: new Date(dateTo) };
    }
    if (!filters.includeActive) {
      where.unassigned_at = { not: null };
    }
    return where;
  }

  async listDriverAssignmentHistory(
    driverId: string,
    filters: AssignmentHistoryFilters,
    page: number,
    perPage: number
  ): Promise<{ items: DriverVehicleAssignment[]; total: number }> {
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {
      driver_id: BigInt(driverId),
      ...this.historyFilterWhere(filters),
    };
    const [rows, total] = await Promise.all([
      this.prisma.driver_vehicle_assignments.findMany({
        where,
        orderBy: { assigned_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.driver_vehicle_assignments.count({ where }),
    ]);
    return { items: rows.map(toDriverVehicleAssignment), total };
  }

  async listVehicleAssignmentHistory(
    vehicleId: string,
    filters: AssignmentHistoryFilters,
    page: number,
    perPage: number
  ): Promise<{ items: DriverVehicleAssignment[]; total: number }> {
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {
      vehicle_id: BigInt(vehicleId),
      ...this.historyFilterWhere(filters),
    };
    const [rows, total] = await Promise.all([
      this.prisma.driver_vehicle_assignments.findMany({
        where,
        orderBy: { assigned_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.driver_vehicle_assignments.count({ where }),
    ]);
    return { items: rows.map(toDriverVehicleAssignment), total };
  }

  /** `whereHas('driver', fn ($q) => $q->where('company_id', $companyId))` — scopes via the owning driver, matching Laravel exactly (`drivers` is company-scoped by its own tenant rule, this relation filter is not itself intercepted by the tenant-scoping extension, which only guards top-level model operations). */
  async listCompanyAssignmentHistory(
    companyId: string,
    filters: AssignmentHistoryFilters & {
      driverId: string | undefined;
      vehicleId: string | undefined;
    },
    page: number,
    perPage: number
  ): Promise<{ items: DriverVehicleAssignment[]; total: number }> {
    const statusWhere: Prisma.driver_vehicle_assignmentsWhereInput =
      filters.status === 'active'
        ? { unassigned_at: null }
        : filters.status === 'historical'
          ? { unassigned_at: { not: null } }
          : {};
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {
      drivers: { company_id: BigInt(companyId) },
      ...(filters.driverId ? { driver_id: BigInt(filters.driverId) } : {}),
      ...(filters.vehicleId ? { vehicle_id: BigInt(filters.vehicleId) } : {}),
      ...statusWhere,
      ...this.historyFilterWhere(filters),
    };
    const [rows, total] = await Promise.all([
      this.prisma.driver_vehicle_assignments.findMany({
        where,
        orderBy: { assigned_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.driver_vehicle_assignments.count({ where }),
    ]);
    return { items: rows.map(toDriverVehicleAssignment), total };
  }

  async driverAssignmentSummaryRows(
    driverId: string,
    filters: AssignmentHistoryFilters
  ): Promise<
    { assignedAt: Date; unassignedAt: Date | null; tripCount: number; distanceKm: number }[]
  > {
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {
      driver_id: BigInt(driverId),
      ...this.historyFilterWhere(filters),
    };
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where,
      select: { assigned_at: true, unassigned_at: true, trip_count: true, distance_km: true },
    });
    return rows.map(r => ({
      assignedAt: r.assigned_at,
      unassignedAt: r.unassigned_at,
      tripCount: r.trip_count,
      distanceKm: Number(r.distance_km),
    }));
  }

  async vehicleAssignmentSummaryRows(
    vehicleId: string,
    filters: AssignmentHistoryFilters
  ): Promise<
    { assignedAt: Date; unassignedAt: Date | null; tripCount: number; distanceKm: number }[]
  > {
    const where: Prisma.driver_vehicle_assignmentsWhereInput = {
      vehicle_id: BigInt(vehicleId),
      ...this.historyFilterWhere(filters),
    };
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where,
      select: { assigned_at: true, unassigned_at: true, trip_count: true, distance_km: true },
    });
    return rows.map(r => ({
      assignedAt: r.assigned_at,
      unassignedAt: r.unassigned_at,
      tripCount: r.trip_count,
      distanceKm: Number(r.distance_km),
    }));
  }

  /** Unfiltered by design — matches `DriverVehicleAssignment::forDriver($id)->distinct()->count('vehicle_id')` (Laravel's own `buildDriverSummary`/`buildVehicleSummary`), which does NOT apply the date-range filter to this particular count (Design notes: a real quirk in the old app, ported as-is). */
  async uniqueVehiclesForDriver(driverId: string): Promise<number> {
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where: { driver_id: BigInt(driverId) },
      distinct: ['vehicle_id'],
      select: { vehicle_id: true },
    });
    return rows.length;
  }

  async uniqueDriversForVehicle(vehicleId: string): Promise<number> {
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
      distinct: ['driver_id'],
      select: { driver_id: true },
    });
    return rows.length;
  }

  // ===========================================================================
  // Incidents
  // ===========================================================================

  async createIncident(
    driverId: string,
    loggedBy: string,
    input: CreateIncidentInput
  ): Promise<DriverIncident> {
    const row = await this.prisma.driver_incidents.create({
      data: {
        driver_id: BigInt(driverId),
        vehicle_id: input.vehicleId ? BigInt(input.vehicleId) : null,
        incident_type: input.incidentType,
        severity: input.severity,
        incident_date: input.incidentDate,
        description: input.description,
        logged_by: BigInt(loggedBy),
      },
    });
    return toDriverIncident(row);
  }

  /** D-0169 (B3): `driver_incidents` is `parent`-ruled (through its driver) — the caller verifies the driver belongs to the company. */
  async findIncidentById(id: string): Promise<DriverIncident | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.driver_incidents.findFirst({ where: { id: BigInt(id) } });
    return row ? toDriverIncident(row) : undefined;
  }

  async updateIncident(
    id: string,
    input: UpdateIncidentInput
  ): Promise<DriverIncident | undefined> {
    if (!(await this.findIncidentById(id))) return undefined;
    const data: Prisma.driver_incidentsUncheckedUpdateInput = {};
    if (input.vehicleId !== undefined)
      data.vehicle_id = input.vehicleId ? BigInt(input.vehicleId) : null;
    if (input.incidentType !== undefined) data.incident_type = input.incidentType;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.incidentDate !== undefined) data.incident_date = input.incidentDate;
    if (input.description !== undefined) data.description = input.description;
    const row = await this.prisma.driver_incidents.update({ where: { id: BigInt(id) }, data });
    return toDriverIncident(row);
  }

  async deleteIncident(id: string): Promise<boolean> {
    if (!(await this.findIncidentById(id))) return false;
    await this.prisma.driver_incidents.delete({ where: { id: BigInt(id) } });
    return true;
  }

  // ===========================================================================
  // Vehicle detail ("show()") — position/distance/speed analytics,
  // maintenance/fuel reads (module 18 owns the write-side of these two;
  // this module's `show()` only needs to read what's already there),
  // driver-assignment history.
  // ===========================================================================

  async positionsInWindow(
    deviceId: string,
    since: Date | undefined
  ): Promise<DevicePositionPoint[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId), ...(since ? { recorded_at: { gte: since } } : {}) },
      orderBy: { recorded_at: 'asc' },
    });
    return rows.map(r => ({
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed: r.speed !== null ? Number(r.speed) : null,
      recordedAt: r.recorded_at,
    }));
  }

  async latestPosition(deviceId: string): Promise<VehicleCurrentPosition | undefined> {
    const row = await this.prisma.device_positions.findFirst({
      where: { device_id: BigInt(deviceId) },
      orderBy: { recorded_at: 'desc' },
    });
    if (!row) return undefined;
    return {
      id: row.id.toString(),
      deviceId: row.device_id.toString(),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speed: row.speed !== null ? Number(row.speed) : null,
      heading: row.heading !== null ? Number(row.heading) : null,
      recordedAt: row.recorded_at,
    };
  }

  async maintenanceSchedulesForVehicle(vehicleId: string): Promise<MaintenanceSchedule[]> {
    const rows = await this.prisma.vehicle_maintenance_schedules.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
    });
    return rows.map(toMaintenanceSchedule);
  }

  async maintenanceLogsForVehicle(vehicleId: string, limit: number): Promise<MaintenanceLog[]> {
    const rows = await this.prisma.vehicle_maintenance_logs.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
      orderBy: { service_date: 'desc' },
      take: limit,
    });
    return rows.map(toMaintenanceLog);
  }

  async fuelLogsForVehicle(vehicleId: string, limit: number): Promise<FuelLog[]> {
    const rows = await this.prisma.fuel_logs.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
      orderBy: { fill_date: 'desc' },
      take: limit,
    });
    return rows.map(toFuelLog);
  }

  /** D-0170 (B9): the vehicle's maintenance logs, filtered / sorted / paged (the caller verified the vehicle belongs to the company). */
  async listMaintenanceLogsForVehicle(
    vehicleId: string,
    query: MaintenanceLogListQuery
  ): Promise<{ items: MaintenanceLog[]; total: number }> {
    const and: Prisma.vehicle_maintenance_logsWhereInput[] = [{ vehicle_id: BigInt(vehicleId) }];
    if (query.dateFrom) and.push({ service_date: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ service_date: { lte: query.dateTo } });
    if (query.maintenanceScheduleId !== undefined)
      and.push({ maintenance_schedule_id: BigInt(query.maintenanceScheduleId) });
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ service_type: term }, { vendor: term }, { notes: term }] });
    }
    const where: Prisma.vehicle_maintenance_logsWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ service_date: 'desc' }],
      ['cost', 'created_at']
    );
    const [rows, total] = await Promise.all([
      this.prisma.vehicle_maintenance_logs.findMany({
        where,
        orderBy,
        skip: (query.window.page - 1) * query.window.perPage,
        take: query.window.perPage,
      }),
      this.prisma.vehicle_maintenance_logs.count({ where }),
    ]);
    return { items: rows.map(toMaintenanceLog), total };
  }

  /** D-0170 (B9): the vehicle's fuel logs, filtered / sorted / paged. */
  async listFuelLogsForVehicle(
    vehicleId: string,
    query: FuelLogListQuery
  ): Promise<{ items: FuelLog[]; total: number }> {
    const and: Prisma.fuel_logsWhereInput[] = [{ vehicle_id: BigInt(vehicleId) }];
    if (query.dateFrom) and.push({ fill_date: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ fill_date: { lte: query.dateTo } });
    if (query.tripId !== undefined) and.push({ trip_id: BigInt(query.tripId) });
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ vendor: term }, { station_name: term }, { receipt_reference: term }] });
    }
    const where: Prisma.fuel_logsWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ fill_date: 'desc' }],
      ['cost', 'created_at']
    );
    const [rows, total] = await Promise.all([
      this.prisma.fuel_logs.findMany({
        where,
        orderBy,
        skip: (query.window.page - 1) * query.window.perPage,
        take: query.window.perPage,
      }),
      this.prisma.fuel_logs.count({ where }),
    ]);
    return { items: rows.map(toFuelLog), total };
  }

  /** D-0170 (B9): incidents, scoped either to a driver (`scope.driverId`) or to a vehicle (`scope.vehicleId`) — both already verified by the caller; D-0179 (B7): or to the whole company (`scope.companyId`). */
  async listIncidents(
    scope: { driverId?: string; vehicleId?: string; companyId?: string },
    query: IncidentListQuery
  ): Promise<{ items: DriverIncident[]; total: number }> {
    const and: Prisma.driver_incidentsWhereInput[] = [];
    // D-0179 (B7): `driver_incidents` has no company column (parent-ruled) — the company-wide list is scoped through the driver, explicitly
    if (scope.companyId) and.push({ drivers: { company_id: BigInt(scope.companyId) } });
    if (scope.driverId) and.push({ driver_id: BigInt(scope.driverId) });
    if (scope.vehicleId) and.push({ vehicle_id: BigInt(scope.vehicleId) });
    if (query.driverId !== undefined) and.push({ driver_id: BigInt(query.driverId) });
    if (query.vehicleId !== undefined) and.push({ vehicle_id: BigInt(query.vehicleId) });
    if (query.severity) and.push({ severity: query.severity });
    if (query.dateFrom) and.push({ incident_date: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ incident_date: { lte: query.dateTo } });
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ incident_type: term }, { description: term }] });
    }
    const where: Prisma.driver_incidentsWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ incident_date: 'desc' }],
      ['created_at']
    );
    const [rows, total] = await Promise.all([
      this.prisma.driver_incidents.findMany({
        where,
        orderBy,
        skip: (query.window.page - 1) * query.window.perPage,
        take: query.window.perPage,
      }),
      this.prisma.driver_incidents.count({ where }),
    ]);
    return { items: rows.map(toDriverIncident), total };
  }

  /** Full-tank fills with a real odometer reading, oldest-first — `FuelAnalyticsService::averageEconomyForVehicle`'s exact input set. */
  async fullTankFuelLogsForVehicle(vehicleId: string): Promise<FuelLog[]> {
    const rows = await this.prisma.fuel_logs.findMany({
      where: { vehicle_id: BigInt(vehicleId), is_full_tank: true, odometer_km: { not: null } },
      orderBy: { fill_date: 'asc' },
    });
    return rows.map(toFuelLog);
  }

  /** `limit` (D-0182, L6): the newest N only — the vehicle detail embeds 20, like its other lists; the full history is the paged `GET /vehicles/{id}/assignment-history`. */
  async driverAssignmentHistoryForVehicle(
    vehicleId: string,
    limit?: number
  ): Promise<DriverVehicleAssignment[]> {
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
      orderBy: [{ assigned_at: 'desc' }, { id: 'desc' }],
      ...(limit !== undefined ? { take: limit } : {}),
    });
    return rows.map(toDriverVehicleAssignment);
  }

  async recentAssignmentsForDriver(
    driverId: string,
    limit: number
  ): Promise<DriverVehicleAssignment[]> {
    const rows = await this.prisma.driver_vehicle_assignments.findMany({
      where: { driver_id: BigInt(driverId) },
      orderBy: { assigned_at: 'desc' },
      take: limit,
    });
    return rows.map(toDriverVehicleAssignment);
  }

  async recentIncidentsForDriver(driverId: string, limit: number): Promise<DriverIncident[]> {
    const rows = await this.prisma.driver_incidents.findMany({
      where: { driver_id: BigInt(driverId) },
      orderBy: { incident_date: 'desc' },
      take: limit,
    });
    return rows.map(toDriverIncident);
  }
}
