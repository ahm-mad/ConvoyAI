import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetFuelMaintenanceComplianceService } from '../fleet-fuel-maintenance-compliance.service.js';
import {
  fakeFleetFuelMaintenanceComplianceRepository,
  fakeVehiclesLookup,
  fakeDriversLookup,
  fakeTripsLookup,
} from './fakes.js';
import type {
  ComplianceDocument,
  CreateComplianceDocumentInput,
  CreateFuelLogInput,
  CreateMaintenanceLogInput,
  CreateMaintenanceScheduleInput,
  FuelLog,
  MaintenanceLog,
  MaintenanceSchedule,
} from '../fleet-fuel-maintenance-compliance.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

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

function makeSchedule(overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
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
    ...overrides,
  };
}

function makeLog(overrides: Partial<MaintenanceLog> = {}): MaintenanceLog {
  return {
    id: '1',
    vehicleId: '1',
    maintenanceScheduleId: null,
    serviceType: 'Oil change',
    serviceDate: new Date('2026-09-01'),
    odometerKm: null,
    cost: null,
    vendor: null,
    notes: null,
    loggedBy: '1',
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeFuelLog(overrides: Partial<FuelLog> = {}): FuelLog {
  return {
    id: '1',
    vehicleId: '1',
    fillDate: new Date('2026-09-01'),
    volume: 40,
    unit: 'liters',
    cost: null,
    odometerKm: null,
    isFullTank: true,
    vendor: null,
    loggedBy: '1',
    stationName: null,
    unitPrice: null,
    totalCost: null,
    paymentMethod: null,
    receiptReference: null,
    tripId: null,
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeComplianceDocument(overrides: Partial<ComplianceDocument> = {}): ComplianceDocument {
  return {
    id: '1',
    companyId: '1',
    documentableType: 'vehicle',
    documentableId: '1',
    documentType: 'Registration',
    documentNumber: null,
    issueDate: null,
    expiryDate: null,
    filePath: null,
    notes: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

const MAINTENANCE_SCHEDULE_INPUT: CreateMaintenanceScheduleInput = {
  serviceType: 'Oil change',
  intervalDays: 90,
  intervalKm: null,
  lastServiceDate: null,
  odometerBaselineKm: null,
  odometerBaselineDate: null,
  lastServiceOdometerKm: null,
};

const MAINTENANCE_LOG_INPUT: CreateMaintenanceLogInput = {
  maintenanceScheduleId: null,
  serviceType: 'Oil change',
  serviceDate: new Date('2026-09-01'),
  odometerKm: 1500,
  cost: 50,
  vendor: 'Jiffy Lube',
  notes: null,
};

const FUEL_LOG_INPUT: CreateFuelLogInput = {
  fillDate: new Date('2026-09-01'),
  volume: 40,
  unit: 'liters',
  cost: 74,
  odometerKm: 1000,
  isFullTank: true,
  vendor: 'Shell',
  stationName: 'Shell Main St',
  unitPrice: 1.85,
  totalCost: 74,
  paymentMethod: 'fleet_card',
  receiptReference: 'RCPT-001',
  tripId: null,
};

describe('FleetFuelMaintenanceComplianceService.storeMaintenanceSchedule', () => {
  it("throws NotFoundError when the vehicle does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeMaintenanceSchedule('1', MAINTENANCE_SCHEDULE_INPUT)
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('creates the schedule on success', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createMaintenanceSchedule: (_vehicleId, input) =>
          Promise.resolve(makeSchedule({ serviceType: input.serviceType })),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.storeMaintenanceSchedule('1', MAINTENANCE_SCHEDULE_INPUT)
    );

    expect(result.success).toBe(true);
    expect((result.data as { service_type: string }).service_type).toBe('Oil change');
  });

  it('the response carries next_service_date / is_overdue_by_date (KNOWN_ISSUES 11.81), null without a last service date', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createMaintenanceSchedule: () =>
          Promise.resolve(
            makeSchedule({ intervalDays: 90, lastServiceDate: new Date('2020-01-01T00:00:00Z') })
          ),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.storeMaintenanceSchedule('1', MAINTENANCE_SCHEDULE_INPUT)
    );

    const data = result.data as {
      next_service_date: Date | null;
      is_overdue_by_date: boolean | null;
    };
    expect(data.next_service_date?.toISOString()).toBe('2020-03-31T00:00:00.000Z');
    expect(data.is_overdue_by_date).toBe(true);
  });
});

describe('FleetFuelMaintenanceComplianceService.storeMaintenanceLog', () => {
  it("throws NotFoundError when the vehicle does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () => service.storeMaintenanceLog('1', MAINTENANCE_LOG_INPUT))
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when maintenance_schedule_id does not exist (tightened past Laravel's bare exists check)", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        findMaintenanceScheduleById: () => Promise.resolve(undefined),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeMaintenanceLog('1', { ...MAINTENANCE_LOG_INPUT, maintenanceScheduleId: '999' })
      )
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when maintenance_schedule_id belongs to a different vehicle (new finding: Laravel has zero scoping at all)', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        findMaintenanceScheduleById: () => Promise.resolve(makeSchedule({ vehicleId: '2' })),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeMaintenanceLog('1', { ...MAINTENANCE_LOG_INPUT, maintenanceScheduleId: '5' })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("creates the log and updates the linked schedule's last_service_date/odometer on success", async () => {
    let updatedArgs: [string, Date, number | null] | undefined;
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        findMaintenanceScheduleById: () =>
          Promise.resolve(makeSchedule({ id: '5', vehicleId: '1' })),
        createMaintenanceLog: (_vehicleId, loggedBy, input) =>
          Promise.resolve(
            makeLog({ maintenanceScheduleId: input.maintenanceScheduleId, loggedBy })
          ),
        updateMaintenanceScheduleLastService: (id, serviceDate, odometerKm) => {
          updatedArgs = [id, serviceDate, odometerKm];
          return Promise.resolve();
        },
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx({ userId: '42' }), () =>
      service.storeMaintenanceLog('1', { ...MAINTENANCE_LOG_INPUT, maintenanceScheduleId: '5' })
    );

    expect(result.success).toBe(true);
    expect(updatedArgs).toEqual([
      '5',
      MAINTENANCE_LOG_INPUT.serviceDate,
      MAINTENANCE_LOG_INPUT.odometerKm,
    ]);
  });

  it('does not touch any schedule when maintenance_schedule_id is not given', async () => {
    let updateCalled = false;
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createMaintenanceLog: (_vehicleId, loggedBy) => Promise.resolve(makeLog({ loggedBy })),
        updateMaintenanceScheduleLastService: () => {
          updateCalled = true;
          return Promise.resolve();
        },
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await runWithContextAsync(ctx(), () => service.storeMaintenanceLog('1', MAINTENANCE_LOG_INPUT));

    expect(updateCalled).toBe(false);
  });
});

describe('FleetFuelMaintenanceComplianceService.storeFuelLog', () => {
  it("throws NotFoundError when the vehicle does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () => service.storeFuelLog('1', FUEL_LOG_INPUT))
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when trip_id does not exist (Laravel never validated this field at all)', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup({ findTripById: () => Promise.resolve(undefined) }),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeFuelLog('1', { ...FUEL_LOG_INPUT, tripId: '999' })
      )
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when trip_id belongs to a different vehicle', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup({ findTripById: () => Promise.resolve({ id: '9', vehicleId: '2' }) }),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () =>
        service.storeFuelLog('1', { ...FUEL_LOG_INPUT, tripId: '9' })
      )
    ).rejects.toThrow(ValidationError);
  });

  it('wires every extend_fuel_logs field through to the repository (KNOWN_ISSUES 11.3)', async () => {
    let received: CreateFuelLogInput | undefined;
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createFuelLog: (_vehicleId, _loggedBy, input) => {
          received = input;
          return Promise.resolve(makeFuelLog(input));
        },
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.storeFuelLog('1', FUEL_LOG_INPUT)
    );

    expect(received).toEqual(FUEL_LOG_INPUT);
    expect(result.data).toMatchObject({
      station_name: 'Shell Main St',
      unit_price: 1.85,
      total_cost: 74,
      payment_method: 'fleet_card',
      receipt_reference: 'RCPT-001',
    });
  });

  it('accepts a trip_id that belongs to the same vehicle', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createFuelLog: (_vehicleId, _loggedBy, input) => Promise.resolve(makeFuelLog(input)),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup({ findTripById: () => Promise.resolve({ id: '9', vehicleId: '1' }) }),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.storeFuelLog('1', { ...FUEL_LOG_INPUT, tripId: '9' })
    );

    expect(result.success).toBe(true);
  });
});

