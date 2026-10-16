import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetCrmBillingService } from '../fleet-crm-billing.service.js';
import {
  fakeFleetCrmBillingRepository,
  fakeForeignKeyViolation,
  fakeTripsLookup,
} from './fakes.js';
import type {
  BillableEvent,
  Contract,
  FleetCustomer,
  Invoice,
  RateCard,
} from '../fleet-crm-billing.types.js';

function makeRateCard(overrides: Partial<RateCard> = {}): RateCard {
  return {
    id: '1',
    contractId: '1',
    description: 'Per km',
    billingUnit: 'km',
    unitRate: 2,
    currency: 'USD',
    surchargeType: null,
    surchargeRate: null,
    vehicleCategory: null,
    isActive: true,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

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

function makeCustomer(overrides: Partial<FleetCustomer> = {}): FleetCustomer {
  return {
    id: '1',
    companyId: '1',
    name: 'Acme Logistics',
    customerType: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    billingAddress: null,
    taxNumber: null,
    currency: 'USD',
    paymentTerms: null,
    externalCrmId: null,
    externalErpId: null,
    isActive: true,
    notes: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: '1',
    companyId: '1',
    fleetCustomerId: '1',
    reference: null,
    pricingModel: 'per-km',
    currency: 'USD',
    paymentTerms: null,
    startDate: null,
    endDate: null,
    status: 'active',
    slaTerms: null,
    slaDeliveryWindowHours: null,
    notes: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<BillableEvent> = {}): BillableEvent {
  return {
    id: '1',
    companyId: '1',
    tripId: '1',
    fleetCustomerId: '1',
    contractId: '1',
    rateCardId: '1',
    eventType: 'distance',
    description: '100 km',
    quantity: 100,
    unit: 'km',
    unitRate: 2,
    amount: 200,
    currency: 'USD',
    invoiceId: null,
    status: 'pending',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: '1',
    companyId: '1',
    fleetCustomerId: '1',
    contractId: '1',
    invoiceNumber: 'INV-00001',
    issueDate: new Date('2026-09-01'),
    dueDate: new Date('2026-10-01'),
    subtotal: 200,
    taxAmount: 0,
    totalAmount: 200,
    currency: 'USD',
    status: 'issued',
    paymentGateway: null,
    gatewayReference: null,
    paidAt: null,
    notes: null,
    createdBy: '1',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('FleetCrmBillingService.deleteFleetCustomer', () => {
  it('returns a clean 422 when the customer has billing history (real Postgres FK RESTRICT), not a raw 500', async () => {
    const repo = fakeFleetCrmBillingRepository({
      deleteFleetCustomer: () => Promise.reject(fakeForeignKeyViolation()),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () => service.deleteFleetCustomer('1'))
    ).rejects.toThrow(ValidationError);
  });

  it('returns 404 when the customer does not exist', async () => {
    const repo = fakeFleetCrmBillingRepository({
      deleteFleetCustomer: () => Promise.resolve(false),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () => service.deleteFleetCustomer('1'))
    ).rejects.toThrow(NotFoundError);
  });

  it('succeeds when the customer has no billing history', async () => {
    const repo = fakeFleetCrmBillingRepository({
      deleteFleetCustomer: () => Promise.resolve(true),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () => service.deleteFleetCustomer('1'));
    expect(result.success).toBe(true);
  });
});

describe('FleetCrmBillingService.createContract / createRateCard', () => {
  it('throws NotFoundError when the parent customer does not exist', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(undefined),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createContract('1', {
          reference: null,
          pricingModel: 'per-km',
          currency: null,
          paymentTerms: null,
          startDate: null,
          endDate: null,
          status: null,
          slaTerms: null,
          slaDeliveryWindowHours: null,
          notes: null,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the parent contract does not exist', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findContractById: () => Promise.resolve(undefined),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createRateCard('1', {
          description: 'Per km',
          billingUnit: 'km',
          unitRate: 2,
          currency: null,
          surchargeType: null,
          surchargeRate: null,
          vehicleCategory: null,
          isActive: null,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });
});

describe('FleetCrmBillingService.generateEvents (KNOWN_ISSUES 11.56)', () => {
  it('throws ValidationError when the trip is not completed', async () => {
    const repo = fakeFleetCrmBillingRepository({});
    const tripsLookup = fakeTripsLookup({
      findTripById: () =>
        Promise.resolve({
          id: '1',
          companyId: '1',
          tripReference: 'TRP-00001',
          status: 'in_progress',
          fleetCustomerId: '1',
          actualDistanceKm: null,
          actualDurationMinutes: null,
        }),
    });
    const service = new FleetCrmBillingService(repo, tripsLookup);

    await expect(runWithContextAsync(ctx(), () => service.generateEvents('1'))).rejects.toThrow(
      ValidationError
    );
  });

  it('throws ValidationError when the trip has no customer', async () => {
    const repo = fakeFleetCrmBillingRepository({});
    const tripsLookup = fakeTripsLookup({
      findTripById: () =>
        Promise.resolve({
          id: '1',
          companyId: '1',
          tripReference: 'TRP-00001',
          status: 'completed',
          fleetCustomerId: null,
          actualDistanceKm: 100,
          actualDurationMinutes: 60,
        }),
    });
    const service = new FleetCrmBillingService(repo, tripsLookup);

    await expect(runWithContextAsync(ctx(), () => service.generateEvents('1'))).rejects.toThrow(
      ValidationError
    );
  });

  it('generates events with no contract (zero-rate) when the customer has none active', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findActiveContractForCustomer: () => Promise.resolve(undefined),
      createBillableEvents: drafts =>
        Promise.resolve(drafts.map((d, i) => makeEvent({ id: String(i + 1), ...d }))),
    });
    const tripsLookup = fakeTripsLookup({
      findTripById: () =>
        Promise.resolve({
          id: '1',
          companyId: '1',
          tripReference: 'TRP-00001',
          status: 'completed',
          fleetCustomerId: '9',
          actualDistanceKm: 100,
          actualDurationMinutes: 60,
        }),
    });
    const service = new FleetCrmBillingService(repo, tripsLookup);

    const result = await runWithContextAsync(ctx(), () => service.generateEvents('1'));

    // Exactly 1 event (distance only — no rate cards to satisfy duration),
    // not 2 — the exact doubling KNOWN_ISSUES 11.56 caused in the old app.
    expect(result.data).toHaveLength(1);
    expect(result.message).toBe('1 billable event(s) generated.');
  });

  it('generates the correct count with a real contract + rate cards (not doubled)', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findActiveContractForCustomer: () => Promise.resolve(makeContract({ id: '5' })),
      activeRateCardsByBillingUnit: () =>
        Promise.resolve(
          new Map([
            ['km', { id: '10', unitRate: 2 }],
            ['hour', { id: '11', unitRate: 20 }],
          ])
        ),
      createBillableEvents: drafts =>
        Promise.resolve(drafts.map((d, i) => makeEvent({ id: String(i + 1), ...d }))),
    });
    const tripsLookup = fakeTripsLookup({
      findTripById: () =>
        Promise.resolve({
          id: '1',
          companyId: '1',
          tripReference: 'TRP-00001',
          status: 'completed',
          fleetCustomerId: '9',
          actualDistanceKm: 100,
          actualDurationMinutes: 60,
        }),
    });
    const service = new FleetCrmBillingService(repo, tripsLookup);

    const result = await runWithContextAsync(ctx(), () => service.generateEvents('1'));

    expect(result.data).toHaveLength(2);
    expect(result.message).toBe('2 billable event(s) generated.');
  });
});

describe('FleetCrmBillingService.createInvoice', () => {
  it("throws NotFoundError when the customer does not belong to the caller's company", async () => {
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(undefined),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createInvoice('1', [], { taxRate: 0, dueDays: 30, notes: null })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when there are no pending events', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(makeCustomer()),
      pendingBillableEventsForCustomer: () => Promise.resolve([]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createInvoice('1', [], { taxRate: 0, dueDays: 30, notes: null })
      )
    ).rejects.toThrow(ValidationError);
  });

  it('computes subtotal/tax/total correctly and links events to the new invoice', async () => {
    let linkedEventIds: string[] | undefined;
    let linkedInvoiceId: string | undefined;
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(makeCustomer()),
      pendingBillableEventsForCustomer: () =>
        Promise.resolve([makeEvent({ id: '1', amount: 200 }), makeEvent({ id: '2', amount: 50 })]),
      countInvoicesForCompany: () => Promise.resolve(4),
      createInvoice: (
        customerId,
        contractId,
        invoiceNumber,
        subtotal,
        taxAmount,
        total,
        currency
      ) =>
        Promise.resolve(
          makeInvoice({
            fleetCustomerId: customerId,
            contractId,
            invoiceNumber,
            subtotal,
            taxAmount,
            totalAmount: total,
            currency,
          })
        ),
      linkEventsToInvoice: (eventIds, invoiceId) => {
        linkedEventIds = eventIds;
        linkedInvoiceId = invoiceId;
        return Promise.resolve();
      },
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () =>
      service.createInvoice('1', [], { taxRate: 0.1, dueDays: 30, notes: null })
    );

    expect(result.data).toMatchObject({
      invoice_number: 'INV-00005',
      subtotal: 250,
      tax_amount: 25,
      total_amount: 275,
    });
    expect(linkedEventIds).toEqual(['1', '2']);
    expect(linkedInvoiceId).toBe('1');
  });
});

