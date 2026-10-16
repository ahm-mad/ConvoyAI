import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetVehiclesDriversService } from '../fleet-vehicles-drivers.service.js';
import { RecordingFleetRealtime } from '../../../platform/realtime/__tests__/recording-fleet-realtime.js';
import {
  fakeFleetRepository,
  fakeDevicesLookup,
  fakeUsersLookup,
  fakeYardHistoryLookup,
  fakeTripsLookup,
} from './fakes.js';
import type { DriverOption, VehicleOption } from '../fleet-vehicles-drivers.types.js';
import type {
  CreateDriverInput,
  CreateVehicleInput,
  Driver,
  DriverVehicleAssignment,
  Vehicle,
  VehicleDeviceAssignment,
} from '../fleet-vehicles-drivers.types.js';

vi.mock('../../../platform/storage/r2-storage.js', () => ({
  uploadObject: vi.fn().mockResolvedValue({
    key: 'vehicles/new.png',
    url: 'https://images.example.com/vehicles/new.png',
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  keyFromUrl: (url: string) =>
    url.startsWith('https://images.example.com/')
      ? url.slice('https://images.example.com/'.length)
      : undefined,
}));

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: '1',
    companyId: '1',
    roles: [],
    perms: [],
    jti: 't',
    exp: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: '1',
    companyId: '1',
    name: 'Truck 1',
    vehicleCategory: null,
    make: null,
    model: null,
    plate: null,
    vin: null,
    year: null,
    fuelType: null,
    tankCapacityLiters: null,
    odometerKm: null,
    ownershipType: null,
    costCentre: null,
    lifecycleStatus: 'active',
    acquisitionDate: null,
    acquisitionCost: null,
    lengthM: null,
    widthM: null,
    heightM: null,
    grossWeightKg: null,
    payloadKg: null,
    imagePath: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: '1',
    companyId: '1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: null,
    phone: null,
    licenseNumber: null,
    licenseClass: null,
    licenseExpiryDate: null,
    status: 'active',
    employmentStatus: null,
    availabilityStatus: null,
    certifications: null,
    payrollReference: null,
    hireDate: null,
    photoPath: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeDeviceAssignment(
  overrides: Partial<VehicleDeviceAssignment> = {}
): VehicleDeviceAssignment {
  return {
    id: '1',
    vehicleId: '1',
    deviceId: '1',
    assignedAt: new Date('2026-09-01T00:00:00.000Z'),
    unassignedAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeDriverAssignment(
  overrides: Partial<DriverVehicleAssignment> = {}
): DriverVehicleAssignment {
  return {
    id: '1',
    driverId: '1',
    vehicleId: '1',
    assignedAt: new Date('2026-09-01T00:00:00.000Z'),
    unassignedAt: null,
    assignedBy: '1',
    unassignedBy: null,
    notes: null,
    tripCount: 0,
    distanceKm: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

const FULL_CREATE_VEHICLE_INPUT: CreateVehicleInput = {
  name: 'Truck 1',
  vehicleCategory: 'rigid',
  make: 'Volvo',
  model: 'FH16',
  lengthM: 10,
  widthM: 2.5,
  heightM: 3.5,
  acquisitionDate: new Date('2026-01-01'),
  acquisitionCost: 100000,
  plate: 'ABC-123',
  vin: '1HGCM82633A004352',
  year: 2024,
  fuelType: 'diesel',
  tankCapacityLiters: 400,
  odometerKm: 1200,
  ownershipType: 'owned',
  costCentre: 'CC-1',
  grossWeightKg: 26000,
  payloadKg: 15000,
};

const FULL_CREATE_DRIVER_INPUT: CreateDriverInput = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '555-0100',
  licenseNumber: 'L123',
  licenseClass: 'C',
  licenseExpiryDate: new Date('2027-01-01'),
  hireDate: new Date('2025-01-01'),
  employmentStatus: 'full_time',
  availabilityStatus: 'available',
  certifications: [{ name: 'HazMat', issued_date: '2025-01-01' }],
  payrollReference: 'PR-1',
};

describe('FleetVehiclesDriversService.createVehicle', () => {
  it('wires every extend_vehicles field through to the repository (KNOWN_ISSUES 11.3)', async () => {
    let received: CreateVehicleInput | undefined;
    const repo = fakeFleetRepository({
      createVehicle: input => {
        received = input;
        return Promise.resolve(makeVehicle());
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await runWithContextAsync(ctx(), () => service.createVehicle(FULL_CREATE_VEHICLE_INPUT));

    expect(received).toEqual(FULL_CREATE_VEHICLE_INPUT);
  });
});

describe('FleetVehiclesDriversService.createDriver', () => {
  it('wires every extend_drivers field through to the repository (KNOWN_ISSUES 11.3)', async () => {
    let received: CreateDriverInput | undefined;
    const repo = fakeFleetRepository({
      createDriver: input => {
        received = input;
        return Promise.resolve(makeDriver());
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await runWithContextAsync(ctx(), () => service.createDriver(FULL_CREATE_DRIVER_INPUT));

    expect(received).toEqual(FULL_CREATE_DRIVER_INPUT);
  });
});

describe('FleetVehiclesDriversService.assignDevice', () => {
  it("rejects when the device does not belong to the caller (tightened past Laravel's bare exists:devices,id)", async () => {
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
    });
    const devicesLookup = fakeDevicesLookup({ findAuthorized: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.assignDevice('1', '99'))).rejects.toThrow(
      ValidationError
    );
  });

  it('rejects when the vehicle already has an active tracker', async () => {
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      vehicleHasActiveDeviceAssignment: () => Promise.resolve(true),
    });
    const devicesLookup = fakeDevicesLookup({
      findAuthorized: () => Promise.resolve({ id: '99' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.assignDevice('1', '99'))).rejects.toThrow(
      /already has an active tracker/
    );
  });

  it('rejects when the device is already installed in another vehicle', async () => {
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      vehicleHasActiveDeviceAssignment: () => Promise.resolve(false),
      deviceHasActiveAssignment: () => Promise.resolve(true),
    });
    const devicesLookup = fakeDevicesLookup({
      findAuthorized: () => Promise.resolve({ id: '99' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.assignDevice('1', '99'))).rejects.toThrow(
      /already installed in another vehicle/
    );
  });

  it('creates the assignment on success', async () => {
    let created: { vehicleId: string; deviceId: string } | undefined;
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      vehicleHasActiveDeviceAssignment: () => Promise.resolve(false),
      deviceHasActiveAssignment: () => Promise.resolve(false),
      createDeviceAssignment: (vehicleId, deviceId) => {
        created = { vehicleId, deviceId };
        return Promise.resolve(makeDeviceAssignment({ vehicleId, deviceId }));
      },
    });
    const devicesLookup = fakeDevicesLookup({
      findAuthorized: () => Promise.resolve({ id: '99' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () => service.assignDevice('1', '99'));

    expect(created).toEqual({ vehicleId: '1', deviceId: '99' });
    expect(result.success).toBe(true);
  });

  it("throws NotFoundError when the vehicle does not belong to the caller's company", async () => {
    const repo = fakeFleetRepository({ findVehicleById: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.assignDevice('1', '99'))).rejects.toThrow(
      NotFoundError
    );
  });
});

describe('FleetVehiclesDriversService.unassignDevice', () => {
  it('rejects when there is no active tracker to unassign', async () => {
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      closeActiveDeviceAssignment: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.unassignDevice('1'))).rejects.toThrow(
      /no active tracker/
    );
  });

  it('closes the assignment (never deletes it) on success', async () => {
    const closed = makeDeviceAssignment({ unassignedAt: new Date('2026-09-15T00:00:00.000Z') });
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      closeActiveDeviceAssignment: () => Promise.resolve(closed),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () => service.unassignDevice('1'));

    expect(result.success).toBe(true);
    expect((result.data as { unassigned_at: Date }).unassigned_at).toEqual(closed.unassignedAt);
  });
});

describe('FleetVehiclesDriversService.assignVehicleToDriver', () => {
  it("rejects when the vehicle does not belong to the caller's company (tightened past Laravel's bare exists:vehicles,id)", async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      runWithContextAsync(ctx(), () => service.assignVehicleToDriver('1', '99', null))
    ).rejects.toThrow(ValidationError);
  });

  it('rejects when the driver already has an active vehicle assignment', async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(makeVehicle()),
      driverHasActiveAssignment: () => Promise.resolve(true),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      runWithContextAsync(ctx(), () => service.assignVehicleToDriver('1', '99', null))
    ).rejects.toThrow(/already assigned to a vehicle/);
  });

  it('D-0151: rejects when the vehicle already has an active driver (one active driver per vehicle), with the fixed message and nothing created', async () => {
    let created = false;
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(makeVehicle({ id: '99' })),
      driverHasActiveAssignment: () => Promise.resolve(false),
      currentAssignmentForVehicle: () =>
        Promise.resolve(makeDriverAssignment({ driverId: '7', vehicleId: '99' })),
      createDriverVehicleAssignment: () => {
        created = true;
        return Promise.resolve(makeDriverAssignment());
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const error = await runWithContextAsync(ctx(), () =>
      service.assignVehicleToDriver('1', '99', null)
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(
      'This vehicle already has an active driver. Unassign them first.'
    );
    expect(created).toBe(false);
  });

  it('creates the assignment on success', async () => {
    let created:
      { driverId: string; vehicleId: string; assignedBy: string; notes: string | null } | undefined;
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(makeVehicle({ id: '99' })),
      driverHasActiveAssignment: () => Promise.resolve(false),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
      createDriverVehicleAssignment: (driverId, vehicleId, assignedBy, notes) => {
        created = { driverId, vehicleId, assignedBy, notes };
        return Promise.resolve(makeDriverAssignment({ driverId, vehicleId, assignedBy }));
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx({ userId: '7' }), () =>
      service.assignVehicleToDriver('1', '99', 'note')
    );

    expect(created).toEqual({ driverId: '1', vehicleId: '99', assignedBy: '7', notes: 'note' });
    expect(result.success).toBe(true);
  });
});

describe('FleetVehiclesDriversService.unassignVehicleFromDriver', () => {
  it('rejects when the driver has no active vehicle assignment', async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      closeActiveAssignmentForDriver: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      runWithContextAsync(ctx(), () => service.unassignVehicleFromDriver('1', null))
    ).rejects.toThrow(/no active vehicle assignment/);
  });

  it('closes the assignment (never deletes it) on success', async () => {
    const closed = makeDriverAssignment({
      unassignedAt: new Date('2026-09-15T00:00:00.000Z'),
      unassignedBy: '7',
    });
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      closeActiveAssignmentForDriver: () => Promise.resolve(closed),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx({ userId: '7' }), () =>
      service.unassignVehicleFromDriver('1', null)
    );

    expect(result.success).toBe(true);
    expect((result.data as unknown as { unassigned_by: string | null }).unassigned_by).toBe('7');
  });
});

describe('FleetVehiclesDriversService.storeIncident', () => {
  it("throws NotFoundError when the driver does not belong to the caller's company", async () => {
    const repo = fakeFleetRepository({ findDriverById: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeIncident('1', {
          vehicleId: null,
          incidentType: 'speeding',
          severity: 'minor',
          incidentDate: new Date('2026-09-01'),
          description: null,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('logs the incident against the caller on success', async () => {
    let loggedBy: string | undefined;
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      createIncident: (_driverId, loggedById, input) => {
        loggedBy = loggedById;
        return Promise.resolve({
          id: '1',
          driverId: '1',
          vehicleId: input.vehicleId,
          incidentType: input.incidentType,
          severity: input.severity,
          incidentDate: input.incidentDate,
          description: input.description,
          loggedBy: loggedById,
          createdAt: null,
          updatedAt: null,
          updatedBy: null,
        });
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx({ userId: '42' }), () =>
      service.storeIncident('1', {
        vehicleId: null,
        incidentType: 'speeding',
        severity: 'minor',
        incidentDate: new Date('2026-09-01'),
        description: null,
      })
    );

    expect(loggedBy).toBe('42');
    expect(result.success).toBe(true);
  });

  it("throws ValidationError when vehicleId does not belong to the caller's company", async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeIncident('1', {
          vehicleId: '999',
          incidentType: 'speeding',
          severity: 'minor',
          incidentDate: new Date('2026-09-01'),
          description: null,
        })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("accepts a vehicleId that belongs to the caller's company", async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(makeVehicle()),
      createIncident: (_driverId, loggedById, input) =>
        Promise.resolve({
          id: '1',
          driverId: '1',
          vehicleId: input.vehicleId,
          incidentType: input.incidentType,
          severity: input.severity,
          incidentDate: input.incidentDate,
          description: input.description,
          loggedBy: loggedById,
          createdAt: null,
          updatedAt: null,
          updatedBy: null,
        }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx({ userId: '42' }), () =>
      service.storeIncident('1', {
        vehicleId: '5',
        incidentType: 'speeding',
        severity: 'minor',
        incidentDate: new Date('2026-09-01'),
        description: null,
      })
    );

    expect(result.success).toBe(true);
  });
});

describe('FleetVehiclesDriversService.getVehicle / getDriver', () => {
  it("throws NotFoundError for a vehicle outside the caller's company", async () => {
    const repo = fakeFleetRepository({ findVehicleById: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.getVehicle('1'))).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws NotFoundError for a driver outside the caller's company", async () => {
    const repo = fakeFleetRepository({ findDriverById: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(runWithContextAsync(ctx(), () => service.getDriver('1'))).rejects.toThrow(
      NotFoundError
    );
  });

  it('computes distance/speed stats (VehicleAnalyticsService port) and fuel economy (FuelAnalyticsService port)', async () => {
    const positions = [
      { latitude: 0, longitude: 0, speed: 10, recordedAt: new Date('2026-09-10T00:00:00.000Z') },
      { latitude: 0.01, longitude: 0, speed: 20, recordedAt: new Date('2026-09-10T01:00:00.000Z') },
    ];
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      currentDeviceAssignmentForVehicle: () => Promise.resolve(makeDeviceAssignment()),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
      latestPosition: () => Promise.resolve(undefined),
      positionsInWindow: () => Promise.resolve(positions),
      maintenanceSchedulesForVehicle: () =>
        Promise.resolve([
          {
            id: '1',
            vehicleId: '1',
            serviceType: 'Oil change',
            intervalDays: 90,
            intervalKm: null,
            lastServiceDate: null,
            odometerBaselineKm: null,
            odometerBaselineDate: null,
            lastServiceOdometerKm: null,
            createdAt: null,
            updatedAt: null,
            createdBy: null,
            updatedBy: null,
          },
        ]),
      maintenanceLogsForVehicle: () =>
        Promise.resolve([
          {
            id: '1',
            vehicleId: '1',
            maintenanceScheduleId: null,
            serviceType: 'Oil change',
            serviceDate: new Date('2026-09-01'),
            odometerKm: null,
            cost: null,
            vendor: null,
            notes: null,
            loggedBy: null,
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
        ]),
      fuelLogsForVehicle: () =>
        Promise.resolve([
          {
            id: '1',
            vehicleId: '1',
            fillDate: new Date('2026-09-01'),
            volume: 40,
            unit: 'liters' as const,
            cost: null,
            odometerKm: 1000,
            isFullTank: true,
            vendor: null,
            loggedBy: null,
            stationName: null,
            unitPrice: null,
            totalCost: null,
            paymentMethod: null,
            receiptReference: null,
            tripId: null,
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
        ]),
      driverAssignmentHistoryForVehicle: () => Promise.resolve([makeDriverAssignment()]),
      findDriverById: () => Promise.resolve(makeDriver()),
      fullTankFuelLogsForVehicle: () =>
        Promise.resolve([
          {
            id: '1',
            vehicleId: '1',
            fillDate: new Date('2026-09-01'),
            volume: 40,
            unit: 'liters' as const,
            cost: null,
            odometerKm: 1000,
            isFullTank: true,
            vendor: null,
            loggedBy: null,
            stationName: null,
            unitPrice: null,
            totalCost: null,
            paymentMethod: null,
            receiptReference: null,
            tripId: null,
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
          {
            id: '2',
            vehicleId: '1',
            fillDate: new Date('2026-09-10'),
            volume: 40,
            unit: 'liters' as const,
            cost: null,
            odometerKm: 1400,
            isFullTank: true,
            vendor: null,
            loggedBy: null,
            stationName: null,
            unitPrice: null,
            totalCost: null,
            paymentMethod: null,
            receiptReference: null,
            tripId: null,
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
        ]),
    });
    const devicesLookup = fakeDevicesLookup({
      findByIdUnscoped: () =>
        Promise.resolve({ id: '1', name: 'Tracker', deviceUniqueIdentifier: 'dev-1' }),
    });
    const usersLookup = fakeUsersLookup({
      findContactById: () => Promise.resolve({ id: '1', firstName: 'Boss', lastName: 'Person' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      usersLookup,
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () => service.getVehicle('1'));

    const stats = result.data.stats as {
      distance_km_7d: number;
      avg_speed_kmh_7d: number;
      max_speed_kmh_7d: number;
    };
    expect(stats.distance_km_7d).toBeCloseTo(1.11, 1);
    expect(stats.avg_speed_kmh_7d).toBe(15);
    expect(stats.max_speed_kmh_7d).toBe(20);

    const fuelEconomy = result.data.fuel_economy as {
      economy: number;
      unit: string;
      pairs_used: number;
    };
    expect(fuelEconomy).toEqual({ economy: 10, unit: 'km/L', pairs_used: 1 });

    expect(result.data.maintenance_schedules).toHaveLength(1);
    expect(result.data.maintenance_logs).toHaveLength(1);
    expect(result.data.fuel_logs).toHaveLength(1);
    expect(result.data.yard_history).toEqual([]);
    const history = result.data.driver_assignment_history as {
      driver: unknown;
      assigned_by: unknown;
    }[];
    expect(history).toHaveLength(1);
    expect(history[0]?.driver).toMatchObject({ first_name: 'Jane' });
    expect(history[0]?.assigned_by).toMatchObject({ first_name: 'Boss' });
  });
});

describe('FleetVehiclesDriversService.listVehicles / listDrivers', () => {
  it("composes each vehicle's current device/driver assignment", async () => {
    const repo = fakeFleetRepository({
      listVehicles: () => Promise.resolve({ items: [makeVehicle()], total: 1 }),
      currentDeviceAssignmentForVehicle: () => Promise.resolve(makeDeviceAssignment()),
      currentAssignmentForVehicle: () => Promise.resolve(makeDriverAssignment()),
      findDriverById: () => Promise.resolve(makeDriver()),
    });
    const devicesLookup = fakeDevicesLookup({
      findByIdUnscoped: () =>
        Promise.resolve({ id: '1', name: 'Tracker', deviceUniqueIdentifier: 'dev-1' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      devicesLookup,
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicles({ includeInactive: false })
    );

    const vehicle = (result.data as Record<string, unknown>[])[0] as {
      current_device_assignment: unknown;
      current_driver_assignment: unknown;
    };
    expect(vehicle.current_device_assignment).toMatchObject({
      device: { id: '1', name: 'Tracker' },
    });
    expect(vehicle.current_driver_assignment).toMatchObject({ driver: { first_name: 'Jane' } });
  });

  it("composes each driver's current vehicle assignment", async () => {
    const repo = fakeFleetRepository({
      listDrivers: () => Promise.resolve({ items: [makeDriver()], total: 1 }),
      currentAssignmentForDriver: () => Promise.resolve(makeDriverAssignment()),
      findVehicleById: () => Promise.resolve(makeVehicle()),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listDrivers({ includeInactive: false })
    );

    const driver = (result.data as Record<string, unknown>[])[0] as { current_assignment: unknown };
    expect(driver.current_assignment).toMatchObject({ vehicle: { name: 'Truck 1' } });
  });
});

describe('FleetVehiclesDriversService list paging (D-0164, B1)', () => {
  it('returns the flat array when no paging window is requested and passes the query through', async () => {
    const listVehicles = vi.fn(() => Promise.resolve({ items: [makeVehicle()], total: 1 }));
    const repo = fakeFleetRepository({
      listVehicles,
      currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicles({
        includeInactive: false,
        search: 'truck',
        sortBy: 'name',
        sortOrder: 'desc',
      })
    );

    expect(Array.isArray(result.data)).toBe(true);
    expect(listVehicles).toHaveBeenCalledWith({
      includeInactive: false,
      search: 'truck',
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });

  it('wraps vehicles in { items, pagination } when a window is requested', async () => {
    const repo = fakeFleetRepository({
      listVehicles: () => Promise.resolve({ items: [makeVehicle()], total: 41 }),
      currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicles({ includeInactive: false, window: { page: 2, perPage: 20 } })
    );

    expect(result.data).toMatchObject({
      pagination: { page: 2, per_page: 20, total: 41, total_pages: 3 },
    });
    expect((result.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it('wraps drivers in { items, pagination } when a window is requested', async () => {
    const repo = fakeFleetRepository({
      listDrivers: () => Promise.resolve({ items: [makeDriver()], total: 1 }),
      currentAssignmentForDriver: () => Promise.resolve(undefined),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listDrivers({ includeInactive: false, window: { page: 1, perPage: 20 } })
    );

    expect(result.data).toMatchObject({
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    });
  });
});

describe('FleetVehiclesDriversService.vehicleOptions / driverOptions (D-0165, B2)', () => {
  it('returns a flat lean array plus meta { total, limit, truncated }', async () => {
    const repo = fakeFleetRepository({
      vehicleOptions: () =>
        Promise.resolve({
          items: [{ vehicle: makeVehicle(), hasDriver: true, hasTracker: false, checkedIn: false }],
          total: 5,
        }),
      driverOptions: () =>
        Promise.resolve({ items: [{ driver: makeDriver(), assigned: false }], total: 1 }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const vehicles = await runWithContextAsync(ctx(), () => service.vehicleOptions({ limit: 1 }));
    expect(vehicles.meta).toEqual({ total: 5, limit: 1, truncated: true });
    expect(vehicles.data).toEqual([
      expect.objectContaining({
        id: '1',
        name: 'Truck 1',
        has_driver: true,
        has_tracker: false,
        checked_in: false,
      }),
    ]);
    expect(Object.keys((vehicles.data as Record<string, unknown>[])[0] ?? {})).not.toContain(
      'odometer_km'
    ); // lean

    const drivers = await runWithContextAsync(ctx(), () => service.driverOptions({ limit: 1000 }));
    expect(drivers.meta).toEqual({ total: 1, limit: 1000, truncated: false });
    expect(drivers.data).toEqual([
      expect.objectContaining({ first_name: 'Jane', name: 'Jane Doe', assigned: false }),
    ]);
  });
});

describe('FleetVehiclesDriversService.bulkVehicles / bulkDrivers (D-0166, B10)', () => {
  const build = (repoOverrides: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it('ids mode: runs each vehicle through the single-vehicle action, reports per-record results (changed + label), skips one already in the target state, never lists', async () => {
    const listVehicles = vi.fn();
    const service = build({
      listVehicles,
      findVehicleById: (id: string) =>
        Promise.resolve(
          id === '9'
            ? undefined
            : makeVehicle({
                id,
                name: `Truck ${id}`,
                lifecycleStatus: id === '4' ? 'retired' : 'active',
              })
        ),
    });
    const deactivate = vi.spyOn(service, 'deactivateVehicle').mockImplementation((id: string) =>
      id === '2'
        ? Promise.reject(
            new ValidationError(
              "Unassign this vehicle's driver and tracker before deactivating it."
            )
          )
        : Promise.resolve({
            success: true,
            message: 'Vehicle deactivated successfully.',
            data: {},
          })
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.bulkVehicles('deactivate', { ids: ['1', '2', '3', '4', '9'] })
    );

    expect(listVehicles).not.toHaveBeenCalled();
    expect(deactivate.mock.calls.map(call => call[0])).toEqual(['1', '2', '3', '9']); // "4" is retired already — no write, no event
    expect(result.message).toBe('4 of 5 succeeded.');
    expect(result.data.results).toEqual([
      {
        id: '1',
        ok: true,
        changed: true,
        label: 'Truck 1',
        message: 'Vehicle deactivated successfully.',
      },
      {
        id: '2',
        ok: false,
        changed: false,
        label: 'Truck 2',
        message: "Unassign this vehicle's driver and tracker before deactivating it.",
      },
      {
        id: '3',
        ok: true,
        changed: true,
        label: 'Truck 3',
        message: 'Vehicle deactivated successfully.',
      },
      {
        id: '4',
        ok: true,
        changed: false,
        label: 'Truck 4',
        message: 'Vehicle is already deactivated.',
      },
      {
        id: '9',
        ok: true,
        changed: true,
        label: null,
        message: 'Vehicle deactivated successfully.',
      },
    ]);
    expect(result.data.summary).toEqual({
      mode: 'ids',
      matched: 5,
      processed: 5,
      succeeded: 4,
      changed: 3,
      failed: 1,
    });
  });

  it('reactivate: an already-active vehicle is not touched and reported as changed: false; a retired (or sold) vehicle is reactivated', async () => {
    const service = build({
      findVehicleById: (id: string) =>
        Promise.resolve(
          makeVehicle({
            id,
            name: `V${id}`,
            lifecycleStatus: id === '1' ? 'active' : id === '2' ? 'retired' : 'sold',
          })
        ),
    });
    const reactivate = vi
      .spyOn(service, 'reactivateVehicle')
      .mockResolvedValue({ success: true, message: 'Vehicle reactivated successfully.', data: {} });
    const result = await runWithContextAsync(ctx(), () =>
      service.bulkVehicles('reactivate', { ids: ['1', '2', '3'] })
    );
    expect(reactivate.mock.calls.map(call => call[0])).toEqual(['2', '3']);
    expect(result.data.results.map(r => [r.id, r.changed, r.message])).toEqual([
      ['1', false, 'Vehicle is already active.'],
      ['2', true, 'Vehicle reactivated successfully.'],
      ['3', true, 'Vehicle reactivated successfully.'],
    ]);
  });

  it('filter mode: resolves the filter (include_inactive defaults to false for deactivate / true for reactivate) and refuses more than 500 matches', async () => {
    const listVehicles = vi.fn(() =>
      Promise.resolve({ items: [makeVehicle({ id: '9' })], total: 1 })
    );
    const service = build({ listVehicles });
    vi.spyOn(service, 'reactivateVehicle').mockResolvedValue({
      success: true,
      message: 'Vehicle reactivated successfully.',
      data: {},
    });

    await runWithContextAsync(ctx(), () =>
      service.bulkVehicles('reactivate', { filter: undefined, ids: undefined })
    );
    expect(listVehicles).toHaveBeenCalledWith({
      includeInactive: true,
      window: { page: 1, perPage: 500 },
    });

    const tooMany = build({ listVehicles: () => Promise.resolve({ items: [], total: 501 }) });
    await expect(
      runWithContextAsync(ctx(), () =>
        tooMany.bulkVehicles('deactivate', { filter: { includeInactive: false, search: 'x' } })
      )
    ).rejects.toThrow(
      'The filter matches 501 records; the limit is 500 per request. Narrow the filter.'
    );
  });

  it('drivers: ids mode uses deactivate/reactivate per driver, labels them "first last", and skips one already in the target state', async () => {
    const service = build({
      findDriverById: (id: string) =>
        Promise.resolve(
          makeDriver({
            id,
            firstName: 'Jane',
            lastName: `D${id}`,
            status: id === '6' ? 'inactive' : 'active',
          })
        ),
    });
    const deactivate = vi
      .spyOn(service, 'deactivateDriver')
      .mockResolvedValue({ success: true, message: 'Driver deactivated successfully.', data: {} });
    const result = await runWithContextAsync(ctx(), () =>
      service.bulkDrivers('deactivate', { ids: ['5', '6'] })
    );
    expect(deactivate.mock.calls.map(call => call[0])).toEqual(['5']);
    expect(result.data.results).toEqual([
      {
        id: '5',
        ok: true,
        changed: true,
        label: 'Jane D5',
        message: 'Driver deactivated successfully.',
      },
      {
        id: '6',
        ok: true,
        changed: false,
        label: 'Jane D6',
        message: 'Driver is already deactivated.',
      },
    ]);
    expect(result.data.summary).toMatchObject({ succeeded: 2, changed: 1, failed: 0 });
  });
});

describe('FleetVehiclesDriversService.getDriver', () => {
  it('composes current assignment, recent incidents, and recent assignments', async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      currentAssignmentForDriver: () => Promise.resolve(undefined),
      recentIncidentsForDriver: () =>
        Promise.resolve([
          {
            id: '1',
            driverId: '1',
            vehicleId: null,
            incidentType: 'speeding',
            severity: 'minor' as const,
            incidentDate: new Date('2026-09-01'),
            description: null,
            loggedBy: '1',
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
        ]),
      recentAssignmentsForDriver: () => Promise.resolve([makeDriverAssignment()]),
      findVehicleById: () => Promise.resolve(makeVehicle()),
    });
    const usersLookup = fakeUsersLookup({
      findContactById: () => Promise.resolve({ id: '1', firstName: 'Boss', lastName: 'Person' }),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      usersLookup,
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () => service.getDriver('1'));

    expect(result.data.incidents).toHaveLength(1);
    expect(result.data.recent_assignments).toHaveLength(1);
    const assignment = (
      result.data.recent_assignments as { vehicle: unknown; assigned_by: unknown }[]
    )[0];
    expect(assignment?.vehicle).toMatchObject({ name: 'Truck 1' });
    expect(assignment?.assigned_by).toMatchObject({ first_name: 'Boss' });
  });
});

describe('FleetVehiclesDriversService.uploadVehicleImage', () => {
  it('rejects unparseable image bytes with a 422-style ValidationError (D-0076 precedent)', async () => {
    const repo = fakeFleetRepository({ findVehicleById: () => Promise.resolve(makeVehicle()) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      service.uploadVehicleImage('1', {
        buffer: Buffer.from('not an image'),
        contentType: 'image/png',
        extension: 'png',
      })
    ).rejects.toThrow(ValidationError);
  });

  it("uploads to R2, deletes the old image, and updates the vehicle's image_path on success", async () => {
    let updatedPath: string | null | undefined;
    const repo = fakeFleetRepository({
      findVehicleById: () =>
        Promise.resolve(makeVehicle({ imagePath: 'https://images.example.com/vehicles/old.png' })),
      updateVehicleImagePath: (_id, imagePath) => {
        updatedPath = imagePath;
        return Promise.resolve(makeVehicle({ imagePath }));
      },
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await service.uploadVehicleImage('1', {
      buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
      contentType: 'image/png',
      extension: 'png',
    });

    expect(updatedPath).toBe('https://images.example.com/vehicles/new.png');
    expect(result.success).toBe(true);
  });

  it("throws NotFoundError for a vehicle outside the caller's company", async () => {
    const repo = fakeFleetRepository({ findVehicleById: () => Promise.resolve(undefined) });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    await expect(
      service.uploadVehicleImage('1', {
        buffer: Buffer.from(''),
        contentType: 'image/png',
        extension: 'png',
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe('FleetVehiclesDriversService assignment-history endpoints', () => {
  const noFilter = {
    dateFrom: undefined,
    dateTo: undefined,
    includeActive: true,
    status: undefined,
  };

  it('driverAssignmentHistory: builds the summary + paginated, enriched history', async () => {
    const repo = fakeFleetRepository({
      findDriverById: () => Promise.resolve(makeDriver()),
      listDriverAssignmentHistory: () =>
        Promise.resolve({
          items: [makeDriverAssignment({ tripCount: 2, distanceKm: 10 })],
          total: 1,
        }),
      driverAssignmentSummaryRows: () =>
        Promise.resolve([
          { assignedAt: new Date('2026-09-01'), unassignedAt: null, tripCount: 2, distanceKm: 10 },
          {
            assignedAt: new Date('2026-08-01T00:00:00.000Z'),
            unassignedAt: new Date('2026-08-05T00:00:00.000Z'),
            tripCount: 1,
            distanceKm: 5,
          },
        ]),
      uniqueVehiclesForDriver: () => Promise.resolve(1),
      findVehicleById: () => Promise.resolve(makeVehicle()),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await service.driverAssignmentHistory('1', noFilter, 1, 20);

    expect(result.summary).toMatchObject({
      total_assignments: 2,
      active_assignment: true,
      total_days_assigned: 4,
      unique_vehicles_driven: 1,
      total_trips: 3,
      total_distance_km: 15,
    });
    expect(result.historyItems).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('vehicleAssignmentHistory: builds the summary + paginated, enriched history', async () => {
    const repo = fakeFleetRepository({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      listVehicleAssignmentHistory: () =>
        Promise.resolve({ items: [makeDriverAssignment()], total: 1 }),
      vehicleAssignmentSummaryRows: () =>
        Promise.resolve([
          { assignedAt: new Date('2026-09-01'), unassignedAt: null, tripCount: 0, distanceKm: 0 },
        ]),
      uniqueDriversForVehicle: () => Promise.resolve(1),
      findDriverById: () => Promise.resolve(makeDriver()),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await service.vehicleAssignmentHistory('1', noFilter, 1, 20);

    expect(result.summary).toMatchObject({ total_assignments: 1, unique_drivers: 1 });
    expect(result.historyItems).toHaveLength(1);
  });

  it("companyAssignmentHistory: scopes to the caller's own company", async () => {
    let scopedCompanyId: string | undefined;
    const repo = fakeFleetRepository({
      listCompanyAssignmentHistory: companyId => {
        scopedCompanyId = companyId;
        return Promise.resolve({ items: [makeDriverAssignment()], total: 1 });
      },
      findDriverById: () => Promise.resolve(makeDriver()),
      findVehicleById: () => Promise.resolve(makeVehicle()),
    });
    const service = new FleetVehiclesDriversService(
      repo,
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx({ companyId: '42' }), () =>
      service.companyAssignmentHistory(
        { ...noFilter, driverId: undefined, vehicleId: undefined },
        1,
        20
      )
    );

    expect(scopedCompanyId).toBe('42');
    expect(result.historyItems).toHaveLength(1);
  });
});

describe('FleetVehiclesDriversService — fleet completion step 1 (KNOWN_ISSUES 11.78–11.82)', () => {
  function build(
    repoOverrides: Parameters<typeof fakeFleetRepository>[0],
    lookups: {
      devices?: ReturnType<typeof fakeDevicesLookup>;
      yards?: ReturnType<typeof fakeYardHistoryLookup>;
      users?: ReturnType<typeof fakeUsersLookup>;
    } = {}
  ) {
    return new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      lookups.devices ?? fakeDevicesLookup(),
      lookups.users ?? fakeUsersLookup(),
      lookups.yards ?? fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );
  }

  it('assign-device with a non-numeric device_id is a 422 with a fixed message — and never reaches the device lookup (was a 500 from BigInt())', async () => {
    let lookedUp = false;
    const service = build(
      { findVehicleById: () => Promise.resolve(makeVehicle()) },
      {
        devices: fakeDevicesLookup({
          findAuthorized: () => {
            lookedUp = true;
            return Promise.resolve(undefined);
          },
        }),
      }
    );

    const error = await runWithContextAsync(ctx(), () =>
      service.assignDevice('1', 'ZZTRK0000000001')
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe('The device id must be an integer.');
    expect((error as ValidationError).errors).toEqual({
      device_id: ['The device id must be an integer.'],
    });
    expect(lookedUp).toBe(false);
  });

  it('listAssignableTrackers passes the caller + options through and shapes the response', async () => {
    let seen: unknown;
    const service = build(
      {},
      {
        devices: fakeDevicesLookup({
          listAssignableTrackers: (userId, companyId, options) => {
            seen = { userId, companyId, options };
            return Promise.resolve([
              {
                id: '146',
                name: 'ZZ Tracker 1',
                deviceUniqueIdentifier: 'ZZTRK1',
                status: 'active',
                hasPosition: true,
                product: { id: '118', name: 'GPS' },
              },
            ]);
          },
        }),
      }
    );

    const result = await runWithContextAsync(ctx({ userId: '7', companyId: '3' }), () =>
      service.listAssignableTrackers('zz', true)
    );

    expect(seen).toEqual({
      userId: '7',
      companyId: '3',
      options: { search: 'zz', onlyWithPosition: true },
    });
    expect(result.data).toEqual([
      {
        id: 146,
        name: 'ZZ Tracker 1',
        device_unique_identifier: 'ZZTRK1',
        status: 'active',
        has_position: true,
        product: { id: 118, name: 'GPS' },
      },
    ]);
  });

  it('GET /drivers/{id}: the nested current vehicle carries its current tracker (B4 / 11.80)', async () => {
    const assignedAt = new Date('2026-09-02T00:00:00Z');
    const service = build(
      {
        findDriverById: () => Promise.resolve(makeDriver()),
        currentAssignmentForDriver: () => Promise.resolve(makeDriverAssignment()),
        findVehicleById: () => Promise.resolve(makeVehicle({ id: '1', name: 'Truck 1' })),
        currentDeviceAssignmentForVehicle: () =>
          Promise.resolve({
            id: '8',
            vehicleId: '1',
            deviceId: '146',
            assignedAt,
            unassignedAt: null,
            createdAt: null,
            updatedAt: null,
          }),
        recentIncidentsForDriver: () => Promise.resolve([]),
        recentAssignmentsForDriver: () => Promise.resolve([]),
      },
      {
        devices: fakeDevicesLookup({
          findByIdUnscoped: () =>
            Promise.resolve({ id: '146', name: 'ZZ Tracker 1', deviceUniqueIdentifier: 'ZZTRK1' }),
        }),
      }
    );

    const result = await runWithContextAsync(ctx(), () => service.getDriver('1'));

    const vehicle = (
      (result.data as Record<string, unknown>)['current_assignment'] as {
        vehicle: Record<string, unknown>;
      }
    ).vehicle;
    expect(vehicle['current_device_assignment']).toEqual({
      id: '8',
      vehicle_id: '1',
      device_id: '146',
      assigned_at: assignedAt,
      unassigned_at: null,
      device: { id: '146', name: 'ZZ Tracker 1' },
    });
  });

  it('GET /vehicles/{id}: yard_history is real (last events with slot + yard) and schedules carry next_service_date / is_overdue_by_date (B9 + B8)', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const service = build(
      {
        findVehicleById: () => Promise.resolve(makeVehicle()),
        currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
        currentAssignmentForVehicle: () => Promise.resolve(undefined),
        maintenanceSchedulesForVehicle: () =>
          Promise.resolve([
            {
              id: '1',
              vehicleId: '1',
              serviceType: 'Oil',
              intervalDays: 30,
              intervalKm: null,
              lastServiceDate: past,
              odometerBaselineKm: null,
              odometerBaselineDate: null,
              lastServiceOdometerKm: null,
              createdAt: null,
              updatedAt: null,
              createdBy: null,
              updatedBy: null,
            },
            {
              id: '2',
              vehicleId: '1',
              serviceType: 'Tyres',
              intervalDays: null,
              intervalKm: 10000,
              lastServiceDate: null,
              odometerBaselineKm: null,
              odometerBaselineDate: null,
              lastServiceOdometerKm: null,
              createdAt: null,
              updatedAt: null,
              createdBy: null,
              updatedBy: null,
            },
          ]),
        maintenanceLogsForVehicle: () => Promise.resolve([]),
        fuelLogsForVehicle: () => Promise.resolve([]),
        fullTankFuelLogsForVehicle: () => Promise.resolve([]),
        driverAssignmentHistoryForVehicle: () => Promise.resolve([]),
      },
      {
        yards: fakeYardHistoryLookup({
          recentEventsForVehicle: () =>
            Promise.resolve([
              {
                event: {
                  id: '3',
                  yardSlotId: '9',
                  vehicleId: '1',
                  checkedInAt: past,
                  checkedOutAt: null,
                  source: 'manual',
                  createdAt: null,
                  updatedAt: null,
                },
                slot: {
                  id: '9',
                  yardId: '2',
                  slotNumber: 'A1',
                  yard: { id: '2', name: 'Main Yard' },
                },
              },
            ]),
        }),
      }
    );

    const result = await runWithContextAsync(ctx(), () => service.getVehicle('1'));

    expect(result.data.yard_history).toEqual([
      {
        id: '3',
        yard_slot_id: '9',
        vehicle_id: '1',
        checked_in_at: past,
        checked_out_at: null,
        source: 'manual',
        created_at: null,
        updated_at: null,
        slot: { id: '9', yard_id: '2', slot_number: 'A1', yard: { id: '2', name: 'Main Yard' } },
      },
    ]);
    const [dated, undated] = result.data.maintenance_schedules as Record<string, unknown>[];
    expect((dated?.['next_service_date'] as Date).toISOString()).toBe('2020-01-31T00:00:00.000Z');
    expect(dated?.['is_overdue_by_date']).toBe(true);
    expect(undated?.['next_service_date']).toBeNull();
    expect(undated?.['is_overdue_by_date']).toBeNull();
  });
});

// ===========================================================================
// D-0162 — PUT / deactivate / reactivate for vehicles and drivers
// ===========================================================================

describe('FleetVehiclesDriversService — step 7: edit + deactivate/reactivate (D-0162)', () => {
  const assignment = makeDeviceAssignment();
  const driverAssignment = makeDriverAssignment();

  function svc(
    repoOverrides: Parameters<typeof fakeFleetRepository>[0],
    tripsInProgress = false,
    realtime = new RecordingFleetRealtime()
  ) {
    return new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup({ vehicleHasActiveTrip: () => Promise.resolve(tripsInProgress) }),
      realtime
    );
  }

  it('updateVehicle: passes only what was sent to the repository and returns the vehicle; 404 for an unknown / foreign vehicle', async () => {
    let received: unknown;
    const service = svc({
      updateVehicle: (_id, input) => {
        received = input;
        return Promise.resolve(makeVehicle({ plate: 'NEW-1' }));
      },
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.updateVehicle('1', { plate: 'NEW-1', fuelType: null })
    );
    expect(received).toEqual({ plate: 'NEW-1', fuelType: null });
    expect(result).toMatchObject({
      success: true,
      message: 'Vehicle updated successfully.',
      data: { plate: 'NEW-1' },
    });

    const missing = svc({ updateVehicle: () => Promise.resolve(undefined) });
    await expect(runWithContextAsync(ctx(), () => missing.updateVehicle('9', {}))).rejects.toThrow(
      'Vehicle not found.'
    );
  });

  it('updateDriver: 404 for an unknown driver, otherwise the updated driver', async () => {
    const service = svc({
      updateDriver: (_id, input) => Promise.resolve(makeDriver({ phone: input.phone ?? null })),
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.updateDriver('1', { phone: '555' })
    );
    expect(result).toMatchObject({
      success: true,
      message: 'Driver updated successfully.',
      data: { phone: '555' },
    });

    const missing = svc({ updateDriver: () => Promise.resolve(undefined) });
    await expect(runWithContextAsync(ctx(), () => missing.updateDriver('9', {}))).rejects.toThrow(
      'Driver not found.'
    );
  });

  it('deactivateVehicle: refused while a trip is in progress, then while a driver or a tracker is assigned (fixed messages); otherwise retired', async () => {
    const base = {
      findVehicleById: () => Promise.resolve(makeVehicle()),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
      currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
      setVehicleLifecycleStatus: (_id: string, status: 'active' | 'retired') =>
        Promise.resolve(makeVehicle({ lifecycleStatus: status })),
    };
    await expect(
      runWithContextAsync(ctx(), () => svc(base, true).deactivateVehicle('1'))
    ).rejects.toThrow('This vehicle has a trip in progress. Complete or cancel it first.');
    const withDriver = svc({
      ...base,
      currentAssignmentForVehicle: () => Promise.resolve(driverAssignment),
    });
    await expect(
      runWithContextAsync(ctx(), () => withDriver.deactivateVehicle('1'))
    ).rejects.toThrow("Unassign this vehicle's driver and tracker before deactivating it.");
    const withTracker = svc({
      ...base,
      currentDeviceAssignmentForVehicle: () => Promise.resolve(assignment),
    });
    await expect(
      runWithContextAsync(ctx(), () => withTracker.deactivateVehicle('1'))
    ).rejects.toThrow("Unassign this vehicle's driver and tracker before deactivating it.");

    const ok = await runWithContextAsync(ctx(), () => svc(base).deactivateVehicle('1'));
    expect(ok).toMatchObject({ success: true, data: { lifecycle_status: 'retired' } });

    const unknown = svc({ ...base, findVehicleById: () => Promise.resolve(undefined) });
    await expect(runWithContextAsync(ctx(), () => unknown.deactivateVehicle('9'))).rejects.toThrow(
      'Vehicle not found.'
    );
  });

  it('D-0182 (L4): deactivateVehicle is also refused while the vehicle is checked in at a yard or has planned trips (fixed messages, after the older guards); bulk-deactivate inherits them', async () => {
    const repo = {
      findVehicleById: () => Promise.resolve(makeVehicle()),
      currentAssignmentForVehicle: () => Promise.resolve(undefined),
      currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
      setVehicleLifecycleStatus: (_id: string, status: 'active' | 'retired') =>
        Promise.resolve(makeVehicle({ lifecycleStatus: status })),
    };
    const build = (yard: boolean, planned: boolean, realtime = new RecordingFleetRealtime()) =>
      new FleetVehiclesDriversService(
        fakeFleetRepository(repo),
        fakeDevicesLookup(),
        fakeUsersLookup(),
        fakeYardHistoryLookup({ vehicleHasOpenStay: () => Promise.resolve(yard) }),
        fakeTripsLookup({ vehicleHasPlannedTrip: () => Promise.resolve(planned) }),
        realtime
      );
    await expect(
      runWithContextAsync(ctx(), () => build(true, false).deactivateVehicle('1'))
    ).rejects.toThrow('Check this vehicle out of its yard before deactivating it.');
    await expect(
      runWithContextAsync(ctx(), () => build(false, true).deactivateVehicle('1'))
    ).rejects.toThrow(
      'This vehicle has planned trips. Cancel or delete them before deactivating it.'
    );
    // both → the yard message comes first
    await expect(
      runWithContextAsync(ctx(), () => build(true, true).deactivateVehicle('1'))
    ).rejects.toThrow('Check this vehicle out of its yard');
    // a trip in progress still wins over both
    const inProgress = new FleetVehiclesDriversService(
      fakeFleetRepository(repo),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup({ vehicleHasOpenStay: () => Promise.resolve(true) }),
      fakeTripsLookup({
        vehicleHasActiveTrip: () => Promise.resolve(true),
        vehicleHasPlannedTrip: () => Promise.resolve(true),
      }),
      new RecordingFleetRealtime()
    );
    await expect(
      runWithContextAsync(ctx(), () => inProgress.deactivateVehicle('1'))
    ).rejects.toThrow('This vehicle has a trip in progress.');

    // neither → retired + announced; a refused one announces nothing
    const realtime = new RecordingFleetRealtime();
    expect(
      await runWithContextAsync(ctx(), () => build(false, false, realtime).deactivateVehicle('1'))
    ).toMatchObject({ data: { lifecycle_status: 'retired' } });
    expect(realtime.fleetChanges.map(c => c.payload.action)).toEqual(['deactivated']);
  });

  it('reactivateVehicle → active; 404 when unknown', async () => {
    const service = svc({
      setVehicleLifecycleStatus: (_id, status) =>
        Promise.resolve(makeVehicle({ lifecycleStatus: status })),
    });
    expect(await runWithContextAsync(ctx(), () => service.reactivateVehicle('1'))).toMatchObject({
      data: { lifecycle_status: 'active' },
    });
    const missing = svc({ setVehicleLifecycleStatus: () => Promise.resolve(undefined) });
    await expect(runWithContextAsync(ctx(), () => missing.reactivateVehicle('9'))).rejects.toThrow(
      'Vehicle not found.'
    );
  });

  it('deactivateDriver: refused while on a vehicle (fixed message); otherwise inactive; reactivate → active', async () => {
    const base = {
      findDriverById: () => Promise.resolve(makeDriver()),
      currentAssignmentForDriver: () => Promise.resolve(undefined),
      setDriverStatus: (_id: string, status: 'active' | 'inactive') =>
        Promise.resolve(makeDriver({ status })),
    };
    const assigned = svc({
      ...base,
      currentAssignmentForDriver: () => Promise.resolve(driverAssignment),
    });
    await expect(runWithContextAsync(ctx(), () => assigned.deactivateDriver('1'))).rejects.toThrow(
      'Unassign this driver from their vehicle before deactivating them.'
    );
    expect(await runWithContextAsync(ctx(), () => svc(base).deactivateDriver('1'))).toMatchObject({
      success: true,
      data: { status: 'inactive' },
    });
    expect(await runWithContextAsync(ctx(), () => svc(base).reactivateDriver('1'))).toMatchObject({
      data: { status: 'active' },
    });
    const unknown = svc({ ...base, findDriverById: () => Promise.resolve(undefined) });
    await expect(runWithContextAsync(ctx(), () => unknown.deactivateDriver('9'))).rejects.toThrow(
      'Driver not found.'
    );
  });
});

describe('FleetVehiclesDriversService publishes fleet:changed (D-0163)', () => {
  const changes = (r: RecordingFleetRealtime) =>
    r.fleetChanges.map(c => `${c.payload.entity}:${c.payload.id}:${c.payload.action}`);

  it("create / update / deactivate / reactivate announce the record to the caller's company room", async () => {
    const realtime = new RecordingFleetRealtime();
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        createVehicle: () => Promise.resolve(makeVehicle({ id: '5' })),
        updateVehicle: () => Promise.resolve(makeVehicle({ id: '5' })),
        findVehicleById: () => Promise.resolve(makeVehicle({ id: '5' })),
        currentAssignmentForVehicle: () => Promise.resolve(undefined),
        currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
        setVehicleLifecycleStatus: (_id, status) =>
          Promise.resolve(makeVehicle({ id: '5', lifecycleStatus: status })),
        createDriver: () => Promise.resolve(makeDriver({ id: '8' })),
        updateDriver: () => Promise.resolve(makeDriver({ id: '8' })),
        findDriverById: () => Promise.resolve(makeDriver({ id: '8' })),
        currentAssignmentForDriver: () => Promise.resolve(undefined),
        setDriverStatus: (_id, status) => Promise.resolve(makeDriver({ id: '8', status })),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      realtime
    );

    await runWithContextAsync(ctx(), async () => {
      await service.createVehicle(FULL_CREATE_VEHICLE_INPUT);
      await service.updateVehicle('5', { plate: 'X' });
      await service.deactivateVehicle('5');
      await service.reactivateVehicle('5');
      await service.createDriver(FULL_CREATE_DRIVER_INPUT);
      await service.updateDriver('8', { phone: '1' });
      await service.deactivateDriver('8');
      await service.reactivateDriver('8');
    });

    expect(changes(realtime)).toEqual([
      'vehicle:5:created',
      'vehicle:5:updated',
      'vehicle:5:deactivated',
      'vehicle:5:reactivated',
      'driver:8:created',
      'driver:8:updated',
      'driver:8:deactivated',
      'driver:8:reactivated',
    ]);
    expect(
      realtime.fleetChanges.every(c => c.companyId === '1' && /Z$/.test(c.payload.occurredAt))
    ).toBe(true);
  });

  it('assignments (tracker and driver <-> vehicle) announce the affected vehicle and driver as `updated`; a refused action announces nothing', async () => {
    const realtime = new RecordingFleetRealtime();
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        findVehicleById: () => Promise.resolve(makeVehicle({ id: '5' })),
        findDriverById: () => Promise.resolve(makeDriver({ id: '8' })),
        vehicleHasActiveDeviceAssignment: () => Promise.resolve(false),
        deviceHasActiveAssignment: () => Promise.resolve(false),
        createDeviceAssignment: () => Promise.resolve(makeDeviceAssignment()),
        closeActiveDeviceAssignment: () => Promise.resolve(makeDeviceAssignment()),
        driverHasActiveAssignment: () => Promise.resolve(false),
        currentAssignmentForDriver: () => Promise.resolve(undefined),
        currentAssignmentForVehicle: () => Promise.resolve(undefined),
        createDriverVehicleAssignment: () => Promise.resolve(makeDriverAssignment()),
        closeActiveAssignmentForDriver: () =>
          Promise.resolve(makeDriverAssignment({ vehicleId: '5' })),
      }),
      fakeDevicesLookup({ findAuthorized: () => Promise.resolve({ id: '9' }) }),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      realtime
    );

    await runWithContextAsync(ctx(), async () => {
      await service.assignDevice('5', '9');
      await service.unassignDevice('5');
      await service.assignVehicleToDriver('8', '5', null);
      await service.unassignVehicleFromDriver('8', null);
    });

    expect(changes(realtime)).toEqual([
      'vehicle:5:updated',
      'vehicle:5:updated',
      'driver:8:updated',
      'vehicle:5:updated',
      'driver:8:updated',
      'vehicle:5:updated',
    ]);

    const refused = new RecordingFleetRealtime();
    const failing = new FleetVehiclesDriversService(
      fakeFleetRepository({
        findVehicleById: () => Promise.resolve(makeVehicle({ id: '5' })),
        closeActiveDeviceAssignment: () => Promise.resolve(undefined),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      refused
    );
    await expect(runWithContextAsync(ctx(), () => failing.unassignDevice('5'))).rejects.toThrow(
      ValidationError
    );
    expect(refused.fleetChanges).toEqual([]);
  });
});

describe('FleetVehiclesDriversService.exportVehicles / exportDrivers (D-0168, B11)', () => {
  const build = (repoOverrides: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it("uses the list's query for every page, adds the assignment flags, and documents the columns", async () => {
    const listVehicles = vi.fn((query: { window?: { page: number; perPage: number } }) =>
      Promise.resolve({ items: [makeVehicle({ name: '=Truck' })], total: query.window ? 1 : 0 })
    );
    const vehicleFlags = vi.fn((vehicles: unknown[]) =>
      Promise.resolve(
        vehicles.map(vehicle => ({ vehicle, hasDriver: true, hasTracker: false, checkedIn: false }))
      )
    );
    const service = build({ listVehicles, vehicleFlags } as never);

    const plan = await service.exportVehicles({
      includeInactive: false,
      search: 'truck',
      sortBy: 'name',
      sortOrder: 'desc',
    });

    expect(plan.name).toBe('vehicles');
    expect(plan.columns.map(c => c.header)).toEqual([
      'id',
      'name',
      'plate',
      'vin',
      'vehicle_category',
      'make',
      'model',
      'year',
      'fuel_type',
      'ownership_type',
      'lifecycle_status',
      'odometer_km',
      'tank_capacity_liters',
      'cost_centre',
      'acquisition_date',
      'acquisition_cost',
      'length_m',
      'width_m',
      'height_m',
      'gross_weight_kg',
      'payload_kg',
      'has_driver',
      'has_tracker',
      'checked_in',
      'created_at',
    ]);
    expect(listVehicles).toHaveBeenCalledWith({
      includeInactive: false,
      search: 'truck',
      sortBy: 'name',
      sortOrder: 'desc',
      window: { page: 1, perPage: 500 },
    });
    const first = (await collect(plan.batches()))[0]?.[0];
    expect(first).toBeDefined();
    const row = plan.columns.map(c => c.value(first as VehicleOption));
    expect(row[1]).toBe('=Truck'); // the raw value — the CSV writer neutralises the formula
    expect(row[21]).toBe(true);
  });

  it('drivers: date-only columns and the assigned flag', async () => {
    const service = build({
      listDrivers: () =>
        Promise.resolve({
          items: [makeDriver({ licenseExpiryDate: new Date('2027-03-04T00:00:00Z') })],
          total: 1,
        }),
      driverFlags: (drivers: unknown[]) =>
        Promise.resolve(drivers.map(driver => ({ driver, assigned: true }))),
    } as never);
    const plan = await service.exportDrivers({ includeInactive: false });
    const first = (await collect(plan.batches()))[0]?.[0];
    expect(first).toBeDefined();
    const byHeader = Object.fromEntries(
      plan.columns.map(c => [c.header, c.value(first as DriverOption)])
    );
    expect(byHeader['license_expiry_date']).toBe('2027-03-04');
    expect(byHeader['assigned']).toBe(true);
  });

  it('refuses more than 50 000 matches with a 422 before streaming', async () => {
    const service = build({
      listVehicles: () => Promise.resolve({ items: [], total: 50_001 }),
      vehicleFlags: () => Promise.resolve([]),
    });
    await expect(service.exportVehicles({ includeInactive: false })).rejects.toThrow(
      'The export matches 50001 rows; the limit is 50000 per export. Narrow the filter.'
    );
  });
});

async function collect<T>(batches: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = [];
  for await (const batch of batches) out.push(batch);
  return out;
}

describe('FleetVehiclesDriversService incidents edit / delete + vehicle image removal (D-0169, B3/B4)', () => {
  const build = (
    repoOverrides: Parameters<typeof fakeFleetRepository>[0],
    realtime = new RecordingFleetRealtime()
  ) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      realtime
    );
  const incident = (overrides: Record<string, unknown> = {}) => ({
    id: '5',
    driverId: '1',
    vehicleId: null,
    incidentType: 'speeding',
    severity: 'minor' as const,
    incidentDate: new Date('2026-09-01'),
    description: null,
    loggedBy: '1',
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  });

  it("update passes only the sent fields; the vehicle must be the caller's (422); another company's driver's incident is a plain 404", async () => {
    const update = vi.fn((_id: string, input: { severity?: string }) =>
      Promise.resolve(incident({ severity: input.severity }))
    );
    const service = build({
      findIncidentById: (id: string) =>
        Promise.resolve(incident({ id, driverId: id === '9' ? '77' : '1' })),
      findDriverById: (id: string) => Promise.resolve(id === '1' ? makeDriver() : undefined),
      findVehicleById: (id: string) =>
        Promise.resolve(id === '3' ? makeVehicle({ id: '3' }) : undefined),
      updateIncident: update,
    } as never);

    const ok = await runWithContextAsync(ctx(), () =>
      service.updateIncident('5', { severity: 'severe', vehicleId: '3' })
    );
    expect(update).toHaveBeenCalledWith('5', { severity: 'severe', vehicleId: '3' });
    expect(ok.message).toBe('Incident updated successfully.');
    expect(ok.data).toMatchObject({ severity: 'severe', driver_id: '1' });
    await expect(
      runWithContextAsync(ctx(), () => service.updateIncident('5', { vehicleId: '44' }))
    ).rejects.toThrow('The selected vehicle id is invalid.');
    await expect(runWithContextAsync(ctx(), () => service.updateIncident('9', {}))).rejects.toThrow(
      'Incident not found.'
    );
  });

  it('delete removes it; a missing / foreign incident is a 404', async () => {
    const del = vi.fn(() => Promise.resolve(true));
    const service = build({
      findIncidentById: (id: string) => Promise.resolve(id === '5' ? incident() : undefined),
      findDriverById: () => Promise.resolve(makeDriver()),
      deleteIncident: del,
    });
    expect((await runWithContextAsync(ctx(), () => service.deleteIncident('5'))).message).toBe(
      'Incident deleted successfully.'
    );
    expect(del).toHaveBeenCalledWith('5');
    await expect(runWithContextAsync(ctx(), () => service.deleteIncident('6'))).rejects.toThrow(
      NotFoundError
    );
  });

  it('vehicle image removal deletes the stored file, clears image_path, announces the change — and is idempotent', async () => {
    const r2 = await import('../../../platform/storage/r2-storage.js');
    const setPath = vi.fn((_id: string, path: string | null) =>
      Promise.resolve(makeVehicle({ imagePath: path }))
    );
    const realtime = new RecordingFleetRealtime();
    const service = build(
      {
        findVehicleById: () =>
          Promise.resolve(
            makeVehicle({ imagePath: 'https://images.example.com/vehicles/old.png' })
          ),
        updateVehicleImagePath: setPath,
      },
      realtime
    );
    vi.mocked(r2.deleteObject).mockClear();

    const result = await runWithContextAsync(ctx(), () => service.deleteVehicleImage('1'));

    expect(r2.deleteObject).toHaveBeenCalledWith('vehicles/old.png');
    expect(setPath).toHaveBeenCalledWith('1', null);
    expect(result.message).toBe('Vehicle image removed successfully.');
    expect(result.data).toMatchObject({ image_path: null });

    const bare = build({
      findVehicleById: () => Promise.resolve(makeVehicle({ imagePath: null })),
      updateVehicleImagePath: setPath,
    });
    vi.mocked(r2.deleteObject).mockClear();
    expect((await runWithContextAsync(ctx(), () => bare.deleteVehicleImage('1'))).message).toBe(
      'Vehicle image removed successfully.'
    );
    expect(r2.deleteObject).not.toHaveBeenCalled();
    await expect(
      runWithContextAsync(ctx(), () =>
        build({ findVehicleById: () => Promise.resolve(undefined) }).deleteVehicleImage('1')
      )
    ).rejects.toThrow('Vehicle not found.');
  });
});

describe('FleetVehiclesDriversService paged detail sub-lists (D-0170, B9)', () => {
  const build = (
    repoOverrides: Parameters<typeof fakeFleetRepository>[0],
    yardLookup = fakeYardHistoryLookup()
  ) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      yardLookup,
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );
  const window = { page: 2, perPage: 10 };
  const log = {
    id: '3',
    vehicleId: '1',
    maintenanceScheduleId: null,
    serviceType: 'Oil',
    serviceDate: new Date('2026-05-05'),
    odometerKm: 900,
    cost: 40,
    vendor: 'V',
    notes: null,
    loggedBy: '1',
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
  };

  it('maintenance logs: 404 for an unknown / foreign vehicle, otherwise { items, pagination } with the same record shape as the detail', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [log], total: 31 }));
    const service = build({
      findVehicleById: (id: string) => Promise.resolve(id === '1' ? makeVehicle() : undefined),
      listMaintenanceLogsForVehicle: list,
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicleMaintenanceLogs('1', { sortBy: 'cost', window })
    );

    expect(list).toHaveBeenCalledWith('1', { sortBy: 'cost', window });
    expect(result.data).toMatchObject({
      pagination: { page: 2, per_page: 10, total: 31, total_pages: 4 },
    });
    expect((result.data as { items: Record<string, unknown>[] }).items[0]).toMatchObject({
      id: '3',
      service_type: 'Oil',
      vehicle_id: '1',
      odometer_km: 900,
      vendor: 'V',
    });
    await expect(
      runWithContextAsync(ctx(), () => service.listVehicleMaintenanceLogs('9', { window }))
    ).rejects.toThrow('Vehicle not found.');
  });

  it('fuel logs and incidents (vehicle / driver) resolve the owner first and scope the query to it', async () => {
    const listFuel = vi.fn(() => Promise.resolve({ items: [], total: 0 }));
    const listIncidents = vi.fn(() => Promise.resolve({ items: [], total: 0 }));
    const service = build({
      findVehicleById: (id: string) => Promise.resolve(id === '1' ? makeVehicle() : undefined),
      findDriverById: (id: string) =>
        Promise.resolve(id === '2' ? makeDriver({ id: '2' }) : undefined),
      listFuelLogsForVehicle: listFuel,
      listIncidents,
    });

    await runWithContextAsync(ctx(), () => service.listVehicleFuelLogs('1', { window }));
    expect(listFuel).toHaveBeenCalledWith('1', { window });
    await runWithContextAsync(ctx(), () =>
      service.listVehicleIncidents('1', { severity: 'severe', window })
    );
    expect(listIncidents).toHaveBeenLastCalledWith(
      { vehicleId: '1' },
      { severity: 'severe', window }
    );
    await runWithContextAsync(ctx(), () => service.listDriverIncidents('2', { window }));
    expect(listIncidents).toHaveBeenLastCalledWith({ driverId: '2' }, { window });

    await expect(
      runWithContextAsync(ctx(), () => service.listVehicleFuelLogs('9', { window }))
    ).rejects.toThrow('Vehicle not found.');
    await expect(
      runWithContextAsync(ctx(), () => service.listVehicleIncidents('9', { window }))
    ).rejects.toThrow('Vehicle not found.');
    await expect(
      runWithContextAsync(ctx(), () => service.listDriverIncidents('9', { window }))
    ).rejects.toThrow('Driver not found.');
  });

  it("yard history goes through the yards lookup and keeps the detail's { slot: { yard } } shape", async () => {
    const paged = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            event: {
              id: '7',
              yardSlotId: '4',
              vehicleId: '1',
              checkedInAt: new Date('2026-06-01'),
              checkedOutAt: null,
              source: 'manual',
              createdAt: null,
              updatedAt: null,
            },
            slot: { id: '4', yardId: '2', slotNumber: 'A1', yard: { id: '2', name: 'Depot' } },
          },
        ],
        total: 1,
      })
    );
    const service = build(
      { findVehicleById: () => Promise.resolve(makeVehicle()) },
      fakeYardHistoryLookup({ pagedEventsForVehicle: paged })
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicleYardHistory('1', { open: true, window })
    );

    expect(paged).toHaveBeenCalledWith('1', { open: true, window });
    expect((result.data as { items: Record<string, unknown>[] }).items[0]).toMatchObject({
      id: '7',
      checked_out_at: null,
      slot: { slot_number: 'A1', yard: { id: '2', name: 'Depot' } },
    });
  });
});

describe('options include_inactive (D-0171)', () => {
  const build = (repoOverrides: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repoOverrides),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it("passes include_inactive through to the repository and returns each driver's status", async () => {
    const vehicleOptions = vi.fn(() => Promise.resolve({ items: [], total: 0 }));
    const driverOptions = vi.fn(() =>
      Promise.resolve({
        items: [{ driver: makeDriver({ status: 'suspended' }), assigned: false }],
        total: 1,
      })
    );
    const service = build({ vehicleOptions, driverOptions });

    await runWithContextAsync(ctx(), () =>
      service.vehicleOptions({ includeInactive: true, limit: 1000 })
    );
    expect(vehicleOptions).toHaveBeenCalledWith({ includeInactive: true, limit: 1000 });
    const drivers = await runWithContextAsync(ctx(), () =>
      service.driverOptions({ includeInactive: true, limit: 1000 })
    );
    expect(driverOptions).toHaveBeenCalledWith({ includeInactive: true, limit: 1000 });
    expect((drivers.data as Record<string, unknown>[])[0]).toMatchObject({ status: 'suspended' });
  });
});

describe('FleetVehiclesDriversService audit fields (D-0172, B6)', () => {
  const people = new Map([
    ['3', { id: '3', firstName: 'Amina', lastName: 'Khan' }],
    ['4', { id: '4', firstName: 'Bilal', lastName: 'Shah' }],
  ]);

  it('a vehicle response names who created and who last changed it; an unknown or automatic editor is null', async () => {
    const findContactsByIds = vi.fn((ids: string[]) =>
      Promise.resolve(new Map([...people].filter(([id]) => ids.includes(id))))
    );
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        updateVehicle: () => Promise.resolve(makeVehicle({ createdBy: '3', updatedBy: '4' })),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup({ findContactsByIds }),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.updateVehicle('1', { plate: 'X' })
    );

    expect(result.data).toMatchObject({
      created_by: '3',
      updated_by: '4',
      created_by_user: { id: '3', first_name: 'Amina', last_name: 'Khan' },
      updated_by_user: { id: '4', first_name: 'Bilal', last_name: 'Shah' },
    });
    expect(findContactsByIds).toHaveBeenCalledTimes(1);

    const automatic = new FleetVehiclesDriversService(
      fakeFleetRepository({
        updateVehicle: () => Promise.resolve(makeVehicle({ createdBy: '3', updatedBy: null })),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup({ findContactsByIds }),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );
    const result2 = await runWithContextAsync(ctx(), () =>
      automatic.updateVehicle('1', { plate: 'X' })
    );
    expect(result2.data).toMatchObject({
      created_by: '3',
      updated_by: null,
      updated_by_user: null,
    });
  });

  it('a page of vehicles resolves every distinct user with ONE lookup, not one per row', async () => {
    const findContactsByIds = vi.fn((ids: string[]) =>
      Promise.resolve(new Map([...people].filter(([id]) => ids.includes(id))))
    );
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
        currentAssignmentForVehicle: () => Promise.resolve(undefined),
        listVehicles: () =>
          Promise.resolve({
            items: [
              makeVehicle({ id: '1', createdBy: '3', updatedBy: '3' }),
              makeVehicle({ id: '2', createdBy: '3', updatedBy: '4' }),
              makeVehicle({ id: '3', createdBy: null, updatedBy: null }),
            ],
            total: 3,
          }),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup({ findContactsByIds }),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

    const result = await runWithContextAsync(ctx(), () => service.listVehicles({} as never));

    const rows = result.data as unknown as Array<Record<string, unknown>>;
    expect(findContactsByIds).toHaveBeenCalledTimes(1);
    expect(new Set(findContactsByIds.mock.calls[0]?.[0])).toEqual(new Set(['3', '4']));
    expect(rows[1]).toMatchObject({
      created_by_user: { first_name: 'Amina' },
      updated_by_user: { first_name: 'Bilal' },
    });
    expect(rows[2]).toMatchObject({ created_by: null, created_by_user: null });
  });

  it('a failing users lookup never fails the response — the ids stay, the names are null', async () => {
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        updateVehicle: () => Promise.resolve(makeVehicle({ createdBy: '3', updatedBy: '3' })),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup({ findContactsByIds: () => Promise.reject(new Error('db down')) }),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );
    const result = await runWithContextAsync(ctx(), () =>
      service.updateVehicle('1', { plate: 'X' })
    );
    expect(result.data).toMatchObject({
      created_by: '3',
      created_by_user: null,
      updated_by: '3',
      updated_by_user: null,
    });
  });

  it("an incident's created_by is its logged_by", async () => {
    const service = new FleetVehiclesDriversService(
      fakeFleetRepository({
        findIncidentById: () =>
          Promise.resolve({
            id: '5',
            driverId: '1',
            vehicleId: null,
            incidentType: 'x',
            severity: 'minor' as const,
            incidentDate: new Date('2026-09-01'),
            description: null,
            loggedBy: '3',
            createdAt: null,
            updatedAt: null,
            updatedBy: '4',
          }),
        findDriverById: () => Promise.resolve(makeDriver()),
        updateIncident: () =>
          Promise.resolve({
            id: '5',
            driverId: '1',
            vehicleId: null,
            incidentType: 'x',
            severity: 'minor' as const,
            incidentDate: new Date('2026-09-01'),
            description: null,
            loggedBy: '3',
            createdAt: null,
            updatedAt: null,
            updatedBy: '4',
          }),
      }),
      fakeDevicesLookup(),
      fakeUsersLookup({
        findContactsByIds: (ids: string[]) =>
          Promise.resolve(new Map([...people].filter(([id]) => ids.includes(id)))),
      }),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );
    const result = await runWithContextAsync(ctx(), () =>
      service.updateIncident('5', { severity: 'minor' })
    );
    expect(result.data).toMatchObject({
      logged_by: '3',
      created_by: '3',
      created_by_user: { first_name: 'Amina' },
      updated_by: '4',
      updated_by_user: { first_name: 'Bilal' },
    });
  });
});

describe('FleetVehiclesDriversService incident driver / vehicle briefs (D-0174)', () => {
  const incident = (overrides: Record<string, unknown> = {}) => ({
    id: '5',
    driverId: '1',
    vehicleId: '3',
    incidentType: 'speeding',
    severity: 'minor' as const,
    incidentDate: new Date('2026-09-01'),
    description: null,
    loggedBy: '1',
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  });
  const briefRepo = {
    driverBriefsByIds: vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter(id => id === '1')
            .map(id => [id, { id, firstName: 'Jane', lastName: 'Doe' }] as const)
        )
      )
    ),
    vehicleBriefsByIds: vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter(id => id === '3')
            .map(id => [id, { id, name: 'Truck 3', plate: 'AB-123' }] as const)
        )
      )
    ),
  };
  const build = (repo: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository({ ...briefRepo, ...repo }),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it('a page of incidents carries the driver and vehicle names, resolved with one query each', async () => {
    briefRepo.driverBriefsByIds.mockClear();
    briefRepo.vehicleBriefsByIds.mockClear();
    const service = build({
      findVehicleById: () => Promise.resolve(makeVehicle()),
      listIncidents: () =>
        Promise.resolve({
          items: [
            incident({ id: '5' }),
            incident({ id: '6', vehicleId: null }),
            incident({ id: '7', driverId: '99', vehicleId: '44' }),
          ],
          total: 3,
        }),
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.listVehicleIncidents('3', { window: { page: 1, perPage: 20 } })
    );

    const items = (result.data as unknown as { items: Array<Record<string, unknown>> }).items;
    expect(briefRepo.driverBriefsByIds).toHaveBeenCalledTimes(1);
    expect(briefRepo.vehicleBriefsByIds).toHaveBeenCalledTimes(1);
    expect(items[0]).toMatchObject({
      driver: { id: '1', first_name: 'Jane', last_name: 'Doe' },
      vehicle: { id: '3', name: 'Truck 3', plate: 'AB-123' },
    });
    expect(items[1]).toMatchObject({ driver: { first_name: 'Jane' }, vehicle: null }); // no vehicle on the incident
    expect(items[2]).toMatchObject({ driver: null, vehicle: null }); // an unknown / foreign id is simply absent
  });

  it('the edit response carries the briefs too', async () => {
    const service = build({
      findIncidentById: () => Promise.resolve(incident()),
      findDriverById: () => Promise.resolve(makeDriver()),
      updateIncident: () => Promise.resolve(incident()),
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.updateIncident('5', { severity: 'minor' })
    );
    expect(result.data).toMatchObject({
      driver: { last_name: 'Doe' },
      vehicle: { plate: 'AB-123' },
    });
  });
});

describe('FleetVehiclesDriversService — optimistic concurrency (D-0176, B13)', () => {
  const seen = new Date('2026-09-25T10:00:00Z');
  const newer = new Date('2026-09-25T10:07:00Z');
  const people = new Map([['3', { id: '3', firstName: 'Amina', lastName: 'Khan' }]]);
  const users = fakeUsersLookup({
    findContactsByIds: (ids: string[]) =>
      Promise.resolve(new Map([...people].filter(([id]) => ids.includes(id)))),
  });
  const build = (repo: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repo),
      fakeDevicesLookup(),
      users,
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it('a stale vehicle edit answers 409 with who changed it, and writes nothing; a matching or absent field goes through', async () => {
    const update = vi.fn(() => Promise.resolve(makeVehicle({ updatedAt: newer })));
    const service = build({
      findVehicleById: () => Promise.resolve(makeVehicle({ updatedAt: newer, updatedBy: '3' })),
      updateVehicle: update,
    });

    const error = await runWithContextAsync(ctx(), () =>
      service.updateVehicle('1', { plate: 'X' }, seen)
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({
      httpStatus: 409,
      message: 'This record was changed by someone else. Reload it and try again.',
    });
    expect((error as { details: unknown }).details).toMatchObject({
      current: { id: '1', updated_by: '3', updated_by_user: { first_name: 'Amina' } },
    });
    expect(update).not.toHaveBeenCalled();

    await runWithContextAsync(ctx(), () => service.updateVehicle('1', { plate: 'X' }, newer));
    await runWithContextAsync(ctx(), () => service.updateVehicle('1', { plate: 'X' }));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('driver and incident edits are checked the same way; an unknown vehicle is still a 404 (not a 409)', async () => {
    const driverUpdate = vi.fn(() => Promise.resolve(makeDriver()));
    const incident = {
      id: '5',
      driverId: '1',
      vehicleId: null,
      incidentType: 'x',
      severity: 'minor' as const,
      incidentDate: new Date('2026-09-01'),
      description: null,
      loggedBy: '3',
      createdAt: null,
      updatedAt: newer,
      updatedBy: '3',
    };
    const service = build({
      findDriverById: () => Promise.resolve(makeDriver({ updatedAt: newer })),
      updateDriver: driverUpdate,
      findIncidentById: () => Promise.resolve(incident),
      updateIncident: () => Promise.resolve(incident),
      findVehicleById: () => Promise.resolve(undefined),
    });
    await expect(
      runWithContextAsync(ctx(), () => service.updateDriver('1', { phone: '1' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(driverUpdate).not.toHaveBeenCalled();
    await expect(
      runWithContextAsync(ctx(), () => service.updateIncident('5', { severity: 'severe' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      runWithContextAsync(ctx(), () => service.updateVehicle('9', {}, seen))
    ).rejects.toThrow('Vehicle not found.');
  });
});

describe('FleetVehiclesDriversService guarded hard delete (D-0178, C14)', () => {
  const build = (
    repo: Parameters<typeof fakeFleetRepository>[0],
    realtime = new RecordingFleetRealtime()
  ) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repo),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      realtime
    );

  it('deletes a never-used vehicle (active or not), announces it, and removes its stored photo', async () => {
    const del = vi.fn(() => Promise.resolve(true));
    const realtime = new RecordingFleetRealtime();
    const service = build(
      {
        findVehicleById: () =>
          Promise.resolve(
            makeVehicle({ imagePath: 'https://images.example.com/vehicles/old.png' })
          ),
        vehicleUsage: () => Promise.resolve([]),
        deleteVehicle: del,
      },
      realtime
    );

    const result = await runWithContextAsync(ctx(), () => service.deleteVehicle('1'));

    expect(result).toEqual({ success: true, message: 'Vehicle deleted successfully.' });
    expect(del).toHaveBeenCalledWith('1');
    expect(realtime.fleetChanges.map(c => c.payload)).toMatchObject([
      { entity: 'vehicle', id: '1', action: 'deleted' },
    ]);
  });

  it('a vehicle with history is refused with a 422 naming what is in the way — nothing is deleted or announced', async () => {
    const del = vi.fn(() => Promise.resolve(true));
    const realtime = new RecordingFleetRealtime();
    const service = build(
      {
        findVehicleById: () => Promise.resolve(makeVehicle()),
        vehicleUsage: () => Promise.resolve(['trips', 'fuel logs']),
        deleteVehicle: del,
      },
      realtime
    );
    await expect(runWithContextAsync(ctx(), () => service.deleteVehicle('1'))).rejects.toThrow(
      "This vehicle can't be deleted because it has trips and fuel logs. Deactivate it instead."
    );
    expect(del).not.toHaveBeenCalled();
    expect(realtime.fleetChanges).toEqual([]);
  });

  it("an unknown / another company's vehicle or driver is a plain 404", async () => {
    const service = build({
      findVehicleById: () => Promise.resolve(undefined),
      findDriverById: () => Promise.resolve(undefined),
    });
    await expect(runWithContextAsync(ctx(), () => service.deleteVehicle('9'))).rejects.toThrow(
      'Vehicle not found.'
    );
    await expect(runWithContextAsync(ctx(), () => service.deleteDriver('9'))).rejects.toThrow(
      'Driver not found.'
    );
  });

  it('drivers follow the same rule (trips / assignments / incidents / documents block)', async () => {
    const del = vi.fn(() => Promise.resolve(true));
    const blocked = build({
      findDriverById: () => Promise.resolve(makeDriver()),
      driverUsage: () => Promise.resolve(['vehicle assignments']),
      deleteDriver: del,
    });
    await expect(runWithContextAsync(ctx(), () => blocked.deleteDriver('1'))).rejects.toThrow(
      "This driver can't be deleted because it has vehicle assignments. Deactivate it instead."
    );
    const ok = build({
      findDriverById: () => Promise.resolve(makeDriver()),
      driverUsage: () => Promise.resolve([]),
      deleteDriver: del,
    });
    await expect(runWithContextAsync(ctx(), () => ok.deleteDriver('1'))).resolves.toMatchObject({
      message: 'Driver deleted successfully.',
    });
  });

  it('bulk delete: each record goes through the single-record rule — some deleted, some refused with their reason', async () => {
    const service = build({
      findVehicleById: (id: string) => Promise.resolve(makeVehicle({ id, name: `V${id}` })),
      vehicleUsage: (id: string) => Promise.resolve(id === '2' ? ['trips'] : []),
      deleteVehicle: () => Promise.resolve(true),
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.bulkVehicles('delete', { ids: ['1', '2'] })
    );
    const data = (
      result as unknown as {
        data: { results: Array<Record<string, unknown>>; summary: Record<string, number> };
      }
    ).data;
    expect(data.results[0]).toMatchObject({
      id: '1',
      ok: true,
      changed: true,
      message: 'Vehicle deleted successfully.',
    });
    expect(data.results[1]).toMatchObject({
      id: '2',
      ok: false,
      changed: false,
      message: "This vehicle can't be deleted because it has trips. Deactivate it instead.",
    });
    expect(data.summary).toMatchObject({ succeeded: 1, failed: 1, changed: 1 });
  });
});

describe('FleetVehiclesDriversService counts + company-wide incidents (D-0179, B7)', () => {
  const build = (repo: Parameters<typeof fakeFleetRepository>[0]) =>
    new FleetVehiclesDriversService(
      fakeFleetRepository(repo),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeYardHistoryLookup(),
      fakeTripsLookup(),
      new RecordingFleetRealtime()
    );

  it("vehicle and driver counts list every status (0 when empty) with a total, straight from the repository's grouped rows", async () => {
    const service = build({
      vehicleStatusCounts: () =>
        Promise.resolve([
          { status: 'active', count: 40 },
          { status: 'retired', count: 5 },
        ]),
      driverStatusCounts: () =>
        Promise.resolve([
          { status: 'active', count: 30 },
          { status: 'suspended', count: 2 },
        ]),
    });
    const vehicles = await service.vehicleCounts({ includeInactive: true });
    expect(vehicles.data).toEqual({
      total: 45,
      by_status: { active: 40, in_maintenance: 0, retired: 5, sold: 0 },
    });
    const drivers = await service.driverCounts({ includeInactive: true });
    expect(drivers.data).toEqual({
      total: 32,
      by_status: { active: 30, inactive: 0, suspended: 2 },
    });
  });

  it("the company-wide incident list is scoped to the caller's company, paged, and carries the briefs + audit fields; no company = 403", async () => {
    const listIncidents = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: '5',
            driverId: '1',
            vehicleId: '3',
            incidentType: 'speeding',
            severity: 'minor' as const,
            incidentDate: new Date('2026-09-01'),
            description: null,
            loggedBy: '1',
            createdAt: null,
            updatedAt: null,
            updatedBy: null,
          },
        ],
        total: 41,
      })
    );
    const service = build({
      listIncidents,
      driverBriefsByIds: () =>
        Promise.resolve(new Map([['1', { id: '1', firstName: 'Jane', lastName: 'Doe' }]])),
      vehicleBriefsByIds: () =>
        Promise.resolve(new Map([['3', { id: '3', name: 'Truck 3', plate: 'AB-1' }]])),
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.listIncidents({ window: { page: 2, perPage: 20 } })
    );
    expect(listIncidents).toHaveBeenCalledWith({ companyId: '1' }, expect.anything());
    const data = result.data as unknown as {
      items: Array<Record<string, unknown>>;
      pagination: Record<string, number>;
    };
    expect(data.pagination).toMatchObject({ page: 2, per_page: 20, total: 41 });
    expect(data.items[0]).toMatchObject({
      id: '5',
      driver: { first_name: 'Jane' },
      vehicle: { plate: 'AB-1' },
      created_by: '1',
    });
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () =>
        service.listIncidents({ window: { page: 1, perPage: 20 } })
      )
    ).rejects.toThrow('Unauthorized action.');
  });
});