describe('FleetFuelMaintenanceComplianceService.storeComplianceDocument', () => {
  it("throws NotFoundError when the vehicle owner does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const input: CreateComplianceDocumentInput = {
      documentableType: 'vehicle',
      documentableId: '1',
      documentType: 'Registration',
      documentNumber: null,
      issueDate: null,
      expiryDate: null,
      notes: null,
    };

    await expect(
      runWithContextAsync(ctx(), () => service.storeComplianceDocument(input))
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when the driver owner does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup(),
      fakeDriversLookup({ findDriverById: () => Promise.resolve(undefined) }),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const input: CreateComplianceDocumentInput = {
      documentableType: 'driver',
      documentableId: '1',
      documentType: 'License',
      documentNumber: null,
      issueDate: null,
      expiryDate: null,
      notes: null,
    };

    await expect(
      runWithContextAsync(ctx(), () => service.storeComplianceDocument(input))
    ).rejects.toThrow(NotFoundError);
  });

  it('creates the document for a valid vehicle owner', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        createComplianceDocument: (documentableType, documentableId, input) =>
          Promise.resolve(
            makeComplianceDocument({
              documentableType,
              documentableId,
              documentType: input.documentType,
            })
          ),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '7', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.storeComplianceDocument({
        documentableType: 'vehicle',
        documentableId: '7',
        documentType: 'Registration',
        documentNumber: null,
        issueDate: null,
        expiryDate: null,
        notes: null,
      })
    );

    expect(result.success).toBe(true);
    expect((result.data as { documentable_id: string }).documentable_id).toBe('7');
  });
});