describe('FleetCrmBillingService.initiatePayment', () => {
  it('rejects an unregistered gateway', async () => {
    const repo = fakeFleetCrmBillingRepository({});
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () => service.initiatePayment('1', 'stripe'))
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when the invoice is not payable', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(makeInvoice({ status: 'cancelled' })),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    await expect(
      runWithContextAsync(ctx(), () => service.initiatePayment('1', 'manual'))
    ).rejects.toThrow(ValidationError);
  });

  it('initiates a manual payment and moves the invoice to pending', async () => {
    let updatedStatus: string | null | undefined;
    const repo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(makeInvoice({ status: 'issued' })),
      createInvoicePayment: data =>
        Promise.resolve({
          id: '1',
          invoiceId: data.invoiceId,
          companyId: '1',
          paymentGateway: data.paymentGateway,
          gatewayReference: data.gatewayReference,
          gatewayEventId: null,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          paidAt: data.paidAt,
          failureReason: data.failureReason,
          recordedBy: data.recordedBy,
          createdAt: null,
          updatedAt: null,
        }),
      updateInvoiceForPaymentInitiation: (_id, _gateway, _ref, status) => {
        updatedStatus = status;
        return Promise.resolve(makeInvoice());
      },
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () => service.initiatePayment('1', 'manual'));

    expect(result.success).toBe(true);
    expect(result.payment_url).toBeNull();
    expect(updatedStatus).toBe('pending');
    expect((result.data as { gateway_reference: string }).gateway_reference).toMatch(
      /^MANUAL-1-\d+$/
    );
  });
});

