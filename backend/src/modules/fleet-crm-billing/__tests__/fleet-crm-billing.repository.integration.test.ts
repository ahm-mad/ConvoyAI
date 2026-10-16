import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetCrmBillingRepository } from '../fleet-crm-billing.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers tenant
 * isolation for `fleet_customers`/`contracts`/`billable_events`/`invoices`/
 * `invoice_payments` (all `company`-ruled), the `rate_cards` two-level
 * company join, and — confirmed live against `schema.sql`, not assumed —
 * the real FK behavior a delete endpoint depends on: `fleet_customers`
 * RESTRICTs while it has billing history, `contracts` always cascades/
 * nulls cleanly.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-crm-billing-repo-test.example';

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `CRM Billing Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: companyId,
    },
  });
}

async function seedVehicle(companyId: bigint, label: string) {
  return rawPrisma.vehicles.create({
    data: { company_id: companyId, name: `Vehicle ${label}${MARK}` },
  });
}

async function seedDriver(companyId: bigint, label: string) {
  return rawPrisma.drivers.create({
    data: { company_id: companyId, first_name: 'D', last_name: label },
  });
}

async function seedCompletedTrip(
  companyId: bigint,
  vehicleId: bigint,
  driverId: bigint,
  fleetCustomerId: bigint
) {
  return rawPrisma.trips.create({
    data: {
      company_id: companyId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      fleet_customer_id: fleetCustomerId,
      status: 'completed',
      actual_start_at: new Date(),
      actual_distance_km: 100,
      actual_duration_minutes: 60,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);

  await rawPrisma.invoice_payments.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.invoices.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.billable_events.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.rate_cards.deleteMany({
    where: { contracts: { company_id: { in: companyIds } } },
  });
  await rawPrisma.contracts.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.trips.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.fleet_customers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.users.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetCrmBillingRepository (real Postgres)', () => {
  it("fleet_customers: tenant-scoped — only visible under its own company's context", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const repo = new FleetCrmBillingRepository(prisma);

    const customer = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    expect(customer.companyId).toBe(companyA.id.toString());

    const foundOwn = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findFleetCustomerById(customer.id)
    );
    expect(foundOwn?.id).toBe(customer.id);

    const foundOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findFleetCustomerById(customer.id)
    );
    expect(foundOther).toBeUndefined();
  });

  it("contracts + rate_cards: real create/list, rate_cards' two-level company join via findRateCardById", async () => {
    const companyA = await seedCompany('c1');
    const companyB = await seedCompany('c2');
    const repo = new FleetCrmBillingRepository(prisma);
    const contextA = contextFor(companyA.id.toString());

    const customer = await runWithContextAsync(contextA, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(contextA, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'active',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );
    const rateCard = await repo.createRateCard(contract.id, {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2.5,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    });

    const foundOwn = await repo.findRateCardById(rateCard.id, companyA.id.toString());
    expect(foundOwn?.id).toBe(rateCard.id);

    const foundOther = await repo.findRateCardById(rateCard.id, companyB.id.toString());
    expect(foundOther).toBeUndefined();

    const activeContract = await runWithContextAsync(contextA, () =>
      repo.findActiveContractForCustomer(customer.id)
    );
    expect(activeContract?.id).toBe(contract.id);
  });

  it('fleet_customers.id -> invoices/billable_events is a real ON DELETE RESTRICT — deleting a customer with billing history throws, matching schema.sql exactly (not assumed)', async () => {
    const company = await seedCompany('d');
    const user = await seedUser(company.id, 'd');
    const vehicle = await seedVehicle(company.id, 'd');
    const driver = await seedDriver(company.id, 'd');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString(), user.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const trip = await seedCompletedTrip(company.id, vehicle.id, driver.id, BigInt(customer.id));

    await runWithContextAsync(context, () =>
      repo.createBillableEvents([
        {
          tripId: trip.id.toString(),
          fleetCustomerId: customer.id,
          contractId: null,
          rateCardId: null,
          eventType: 'distance',
          description: '100 km',
          quantity: 100,
          unit: 'km',
          unitRate: 0,
          amount: 0,
          currency: 'USD',
        },
      ])
    );

    await expect(
      runWithContextAsync(context, () => repo.deleteFleetCustomer(customer.id))
    ).rejects.toThrow();
  });

  it('contracts.id -> rate_cards is a real ON DELETE CASCADE, -> billable_events/invoices.contract_id is a real ON DELETE SET NULL — contract delete always succeeds', async () => {
    const company = await seedCompany('e');
    const user = await seedUser(company.id, 'e');
    const vehicle = await seedVehicle(company.id, 'e');
    const driver = await seedDriver(company.id, 'e');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString(), user.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'active',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );
    const rateCard = await repo.createRateCard(contract.id, {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    });
    const trip = await seedCompletedTrip(company.id, vehicle.id, driver.id, BigInt(customer.id));
    const [event] = await runWithContextAsync(context, () =>
      repo.createBillableEvents([
        {
          tripId: trip.id.toString(),
          fleetCustomerId: customer.id,
          contractId: contract.id,
          rateCardId: rateCard.id,
          eventType: 'distance',
          description: '100 km',
          quantity: 100,
          unit: 'km',
          unitRate: 2,
          amount: 200,
          currency: 'USD',
        },
      ])
    );

    const deleted = await runWithContextAsync(context, () => repo.deleteContract(contract.id));
    expect(deleted).toBe(true);

    const rateCardsRemaining = await rawPrisma.rate_cards.findMany({
      where: { id: BigInt(rateCard.id) },
    });
    expect(rateCardsRemaining).toHaveLength(0);

    expect(event).toBeDefined();
    const orphanedEvent = await rawPrisma.billable_events.findUniqueOrThrow({
      where: { id: BigInt(event?.id ?? '0') },
    });
    expect(orphanedEvent.contract_id).toBeNull();
  });

  it('full billing chain: generate events -> create invoice -> initiate payment -> mark paid, real amounts round-trip', async () => {
    const company = await seedCompany('f');
    const user = await seedUser(company.id, 'f');
    const vehicle = await seedVehicle(company.id, 'f');
    const driver = await seedDriver(company.id, 'f');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString(), user.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'active',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );
    await repo.createRateCard(contract.id, {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    });
    const rateCardMap = await repo.activeRateCardsByBillingUnit(contract.id);
    const kmRateCard = rateCardMap.get('km');
    expect(kmRateCard?.unitRate).toBe(2);

    const trip = await seedCompletedTrip(company.id, vehicle.id, driver.id, BigInt(customer.id));
    const events = await runWithContextAsync(context, () =>
      repo.createBillableEvents([
        {
          tripId: trip.id.toString(),
          fleetCustomerId: customer.id,
          contractId: contract.id,
          rateCardId: kmRateCard?.id ?? null,
          eventType: 'distance',
          description: '100 km',
          quantity: 100,
          unit: 'km',
          unitRate: 2,
          amount: 200,
          currency: 'USD',
        },
      ])
    );

    const pending = await runWithContextAsync(context, () =>
      repo.pendingBillableEventsForCustomer(customer.id, [])
    );
    expect(pending).toHaveLength(1);

    const invoiceNumber = `INV-${String((await runWithContextAsync(context, () => repo.countInvoicesForCompany())) + 1).padStart(5, '0')}`;
    const invoice = await runWithContextAsync(context, () =>
      repo.createInvoice(
        customer.id,
        contract.id,
        invoiceNumber,
        200,
        20,
        220,
        'USD',
        { taxRate: 0.1, dueDays: 30, notes: null },
        user.id.toString()
      )
    );
    expect(invoice).toMatchObject({
      invoiceNumber: 'INV-00001',
      subtotal: 200,
      taxAmount: 20,
      totalAmount: 220,
    });

    await runWithContextAsync(context, () =>
      repo.linkEventsToInvoice(
        events.map(e => e.id),
        invoice.id
      )
    );
    expect(events[0]).toBeDefined();
    const linkedEvent = await rawPrisma.billable_events.findUniqueOrThrow({
      where: { id: BigInt(events[0]?.id ?? '0') },
    });
    expect(linkedEvent.status).toBe('invoiced');
    expect(linkedEvent.invoice_id?.toString()).toBe(invoice.id);

    // No longer pending once linked
    const stillPending = await runWithContextAsync(context, () =>
      repo.pendingBillableEventsForCustomer(customer.id, [])
    );
    expect(stillPending).toHaveLength(0);

    const payment = await runWithContextAsync(context, () =>
      repo.createInvoicePayment({
        invoiceId: invoice.id,
        paymentGateway: 'manual',
        gatewayReference: `MANUAL-${invoice.id}-1`,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        status: 'pending',
        failureReason: null,
        paidAt: null,
        recordedBy: user.id.toString(),
      })
    );
    expect(payment.status).toBe('pending');

    const marked = await runWithContextAsync(context, () => repo.markInvoicePaid(invoice.id));
    expect(marked.status).toBe('paid');
    expect(marked.paidAt).not.toBeNull();

    const payments = await runWithContextAsync(context, () =>
      repo.listPaymentsForInvoice(invoice.id)
    );
    expect(payments).toHaveLength(1);
  });

  it('updateFleetCustomer: partial update only touches the given fields, real read-modify-write against Postgres', async () => {
    const company = await seedCompany('g');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
        customerType: 'retail',
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

    const updated = await runWithContextAsync(context, () =>
      repo.updateFleetCustomer(customer.id, { name: 'Acme Renamed' })
    );
    expect(updated).toMatchObject({ name: 'Acme Renamed', customerType: 'retail' });

    const missing = await runWithContextAsync(context, () =>
      repo.updateFleetCustomer('999999', { name: 'Nope' })
    );
    expect(missing).toBeUndefined();
  });

  it('updateContract: real update against Postgres', async () => {
    const company = await seedCompany('h');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'draft',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );

    const updated = await runWithContextAsync(context, () =>
      repo.updateContract(contract.id, { status: 'active' })
    );
    expect(updated?.status).toBe('active');

    const missing = await runWithContextAsync(context, () =>
      repo.updateContract('999999', { status: 'expired' })
    );
    expect(missing).toBeUndefined();
  });

  it('updateRateCard/deleteRateCard: real update and delete against Postgres', async () => {
    const company = await seedCompany('i');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'active',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );
    const rateCard = await repo.createRateCard(contract.id, {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    });

    const updated = await repo.updateRateCard(rateCard.id, { unitRate: 3.5 });
    expect(updated.unitRate).toBe(3.5);

    await repo.deleteRateCard(rateCard.id);
    const remaining = await rawPrisma.rate_cards.findMany({ where: { id: BigInt(rateCard.id) } });
    expect(remaining).toHaveLength(0);
  });

  it('listContractsForCustomer/listRateCardsForContract/listInvoices/listPendingBillableEvents/billableEventsForInvoice/updateInvoiceForPaymentInitiation: real reads/list-filters against Postgres', async () => {
    const company = await seedCompany('j');
    const user = await seedUser(company.id, 'j');
    const vehicle = await seedVehicle(company.id, 'j');
    const driver = await seedDriver(company.id, 'j');
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString(), user.id.toString());

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({
        name: `Acme${MARK}`,
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
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, {
        reference: 'C-1',
        pricingModel: 'per-km',
        currency: null,
        paymentTerms: null,
        startDate: null,
        endDate: null,
        status: 'active',
        slaTerms: null,
        slaDeliveryWindowHours: null,
        notes: null,
      })
    );
    await repo.createRateCard(contract.id, {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    });

    const contracts = await runWithContextAsync(context, () =>
      repo.listContractsForCustomer(customer.id)
    );
    expect(contracts).toHaveLength(1);
    const rateCards = await repo.listRateCardsForContract(contract.id);
    expect(rateCards).toHaveLength(1);
    const rateCard = rateCards[0];
    expect(rateCard).toBeDefined();

    const trip = await seedCompletedTrip(company.id, vehicle.id, driver.id, BigInt(customer.id));
    const events = await runWithContextAsync(context, () =>
      repo.createBillableEvents([
        {
          tripId: trip.id.toString(),
          fleetCustomerId: customer.id,
          contractId: contract.id,
          rateCardId: rateCard?.id ?? null,
          eventType: 'distance',
          description: '100 km',
          quantity: 100,
          unit: 'km',
          unitRate: 2,
          amount: 200,
          currency: 'USD',
        },
      ])
    );

    const pendingByTrip = await runWithContextAsync(context, () =>
      repo.listPendingBillableEvents(undefined, trip.id.toString())
    );
    expect(pendingByTrip).toHaveLength(1);

    const invoice = await runWithContextAsync(context, () =>
      repo.createInvoice(
        customer.id,
        contract.id,
        'INV-00001',
        200,
        0,
        200,
        'USD',
        { taxRate: 0, dueDays: 30, notes: null },
        user.id.toString()
      )
    );
    await runWithContextAsync(context, () =>
      repo.linkEventsToInvoice(
        events.map(e => e.id),
        invoice.id
      )
    );

    const eventsForInvoice = await runWithContextAsync(context, () =>
      repo.billableEventsForInvoice(invoice.id)
    );
    expect(eventsForInvoice).toHaveLength(1);

    const { items: statusFiltered, total: statusTotal } = await runWithContextAsync(context, () =>
      repo.listInvoices({ status: 'issued' }, 1, 20)
    );
    expect(statusTotal).toBe(1);
    expect(statusFiltered).toHaveLength(1);

    const { items: customerFiltered } = await runWithContextAsync(context, () =>
      repo.listInvoices({ customerId: customer.id }, 1, 20)
    );
    expect(customerFiltered).toHaveLength(1);

    const updatedInvoice = await runWithContextAsync(context, () =>
      repo.updateInvoiceForPaymentInitiation(invoice.id, 'manual', 'MANUAL-1-1', 'pending')
    );
    expect(updatedInvoice).toMatchObject({
      paymentGateway: 'manual',
      gatewayReference: 'MANUAL-1-1',
      status: 'pending',
    });
  });

  it("D-0158: a customer / contract / rate card created without a currency defaults to the COMPANY's currency; an explicit one wins; other companies are unaffected", async () => {
    const company = await seedCompany('cur1');
    const other = await seedCompany('cur2');
    await rawPrisma.companies.update({ where: { id: company.id }, data: { currency: 'PKR' } });
    const repo = new FleetCrmBillingRepository(prisma);
    const context = contextFor(company.id.toString());
    const customerInput = {
      name: `Cur${MARK}`,
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
    };
    const contractInput = {
      reference: 'C-CUR',
      pricingModel: 'per-km',
      currency: null,
      paymentTerms: null,
      startDate: null,
      endDate: null,
      status: 'active' as const,
      slaTerms: null,
      slaDeliveryWindowHours: null,
      notes: null,
    };
    const rateInput = {
      description: 'Per km',
      billingUnit: 'km',
      unitRate: 2.5,
      currency: null,
      surchargeType: null,
      surchargeRate: null,
      vehicleCategory: null,
      isActive: null,
    };

    const customer = await runWithContextAsync(context, () =>
      repo.createFleetCustomer(customerInput)
    );
    const contract = await runWithContextAsync(context, () =>
      repo.createContract(customer.id, contractInput)
    );
    const rateCard = await runWithContextAsync(context, () =>
      repo.createRateCard(contract.id, rateInput)
    );
    expect([customer.currency, contract.currency, rateCard.currency]).toEqual([
      'PKR',
      'PKR',
      'PKR',
    ]);

    const explicit = await runWithContextAsync(context, () =>
      repo.createFleetCustomer({ ...customerInput, name: `Explicit${MARK}`, currency: 'EUR' })
    );
    expect(explicit.currency).toBe('EUR');

    // A company that never set one keeps the schema default.
    const otherCustomer = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.createFleetCustomer({ ...customerInput, name: `Other${MARK}` })
    );
    expect(otherCustomer.currency).toBe('USD');

    // Changing the company default later does not rewrite existing rows.
    await rawPrisma.companies.update({ where: { id: company.id }, data: { currency: 'AED' } });
    const reread = await runWithContextAsync(context, () =>
      repo.findFleetCustomerById(customer.id)
    );
    expect(reread?.currency).toBe('PKR');
  });
});