describe('FleetFuelMaintenanceComplianceService.listComplianceDocuments', () => {
  it("throws NotFoundError when the owner does not belong to the caller's company", async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({}),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await expect(
      runWithContextAsync(ctx(), () => service.listComplianceDocuments('vehicle', '1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('lists documents for a valid owner', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        listComplianceDocuments: () =>
          Promise.resolve({
            items: [makeComplianceDocument(), makeComplianceDocument({ id: '2' })],
            total: 2,
          }),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listComplianceDocuments('vehicle', '1')
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('wraps documents in { items, pagination } only when a window is requested (D-0164, B1)', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        listComplianceDocuments: () =>
          Promise.resolve({ items: [makeComplianceDocument()], total: 23 }),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '1', name: 'Truck 1' }) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const paged = await runWithContextAsync(ctx(), () =>
      service.listComplianceDocuments('vehicle', '1', { window: { page: 2, perPage: 10 } })
    );
    expect(paged.data).toMatchObject({
      pagination: { page: 2, per_page: 10, total: 23, total_pages: 3 },
    });
  });
});

describe('FleetFuelMaintenanceComplianceService.listExpiringSoonComplianceDocuments', () => {
  it('attaches a lean documentable brief per type', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        listExpiringSoonComplianceDocuments: () =>
          Promise.resolve([
            makeComplianceDocument({ id: '1', documentableType: 'vehicle', documentableId: '7' }),
            makeComplianceDocument({ id: '2', documentableType: 'driver', documentableId: '9' }),
          ]),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve({ id: '7', name: 'Truck 1' }) }),
      fakeDriversLookup({
        findDriverById: () => Promise.resolve({ id: '9', firstName: 'Jane', lastName: 'Doe' }),
      }),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listExpiringSoonComplianceDocuments()
    );

    const data = result.data as { documentable: unknown }[];
    expect(data[0]?.documentable).toEqual({ id: '7', name: 'Truck 1' });
    expect(data[1]?.documentable).toEqual({ id: '9', first_name: 'Jane', last_name: 'Doe' });
  });

  it('surfaces a null documentable when the target no longer exists', async () => {
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        listExpiringSoonComplianceDocuments: () =>
          Promise.resolve([
            makeComplianceDocument({ documentableType: 'vehicle', documentableId: '999' }),
          ]),
      }),
      fakeVehiclesLookup({ findVehicleById: () => Promise.resolve(undefined) }),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    const result = await runWithContextAsync(ctx(), () =>
      service.listExpiringSoonComplianceDocuments()
    );

    const data = result.data as { documentable: unknown }[];
    expect(data[0]?.documentable).toBeNull();
  });

  it('D-0188 (C4): the window defaults to 30 days (the original behaviour) and an explicit within_days is passed through', async () => {
    const seen: number[] = [];
    const service = new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository({
        listExpiringSoonComplianceDocuments: (days: number) => {
          seen.push(days);
          return Promise.resolve([]);
        },
      }),
      fakeVehiclesLookup(),
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

    await runWithContextAsync(ctx(), () => service.listExpiringSoonComplianceDocuments());
    await runWithContextAsync(ctx(), () => service.listExpiringSoonComplianceDocuments(90));

    expect(seen).toEqual([30, 90]);
  });
});