describe('FleetCrmBillingService.markPaid', () => {
  it("marks paid with no isPayable guard, matching the old app's own lack of one (ported exactly, not hardened)", async () => {
    let markedPaid = false;
    const repo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(makeInvoice({ status: 'cancelled' })),
      createInvoicePayment: () =>
        Promise.resolve({
          id: '1',
          invoiceId: '1',
          companyId: '1',
          paymentGateway: 'manual',
          gatewayReference: null,
          gatewayEventId: null,
          amount: 200,
          currency: 'USD',
          status: 'paid',
          paidAt: new Date(),
          failureReason: null,
          recordedBy: '1',
          createdAt: null,
          updatedAt: null,
        }),
      markInvoicePaid: () => {
        markedPaid = true;
        return Promise.resolve(makeInvoice({ status: 'paid' }));
      },
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () => service.markPaid('1'));

    expect(result.success).toBe(true);
    expect(markedPaid).toBe(true);
  });
});

describe('FleetCrmBillingService.fleet_customers CRUD (list/create/get/update)', () => {
  it('lists customers', async () => {
    const repo = fakeFleetCrmBillingRepository({
      listFleetCustomers: () => Promise.resolve([makeCustomer()]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () => service.listFleetCustomers());
    expect(result.data).toHaveLength(1);
  });

  it('creates a customer', async () => {
    const repo = fakeFleetCrmBillingRepository({
      createFleetCustomer: input => Promise.resolve(makeCustomer({ name: input.name })),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());

    const result = await runWithContextAsync(ctx(), () =>
      service.createFleetCustomer({
        name: 'Acme',
        customerType: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        billingAddress: null,
        taxNumber: null,
        currency: null,
        paymentTerms: null,
        externalCrmId: null,
        externalErpId: null,
        isActive: null,
        notes: null,
      })
    );
    expect((result.data as { name: string }).name).toBe('Acme');
  });

  it('getFleetCustomer throws NotFoundError when missing, else includes nested contracts', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.getFleetCustomer('1'))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(makeCustomer()),
      listContractsForCustomer: () => Promise.resolve([makeContract()]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.getFleetCustomer('1'));
    expect((result.data as { contracts: unknown[] }).contracts).toHaveLength(1);
  });

  it('updateFleetCustomer throws NotFoundError when missing, else returns the updated row', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      updateFleetCustomer: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.updateFleetCustomer('1', {}))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({
      updateFleetCustomer: () => Promise.resolve(makeCustomer({ name: 'Renamed' })),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () =>
      service.updateFleetCustomer('1', { name: 'Renamed' })
    );
    expect((result.data as { name: string }).name).toBe('Renamed');
  });
});

