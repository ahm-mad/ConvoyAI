import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  toBillableEvent,
  toContract,
  toFleetCustomer,
  toInvoice,
  toInvoicePayment,
  toRateCard,
} from './fleet-crm-billing.mapper.js';
import type {
  BillableEvent,
  BillableEventDraft,
  Contract,
  ContractInput,
  CreateInvoiceOptions,
  FleetCustomer,
  FleetCustomerInput,
  Invoice,
  InvoicePayment,
  InvoicePaymentStatus,
  RateCard,
  RateCardInput,
} from './fleet-crm-billing.types.js';

/**
 * All Prisma access for module 4.7. `fleet_customers`/`contracts`/
 * `billable_events`/`invoices`/`invoice_payments` are `company`-ruled
 * (auto-scoped, `tenant-rules.ts`). `rate_cards` is `parent:contracts` (no
 * own tenant column) — every read reached directly by rate-card id joins
 * through `contracts.company_id` by hand, same two-level discipline module
 * 4.4's `findSlotById` established.
 */
export class FleetCrmBillingRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  /**
   * D-0158: a new customer / contract / rate card without an explicit `currency` gets the caller's company default
   * (`companies.currency`; `USD` if there is no company context or the company row is gone). Existing rows keep their own currency.
   */
  private async companyDefaultCurrency(): Promise<string> {
    const companyId = getRequestContext()?.companyId;
    if (!companyId || !/^\d+$/.test(companyId)) return 'USD';
    const company = await this.prisma.companies.findUnique({
      where: { id: BigInt(companyId) },
      select: { currency: true },
    });
    return company?.currency ?? 'USD';
  }

  // ===========================================================================
  // fleet_customers
  // ===========================================================================

  async listFleetCustomers(): Promise<FleetCustomer[]> {
    const rows = await this.prisma.fleet_customers.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toFleetCustomer);
  }

  async createFleetCustomer(input: FleetCustomerInput): Promise<FleetCustomer> {
    const row = await this.prisma.fleet_customers.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension (D-0077 precedent)
        name: input.name,
        customer_type: input.customerType,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        billing_address: input.billingAddress,
        tax_number: input.taxNumber,
        currency: input.currency ?? (await this.companyDefaultCurrency()),
        payment_terms: input.paymentTerms,
        external_crm_id: input.externalCrmId,
        external_erp_id: input.externalErpId,
        is_active: input.isActive ?? true,
        notes: input.notes,
      },
    });
    return toFleetCustomer(row);
  }

  async findFleetCustomerById(id: string): Promise<FleetCustomer | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.fleet_customers.findFirst({ where: { id: BigInt(id) } });
    return row ? toFleetCustomer(row) : undefined;
  }

  async updateFleetCustomer(
    id: string,
    input: Partial<FleetCustomerInput>
  ): Promise<FleetCustomer | undefined> {
    if (!(await this.findFleetCustomerById(id))) return undefined;
    const row = await this.prisma.fleet_customers.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.customerType !== undefined ? { customer_type: input.customerType } : {}),
        ...(input.contactName !== undefined ? { contact_name: input.contactName } : {}),
        ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone } : {}),
        ...(input.billingAddress !== undefined ? { billing_address: input.billingAddress } : {}),
        ...(input.taxNumber !== undefined ? { tax_number: input.taxNumber } : {}),
        ...(input.currency !== undefined && input.currency !== null
          ? { currency: input.currency }
          : {}),
        ...(input.paymentTerms !== undefined ? { payment_terms: input.paymentTerms } : {}),
        ...(input.externalCrmId !== undefined ? { external_crm_id: input.externalCrmId } : {}),
        ...(input.externalErpId !== undefined ? { external_erp_id: input.externalErpId } : {}),
        ...(input.isActive !== undefined && input.isActive !== null
          ? { is_active: input.isActive }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return toFleetCustomer(row);
  }

  /** `fleet_customers.id` -> `invoices`/`billable_events` is `ON DELETE RESTRICT` (confirmed live against `schema.sql`, not assumed) — this throws a real Postgres FK-violation error once the customer has any billing history; the service layer catches it into a clean 422. */
  async deleteFleetCustomer(id: string): Promise<boolean> {
    if (!(await this.findFleetCustomerById(id))) return false;
    await this.prisma.fleet_customers.delete({ where: { id: BigInt(id) } });
    return true;
  }

  // ===========================================================================
  // contracts
  // ===========================================================================

  async listContractsForCustomer(customerId: string): Promise<Contract[]> {
    const rows = await this.prisma.contracts.findMany({
      where: { fleet_customer_id: BigInt(customerId) },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toContract);
  }

  async createContract(customerId: string, input: ContractInput): Promise<Contract> {
    const row = await this.prisma.contracts.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension
        fleet_customer_id: BigInt(customerId),
        reference: input.reference,
        pricing_model: input.pricingModel,
        currency: input.currency ?? (await this.companyDefaultCurrency()),
        payment_terms: input.paymentTerms,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status ?? 'draft',
        sla_terms: input.slaTerms,
        sla_delivery_window_hours: input.slaDeliveryWindowHours,
        notes: input.notes,
      },
    });
    return toContract(row);
  }

  async findContractById(id: string): Promise<Contract | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.contracts.findFirst({ where: { id: BigInt(id) } });
    return row ? toContract(row) : undefined;
  }

  /** `BillingService`'s own lookup — the customer's single `status = 'active'` contract (`scopeActive`), or `undefined` if none (not an error — a zero-rate event set is still generated, Design notes). */
  async findActiveContractForCustomer(customerId: string): Promise<Contract | undefined> {
    const row = await this.prisma.contracts.findFirst({
      where: { fleet_customer_id: BigInt(customerId), status: 'active' },
    });
    return row ? toContract(row) : undefined;
  }

  async updateContract(id: string, input: Partial<ContractInput>): Promise<Contract | undefined> {
    if (!(await this.findContractById(id))) return undefined;
    const row = await this.prisma.contracts.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.pricingModel !== undefined ? { pricing_model: input.pricingModel } : {}),
        ...(input.currency !== undefined && input.currency !== null
          ? { currency: input.currency }
          : {}),
        ...(input.paymentTerms !== undefined ? { payment_terms: input.paymentTerms } : {}),
        ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
        ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
        ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
        ...(input.slaTerms !== undefined ? { sla_terms: input.slaTerms } : {}),
        ...(input.slaDeliveryWindowHours !== undefined
          ? { sla_delivery_window_hours: input.slaDeliveryWindowHours }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return toContract(row);
  }

  /** `contracts.id -> rate_cards.contract_id` is `ON DELETE CASCADE`; `-> billable_events/invoices.contract_id` is `ON DELETE SET NULL` (both confirmed live against `schema.sql`) — a contract delete always succeeds, orphaning (not deleting) its historical billing links. */
  async deleteContract(id: string): Promise<boolean> {
    if (!(await this.findContractById(id))) return false;
    await this.prisma.contracts.delete({ where: { id: BigInt(id) } });
    return true;
  }

  // ===========================================================================
  // rate_cards (parent:contracts)
  // ===========================================================================

  async listRateCardsForContract(contractId: string): Promise<RateCard[]> {
    const rows = await this.prisma.rate_cards.findMany({
      where: { contract_id: BigInt(contractId) },
    });
    return rows.map(toRateCard);
  }

  async createRateCard(contractId: string, input: RateCardInput): Promise<RateCard> {
    const row = await this.prisma.rate_cards.create({
      data: {
        contract_id: BigInt(contractId),
        description: input.description,
        billing_unit: input.billingUnit,
        unit_rate: input.unitRate,
        currency: input.currency ?? (await this.companyDefaultCurrency()),
        surcharge_type: input.surchargeType,
        surcharge_rate: input.surchargeRate,
        vehicle_category: input.vehicleCategory,
        is_active: input.isActive ?? true,
      },
    });
    return toRateCard(row);
  }

  /** No own tenant column — reached directly by rate-card id (not nested under a contract route param), so this joins through `contracts.company_id` by hand, same two-level discipline module 4.4's `findSlotById` established for `yard_slot_events -> yard_slots -> yards`. */
  async findRateCardById(id: string, companyId: string): Promise<RateCard | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.rate_cards.findFirst({
      where: { id: BigInt(id), contracts: { company_id: BigInt(companyId) } },
    });
    return row ? toRateCard(row) : undefined;
  }

  async updateRateCard(id: string, input: Partial<RateCardInput>): Promise<RateCard> {
    const row = await this.prisma.rate_cards.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.billingUnit !== undefined ? { billing_unit: input.billingUnit } : {}),
        ...(input.unitRate !== undefined ? { unit_rate: input.unitRate } : {}),
        ...(input.currency !== undefined && input.currency !== null
          ? { currency: input.currency }
          : {}),
        ...(input.surchargeType !== undefined ? { surcharge_type: input.surchargeType } : {}),
        ...(input.surchargeRate !== undefined ? { surcharge_rate: input.surchargeRate } : {}),
        ...(input.vehicleCategory !== undefined ? { vehicle_category: input.vehicleCategory } : {}),
        ...(input.isActive !== undefined && input.isActive !== null
          ? { is_active: input.isActive }
          : {}),
      },
    });
    return toRateCard(row);
  }

  /** `rate_cards.id -> billable_events.rate_card_id` is `ON DELETE SET NULL` (confirmed live) — always safe to delete. */
  async deleteRateCard(id: string): Promise<void> {
    await this.prisma.rate_cards.delete({ where: { id: BigInt(id) } });
  }

  /** `BillingService::findRateCard()`'s 3 lookups (`'km'`/`'hour'`/`'delivery'`), done as one bulk query keyed by `billing_unit` instead of 3 round-trips — an efficiency simplification, not a behavior change (same `is_active = true` filter, same "first match wins" — the old app's own `->first()` on an unordered query already had no defined tiebreak among duplicates, so keeping the first row per unit here is equally faithful). */
  async activeRateCardsByBillingUnit(
    contractId: string
  ): Promise<Map<string, { id: string; unitRate: number }>> {
    const rows = await this.prisma.rate_cards.findMany({
      where: { contract_id: BigInt(contractId), is_active: true },
    });
    const result = new Map<string, { id: string; unitRate: number }>();
    for (const row of rows) {
      if (!result.has(row.billing_unit)) {
        result.set(row.billing_unit, { id: row.id.toString(), unitRate: Number(row.unit_rate) });
      }
    }
    return result;
  }

  // ===========================================================================
  // billable_events
  // ===========================================================================

  async createBillableEvents(drafts: BillableEventDraft[]): Promise<BillableEvent[]> {
    const created: BillableEvent[] = [];
    for (const draft of drafts) {
      const row = await this.prisma.billable_events.create({
        data: {
          company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension
          trip_id: BigInt(draft.tripId),
          fleet_customer_id: BigInt(draft.fleetCustomerId),
          contract_id: draft.contractId ? BigInt(draft.contractId) : null,
          rate_card_id: draft.rateCardId ? BigInt(draft.rateCardId) : null,
          event_type: draft.eventType,
          description: draft.description,
          quantity: draft.quantity,
          unit: draft.unit,
          unit_rate: draft.unitRate,
          amount: draft.amount,
          currency: draft.currency,
          status: 'pending',
        },
      });
      created.push(toBillableEvent(row));
    }
    return created;
  }

  async listPendingBillableEvents(customerId?: string, tripId?: string): Promise<BillableEvent[]> {
    const rows = await this.prisma.billable_events.findMany({
      where: {
        status: 'pending',
        ...(customerId ? { fleet_customer_id: BigInt(customerId) } : {}),
        ...(tripId ? { trip_id: BigInt(tripId) } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toBillableEvent);
  }

  /** `createInvoice()`'s own event set — pending events for the customer, optionally narrowed to specific ids (empty/omitted = all pending for that customer). */
  async pendingBillableEventsForCustomer(
    customerId: string,
    eventIds: string[]
  ): Promise<BillableEvent[]> {
    const rows = await this.prisma.billable_events.findMany({
      where: {
        fleet_customer_id: BigInt(customerId),
        status: 'pending',
        ...(eventIds.length > 0 ? { id: { in: eventIds.map(id => BigInt(id)) } } : {}),
      },
    });
    return rows.map(toBillableEvent);
  }

  async linkEventsToInvoice(eventIds: string[], invoiceId: string): Promise<void> {
    await this.prisma.billable_events.updateMany({
      where: { id: { in: eventIds.map(id => BigInt(id)) } },
      data: { invoice_id: BigInt(invoiceId), status: 'invoiced' },
    });
  }

  // ===========================================================================
  // invoices
  // ===========================================================================

  async countInvoicesForCompany(): Promise<number> {
    return this.prisma.invoices.count();
  }

  async createInvoice(
    customerId: string,
    contractId: string | null,
    invoiceNumber: string,
    subtotal: number,
    taxAmount: number,
    total: number,
    currency: string,
    options: CreateInvoiceOptions,
    createdBy: string
  ): Promise<Invoice> {
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + options.dueDays * 24 * 60 * 60 * 1000);
    const row = await this.prisma.invoices.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension
        fleet_customer_id: BigInt(customerId),
        contract_id: contractId ? BigInt(contractId) : null,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        currency,
        status: 'issued',
        notes: options.notes,
        created_by: BigInt(createdBy),
      },
    });
    return toInvoice(row);
  }

  async listInvoices(
    filters: { status?: string | undefined; customerId?: string | undefined },
    page: number,
    perPage: number
  ): Promise<{ items: Invoice[]; total: number }> {
    const where = {
      ...(filters.status ? { status: filters.status as Invoice['status'] } : {}),
      ...(filters.customerId ? { fleet_customer_id: BigInt(filters.customerId) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoices.findMany({
        where,
        orderBy: { issue_date: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.invoices.count({ where }),
    ]);
    return { items: rows.map(toInvoice), total };
  }

  async findInvoiceById(id: string): Promise<Invoice | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.invoices.findFirst({ where: { id: BigInt(id) } });
    return row ? toInvoice(row) : undefined;
  }

  async billableEventsForInvoice(invoiceId: string): Promise<BillableEvent[]> {
    const rows = await this.prisma.billable_events.findMany({
      where: { invoice_id: BigInt(invoiceId) },
    });
    return rows.map(toBillableEvent);
  }

  async updateInvoiceForPaymentInitiation(
    id: string,
    gatewayName: string,
    gatewayReference: string | null,
    newStatus: Invoice['status'] | null
  ): Promise<Invoice> {
    const row = await this.prisma.invoices.update({
      where: { id: BigInt(id) },
      data: {
        payment_gateway: gatewayName,
        gateway_reference: gatewayReference,
        ...(newStatus ? { status: newStatus } : {}),
      },
    });
    return toInvoice(row);
  }

  async markInvoicePaid(id: string): Promise<Invoice> {
    const row = await this.prisma.invoices.update({
      where: { id: BigInt(id) },
      data: { status: 'paid', paid_at: new Date() },
    });
    return toInvoice(row);
  }

  // ===========================================================================
  // invoice_payments (append-only)
  // ===========================================================================

  async createInvoicePayment(data: {
    invoiceId: string;
    paymentGateway: string;
    gatewayReference: string | null;
    amount: number;
    currency: string;
    status: InvoicePaymentStatus;
    failureReason: string | null;
    paidAt: Date | null;
    recordedBy: string | null;
  }): Promise<InvoicePayment> {
    const row = await this.prisma.invoice_payments.create({
      data: {
        invoice_id: BigInt(data.invoiceId),
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension
        payment_gateway: data.paymentGateway,
        gateway_reference: data.gatewayReference,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        paid_at: data.paidAt,
        failure_reason: data.failureReason,
        recorded_by: data.recordedBy ? BigInt(data.recordedBy) : null,
      },
    });
    return toInvoicePayment(row);
  }

  async listPaymentsForInvoice(invoiceId: string): Promise<InvoicePayment[]> {
    const rows = await this.prisma.invoice_payments.findMany({
      where: { invoice_id: BigInt(invoiceId) },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toInvoicePayment);
  }
}