describe('FleetFuelMaintenanceComplianceService edit / delete (D-0169, B3)', () => {
  const ownVehicle = fakeVehiclesLookup({
    findVehicleById: id => Promise.resolve(id === '1' ? { id: '1', name: 'Truck 1' } : undefined),
  });
  const build = (
    repo: Parameters<typeof fakeFleetFuelMaintenanceComplianceRepository>[0],
    trips = fakeTripsLookup()
  ) =>
    new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository(repo),
      ownVehicle,
      fakeDriversLookup(),
      trips,
      NO_ACTORS
    );

  it("schedules: update passes only the sent fields; delete keeps the logs; another company's vehicle is a plain 404", async () => {
    const update = vi.fn((_id: string, input: unknown) =>
      Promise.resolve(makeSchedule({ serviceType: (input as { serviceType: string }).serviceType }))
    );
    const del = vi.fn(() => Promise.resolve(true));
    const service = build({
      findMaintenanceScheduleById: (id: string) =>
        Promise.resolve(makeSchedule({ id, vehicleId: id === '9' ? '77' : '1' })),
      updateMaintenanceSchedule: update,
      deleteMaintenanceScheduleKeepingLogs: del,
    });

    const updated = await runWithContextAsync(ctx(), () =>
      service.updateMaintenanceSchedule('1', { serviceType: 'Brake check' })
    );
    expect(update).toHaveBeenCalledWith('1', { serviceType: 'Brake check' });
    expect(updated.message).toBe('Maintenance schedule updated.');
    expect(updated.data).toMatchObject({ service_type: 'Brake check' });

    const deleted = await runWithContextAsync(ctx(), () => service.deleteMaintenanceSchedule('1'));
    expect(del).toHaveBeenCalledWith('1');
    expect(deleted.message).toBe('Maintenance schedule deleted. Its maintenance logs were kept.');

    await expect(
      runWithContextAsync(ctx(), () => service.updateMaintenanceSchedule('9', {}))
    ).rejects.toThrow('Maintenance schedule not found.');
    await expect(
      runWithContextAsync(ctx(), () => service.deleteMaintenanceSchedule('9'))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleting a maintenance log recomputes the schedule from its newest remaining log (date and the newest odometer reading)', async () => {
    const setLast = vi.fn(() => Promise.resolve());
    const service = build({
      findMaintenanceLogById: () =>
        Promise.resolve(makeLog({ id: '5', maintenanceScheduleId: '3' })),
      deleteMaintenanceLog: () => Promise.resolve(true),
      newestLogsForSchedule: () =>
        Promise.resolve({
          latest: makeLog({ id: '4', serviceDate: new Date('2026-08-01'), odometerKm: null }),
          latestWithOdometer: makeLog({
            id: '2',
            serviceDate: new Date('2026-05-01'),
            odometerKm: 12000,
          }),
        }),
      updateMaintenanceScheduleLastService: setLast,
    });

    const result = await runWithContextAsync(ctx(), () => service.deleteMaintenanceLog('5'));

    expect(result.message).toBe('Maintenance log deleted.');
    expect(setLast).toHaveBeenCalledWith('3', new Date('2026-08-01'), 12000);
  });

  it("deleting the last remaining log leaves the schedule's current values alone", async () => {
    const setLast = vi.fn(() => Promise.resolve());
    const service = build({
      findMaintenanceLogById: () => Promise.resolve(makeLog({ maintenanceScheduleId: '3' })),
      deleteMaintenanceLog: () => Promise.resolve(true),
      newestLogsForSchedule: () => Promise.resolve({}),
      updateMaintenanceScheduleLastService: setLast,
    });
    await runWithContextAsync(ctx(), () => service.deleteMaintenanceLog('1'));
    expect(setLast).not.toHaveBeenCalled();
  });

  it('an unlinked log (no schedule) touches no schedule when deleted', async () => {
    const newest = vi.fn();
    const service = build({
      findMaintenanceLogById: () => Promise.resolve(makeLog({ maintenanceScheduleId: null })),
      deleteMaintenanceLog: () => Promise.resolve(true),
      newestLogsForSchedule: newest,
    });
    await runWithContextAsync(ctx(), () => service.deleteMaintenanceLog('1'));
    expect(newest).not.toHaveBeenCalled();
  });

  it('editing a log re-links it: both the old and the new schedule are recomputed; a schedule of another vehicle is a 422', async () => {
    const resynced: string[] = [];
    const service = build({
      findMaintenanceLogById: () => Promise.resolve(makeLog({ maintenanceScheduleId: '3' })),
      findMaintenanceScheduleById: (id: string) =>
        Promise.resolve(makeSchedule({ id, vehicleId: id === '8' ? '77' : '1' })),
      updateMaintenanceLog: (_id: string, input: { maintenanceScheduleId?: string | null }) =>
        Promise.resolve(makeLog({ maintenanceScheduleId: input.maintenanceScheduleId ?? null })),
      newestLogsForSchedule: (id: string) => {
        resynced.push(id);
        return Promise.resolve({});
      },
    });

    const ok = await runWithContextAsync(ctx(), () =>
      service.updateMaintenanceLog('1', { maintenanceScheduleId: '4' })
    );
    expect(ok.message).toBe('Maintenance log updated.');
    expect(resynced.sort()).toEqual(['3', '4']);

    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateMaintenanceLog('1', { maintenanceScheduleId: '8' })
      )
    ).rejects.toThrow('The selected maintenance schedule id is invalid.');
  });

  it("fuel logs: update validates the trip belongs to the same vehicle; delete; another company's log is a 404", async () => {
    const service = build(
      {
        findFuelLogById: (id: string) =>
          Promise.resolve(makeFuelLog({ id, vehicleId: id === '9' ? '77' : '1' })),
        updateFuelLog: () => Promise.resolve(makeFuelLog({ volume: 55 })),
        deleteFuelLog: () => Promise.resolve(true),
      },
      fakeTripsLookup({
        findTripById: tripId =>
          Promise.resolve({ id: tripId, vehicleId: tripId === '7' ? '1' : '2' }),
      })
    );

    expect(
      (
        await runWithContextAsync(ctx(), () =>
          service.updateFuelLog('1', { volume: 55, tripId: '7' })
        )
      ).message
    ).toBe('Fuel log updated.');
    await expect(
      runWithContextAsync(ctx(), () => service.updateFuelLog('1', { tripId: '8' }))
    ).rejects.toThrow('The selected trip id is invalid.');
    expect((await runWithContextAsync(ctx(), () => service.deleteFuelLog('1'))).message).toBe(
      'Fuel log deleted.'
    );
    await expect(runWithContextAsync(ctx(), () => service.deleteFuelLog('9'))).rejects.toThrow(
      'Fuel log not found.'
    );
  });

  it("compliance documents: update / delete; a missing (or other company's) document is a 404", async () => {
    const service = build({
      updateComplianceDocument: (id: string) =>
        Promise.resolve(id === '1' ? makeComplianceDocument({ documentNumber: 'NEW' }) : undefined),
      deleteComplianceDocument: (id: string) => Promise.resolve(id === '1'),
    });

    expect(
      (
        await runWithContextAsync(ctx(), () =>
          service.updateComplianceDocument('1', { documentNumber: 'NEW' })
        )
      ).data
    ).toMatchObject({ document_number: 'NEW' });
    expect(
      (await runWithContextAsync(ctx(), () => service.deleteComplianceDocument('1'))).message
    ).toBe('Document deleted.');
    await expect(
      runWithContextAsync(ctx(), () => service.updateComplianceDocument('2', {}))
    ).rejects.toThrow('Document not found.');
    await expect(
      runWithContextAsync(ctx(), () => service.deleteComplianceDocument('2'))
    ).rejects.toThrow('Document not found.');
  });
});