describe('FleetCrmBillingService.contracts CRUD (list/get/update/delete)', () => {
  it('listContracts throws NotFoundError when the customer is missing', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(undefined),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    await expect(runWithContextAsync(ctx(), () => service.listContracts('1'))).rejects.toThrow(
      NotFoundError
    );
  });

  it('listContracts returns contracts for an existing customer', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findFleetCustomerById: () => Promise.resolve(makeCustomer()),
      listContractsForCustomer: () => Promise.resolve([makeContract()]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.listContracts('1'));
    expect(result.data).toHaveLength(1);
  });

  it('getContract throws NotFoundError when missing, else includes nested rate_cards', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findContractById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(runWithContextAsync(ctx(), () => missingService.getContract('1'))).rejects.toThrow(
      NotFoundError
    );

    const repo = fakeFleetCrmBillingRepository({
      findContractById: () => Promise.resolve(makeContract()),
      listRateCardsForContract: () => Promise.resolve([makeRateCard()]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.getContract('1'));
    expect((result.data as { rate_cards: unknown[] }).rate_cards).toHaveLength(1);
  });

  it('updateContract throws NotFoundError when missing, else returns the updated row', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      updateContract: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.updateContract('1', {}))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({
      updateContract: () => Promise.resolve(makeContract({ status: 'expired' })),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () =>
      service.updateContract('1', { status: 'expired' })
    );
    expect((result.data as { status: string }).status).toBe('expired');
  });

  it('deleteContract throws NotFoundError when missing, else succeeds (always safe — cascades/nulls, no RESTRICT catch needed)', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      deleteContract: () => Promise.resolve(false),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.deleteContract('1'))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({ deleteContract: () => Promise.resolve(true) });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.deleteContract('1'));
    expect(result.success).toBe(true);
  });
});