describe('FleetFuelMaintenanceComplianceService — optimistic concurrency (D-0176, B13)', () => {
  const seen = new Date('2026-09-25T10:00:00Z');
  const newer = new Date('2026-09-25T10:07:00Z');
  const ownVehicle = fakeVehiclesLookup({
    findVehicleById: id => Promise.resolve(id === '1' ? { id: '1', name: 'Truck 1' } : undefined),
  });
  const build = (repo: Parameters<typeof fakeFleetFuelMaintenanceComplianceRepository>[0]) =>
    new FleetFuelMaintenanceComplianceService(
      fakeFleetFuelMaintenanceComplianceRepository(repo),
      ownVehicle,
      fakeDriversLookup(),
      fakeTripsLookup(),
      NO_ACTORS
    );

  it('a stale schedule / maintenance log / fuel log / document edit answers 409 and writes nothing', async () => {
    const writes = vi.fn(() => Promise.resolve(undefined));
    const service = build({
      findMaintenanceScheduleById: () => Promise.resolve(makeSchedule({ updatedAt: newer })),
      findMaintenanceLogById: () => Promise.resolve(makeLog({ updatedAt: newer })),
      findFuelLogById: () => Promise.resolve(makeFuelLog({ updatedAt: newer })),
      findComplianceDocumentById: () =>
        Promise.resolve(makeComplianceDocument({ updatedAt: newer })),
      updateMaintenanceSchedule: writes,
      updateMaintenanceLog: writes,
      updateFuelLog: writes,
      updateComplianceDocument: writes,
    });
    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateMaintenanceSchedule('1', { intervalDays: 5 }, seen)
      )
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      runWithContextAsync(ctx(), () => service.updateMaintenanceLog('1', { notes: 'n' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      runWithContextAsync(ctx(), () => service.updateFuelLog('1', { volume: 1 }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      runWithContextAsync(ctx(), () => service.updateComplianceDocument('1', { notes: 'n' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(writes).not.toHaveBeenCalled();
  });
});