describe('FleetCrmBillingService.rate_cards CRUD (list/update/delete)', () => {
  it('listRateCards throws NotFoundError when the contract is missing', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findContractById: () => Promise.resolve(undefined),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    await expect(runWithContextAsync(ctx(), () => service.listRateCards('1'))).rejects.toThrow(
      NotFoundError
    );
  });

  it('listRateCards returns rate cards for an existing contract', async () => {
    const repo = fakeFleetCrmBillingRepository({
      findContractById: () => Promise.resolve(makeContract()),
      listRateCardsForContract: () => Promise.resolve([makeRateCard()]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.listRateCards('1'));
    expect(result.data).toHaveLength(1);
  });

  it('updateRateCard throws NotFoundError when the two-level company join finds nothing, else updates', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findRateCardById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.updateRateCard('1', {}))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({
      findRateCardById: () => Promise.resolve(makeRateCard()),
      updateRateCard: () => Promise.resolve(makeRateCard({ unitRate: 5 })),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () =>
      service.updateRateCard('1', { unitRate: 5 })
    );
    expect((result.data as { unit_rate: number }).unit_rate).toBe(5);
  });

  it('deleteRateCard throws NotFoundError when the two-level company join finds nothing, else deletes', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findRateCardById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.deleteRateCard('1'))
    ).rejects.toThrow(NotFoundError);

    let deletedId: string | undefined;
    const repo = fakeFleetCrmBillingRepository({
      findRateCardById: () => Promise.resolve(makeRateCard()),
      deleteRateCard: id => {
        deletedId = id;
        return Promise.resolve();
      },
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.deleteRateCard('1'));
    expect(result.success).toBe(true);
    expect(deletedId).toBe('1');
  });
});

describe('FleetCrmBillingService.listPendingEvents / listInvoices / getInvoice / paymentHistory', () => {
  it('listPendingEvents passes filters through', async () => {
    let receivedArgs: [string | undefined, string | undefined] | undefined;
    const repo = fakeFleetCrmBillingRepository({
      listPendingBillableEvents: (customerId, tripId) => {
        receivedArgs = [customerId, tripId];
        return Promise.resolve([makeEvent()]);
      },
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.listPendingEvents('9', '3'));
    expect(result.data).toHaveLength(1);
    expect(receivedArgs).toEqual(['9', '3']);
  });

  it('listInvoices maps repository rows to JSON', async () => {
    const repo = fakeFleetCrmBillingRepository({
      listInvoices: () => Promise.resolve({ items: [makeInvoice()], total: 1 }),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const { items, total } = await service.listInvoices({}, 1, 20);
    expect(total).toBe(1);
    expect((items[0] as { invoice_number: string }).invoice_number).toBe('INV-00001');
  });

  it('getInvoice throws NotFoundError when missing, else includes billable_events + payments', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(runWithContextAsync(ctx(), () => missingService.getInvoice('1'))).rejects.toThrow(
      NotFoundError
    );

    const repo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(makeInvoice()),
      billableEventsForInvoice: () => Promise.resolve([makeEvent()]),
      listPaymentsForInvoice: () => Promise.resolve([]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.getInvoice('1'));
    expect((result.data as { billable_events: unknown[] }).billable_events).toHaveLength(1);
  });

  it('paymentHistory throws NotFoundError when the invoice is missing, else lists payments', async () => {
    const missingRepo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(undefined),
    });
    const missingService = new FleetCrmBillingService(missingRepo, fakeTripsLookup());
    await expect(
      runWithContextAsync(ctx(), () => missingService.paymentHistory('1'))
    ).rejects.toThrow(NotFoundError);

    const repo = fakeFleetCrmBillingRepository({
      findInvoiceById: () => Promise.resolve(makeInvoice()),
      listPaymentsForInvoice: () =>
        Promise.resolve([
          {
            id: '1',
            invoiceId: '1',
            companyId: '1',
            paymentGateway: 'manual',
            gatewayReference: null,
            gatewayEventId: null,
            amount: 200,
            currency: 'USD',
            status: 'paid' as const,
            paidAt: new Date(),
            failureReason: null,
            recordedBy: '1',
            createdAt: null,
            updatedAt: null,
          },
        ]),
    });
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = await runWithContextAsync(ctx(), () => service.paymentHistory('1'));
    expect(result.data).toHaveLength(1);
  });
});

describe('FleetCrmBillingService.gateways', () => {
  it('returns only the manual gateway (D-0080 — real payment integration deferred)', () => {
    const repo = fakeFleetCrmBillingRepository({});
    const service = new FleetCrmBillingService(repo, fakeTripsLookup());
    const result = service.gateways();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      name: 'manual',
      supports_charge: true,
      supports_webhooks: false,
    });
  });
});
