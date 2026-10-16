import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { buildBillableEventDrafts } from './fleet-crm-billing.mapper.js';
import type { FleetCrmBillingRepository } from './fleet-crm-billing.repository.js';
import type {
  BillableEvent,
  Contract,
  ContractInput,
  CreateInvoiceOptions,
  FleetBillingTripsLookup,
  FleetCustomer,
  FleetCustomerInput,
  Invoice,
  InvoicePayment,
  RateCard,
  RateCardInput,
} from './fleet-crm-billing.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

/** Only gateway registered this pass (D-0080 — real payment integration deferred). Matches `ManualPaymentGateway.php`'s exact shape: `charge()` immediately returns `'pending'` with a synthesized reference, no external call. */
const MANUAL_GATEWAY_NAME = 'manual';

/**
 * Business logic for module 4.7 — the last Phase 4 module. Two halves, per
 * this module's own `types.ts` doc comment: fresh CRUD for `fleet_customers`/
 * `contracts`/`rate_cards` (no Laravel behavior to match), and a close port
 * of `BillingService`'s five-stage flow (`generateFromTrip`/`createInvoice`/
 * `initiatePayment`/`markPaid` — `handlePaymentResult`, the webhook-driven
 * stage, is out of scope per D-0080).
 */
export class FleetCrmBillingService {
  constructor(
    private readonly repo: FleetCrmBillingRepository,
    private readonly tripsLookup: FleetBillingTripsLookup
  ) {}

  // ===========================================================================
  // JSON shaping
  // ===========================================================================

  private fleetCustomerJson(c: FleetCustomer): Json {
    return {
      id: c.id,
      company_id: c.companyId,
      name: c.name,
      customer_type: c.customerType,
      contact_name: c.contactName,
      contact_email: c.contactEmail,
      contact_phone: c.contactPhone,
      billing_address: c.billingAddress,
      tax_number: c.taxNumber,
      currency: c.currency,
      payment_terms: c.paymentTerms,
      external_crm_id: c.externalCrmId,
      external_erp_id: c.externalErpId,
      is_active: c.isActive,
      notes: c.notes,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    };
  }

  private contractJson(c: Contract): Json {
    return {
      id: c.id,
      company_id: c.companyId,
      fleet_customer_id: c.fleetCustomerId,
      reference: c.reference,
      pricing_model: c.pricingModel,
      currency: c.currency,
      payment_terms: c.paymentTerms,
      start_date: c.startDate,
      end_date: c.endDate,
      status: c.status,
      sla_terms: c.slaTerms,
      sla_delivery_window_hours: c.slaDeliveryWindowHours,
      notes: c.notes,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    };
  }

  private rateCardJson(r: RateCard): Json {
    return {
      id: r.id,
      contract_id: r.contractId,
      description: r.description,
      billing_unit: r.billingUnit,
      unit_rate: r.unitRate,
      currency: r.currency,
      surcharge_type: r.surchargeType,
      surcharge_rate: r.surchargeRate,
      vehicle_category: r.vehicleCategory,
      is_active: r.isActive,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  private billableEventJson(e: BillableEvent): Json {
    return {
      id: e.id,
      company_id: e.companyId,
      trip_id: e.tripId,
      fleet_customer_id: e.fleetCustomerId,
      contract_id: e.contractId,
      rate_card_id: e.rateCardId,
      event_type: e.eventType,
      description: e.description,
      quantity: e.quantity,
      unit: e.unit,
      unit_rate: e.unitRate,
      amount: e.amount,
      currency: e.currency,
      invoice_id: e.invoiceId,
      status: e.status,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    };
  }

  private invoiceJson(i: Invoice): Json {
    return {
      id: i.id,
      company_id: i.companyId,
      fleet_customer_id: i.fleetCustomerId,
      contract_id: i.contractId,
      invoice_number: i.invoiceNumber,
      issue_date: i.issueDate,
      due_date: i.dueDate,
      subtotal: i.subtotal,
      tax_amount: i.taxAmount,
      total_amount: i.totalAmount,
      currency: i.currency,
      status: i.status,
      payment_gateway: i.paymentGateway,
      gateway_reference: i.gatewayReference,
      paid_at: i.paidAt,
      notes: i.notes,
      created_by: i.createdBy,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
    };
  }

  private invoicePaymentJson(p: InvoicePayment): Json {
    return {
      id: p.id,
      invoice_id: p.invoiceId,
      company_id: p.companyId,
      payment_gateway: p.paymentGateway,
      gateway_reference: p.gatewayReference,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paid_at: p.paidAt,
      failure_reason: p.failureReason,
      recorded_by: p.recordedBy,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  }

  // ===========================================================================
  // fleet_customers (fresh CRUD)
  // ===========================================================================

  async listFleetCustomers() {
    const rows = await this.repo.listFleetCustomers();
    return {
      success: true,
      message: 'Customers retrieved.',
      data: rows.map(r => this.fleetCustomerJson(r)),
    };
  }

  async createFleetCustomer(input: FleetCustomerInput) {
    const customer = await this.repo.createFleetCustomer(input);
    return { success: true, message: 'Customer created.', data: this.fleetCustomerJson(customer) };
  }

  async getFleetCustomer(id: string) {
    const customer = await this.repo.findFleetCustomerById(id);
    if (!customer) throw new NotFoundError('Customer not found.');
    const contracts = await this.repo.listContractsForCustomer(id);
    return {
      success: true,
      message: 'Customer retrieved.',
      data: {
        ...this.fleetCustomerJson(customer),
        contracts: contracts.map(c => this.contractJson(c)),
      },
    };
  }

  async updateFleetCustomer(id: string, input: Partial<FleetCustomerInput>) {
    const updated = await this.repo.updateFleetCustomer(id, input);
    if (!updated) throw new NotFoundError('Customer not found.');
    return { success: true, message: 'Customer updated.', data: this.fleetCustomerJson(updated) };
  }

  /** `fleet_customers.id -> invoices/billable_events` is `ON DELETE RESTRICT` — caught here into a clean 422 rather than letting the real Postgres FK-violation surface as a raw 500. */
  async deleteFleetCustomer(id: string) {
    try {
      const deleted = await this.repo.deleteFleetCustomer(id);
      if (!deleted) throw new NotFoundError('Customer not found.');
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ValidationError('This customer has billing history and cannot be deleted.');
      }
      throw error;
    }
    return { success: true, message: 'Customer deleted.' };
  }

  // ===========================================================================
  // contracts (fresh CRUD)
  // ===========================================================================

  async listContracts(customerId: string) {
    const customer = await this.repo.findFleetCustomerById(customerId);
    if (!customer) throw new NotFoundError('Customer not found.');
    const contracts = await this.repo.listContractsForCustomer(customerId);
    return {
      success: true,
      message: 'Contracts retrieved.',
      data: contracts.map(c => this.contractJson(c)),
    };
  }

  async createContract(customerId: string, input: ContractInput) {
    const customer = await this.repo.findFleetCustomerById(customerId);
    if (!customer) throw new NotFoundError('Customer not found.');
    const contract = await this.repo.createContract(customerId, input);
    return { success: true, message: 'Contract created.', data: this.contractJson(contract) };
  }

  async getContract(id: string) {
    const contract = await this.repo.findContractById(id);
    if (!contract) throw new NotFoundError('Contract not found.');
    const rateCards = await this.repo.listRateCardsForContract(id);
    return {
      success: true,
      message: 'Contract retrieved.',
      data: {
        ...this.contractJson(contract),
        rate_cards: rateCards.map(r => this.rateCardJson(r)),
      },
    };
  }

  async updateContract(id: string, input: Partial<ContractInput>) {
    const updated = await this.repo.updateContract(id, input);
    if (!updated) throw new NotFoundError('Contract not found.');
    return { success: true, message: 'Contract updated.', data: this.contractJson(updated) };
  }

  /** `contracts.id -> rate_cards.contract_id` is `ON DELETE CASCADE`, `-> billable_events/invoices.contract_id` is `ON DELETE SET NULL` — always succeeds, no FK-violation catch needed (confirmed live against `schema.sql`, not assumed). */
  async deleteContract(id: string) {
    const deleted = await this.repo.deleteContract(id);
    if (!deleted) throw new NotFoundError('Contract not found.');
    return { success: true, message: 'Contract deleted.' };
  }

  // ===========================================================================
  // rate_cards (fresh CRUD)
  // ===========================================================================

  async listRateCards(contractId: string) {
    const contract = await this.repo.findContractById(contractId);
    if (!contract) throw new NotFoundError('Contract not found.');
    const rateCards = await this.repo.listRateCardsForContract(contractId);
    return {
      success: true,
      message: 'Rate cards retrieved.',
      data: rateCards.map(r => this.rateCardJson(r)),
    };
  }

  async createRateCard(contractId: string, input: RateCardInput) {
    const contract = await this.repo.findContractById(contractId);
    if (!contract) throw new NotFoundError('Contract not found.');
    const rateCard = await this.repo.createRateCard(contractId, input);
    return { success: true, message: 'Rate card created.', data: this.rateCardJson(rateCard) };
  }

  async updateRateCard(id: string, input: Partial<RateCardInput>) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const rateCard = await this.repo.findRateCardById(id, context.companyId);
    if (!rateCard) throw new NotFoundError('Rate card not found.');
    const updated = await this.repo.updateRateCard(id, input);
    return { success: true, message: 'Rate card updated.', data: this.rateCardJson(updated) };
  }

  async deleteRateCard(id: string) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const rateCard = await this.repo.findRateCardById(id, context.companyId);
    if (!rateCard) throw new NotFoundError('Rate card not found.');
    await this.repo.deleteRateCard(id);
    return { success: true, message: 'Rate card deleted.' };
  }

  // ===========================================================================
  // Billing chain — stage 1: billable events
  // ===========================================================================

  gateways() {
    return {
      success: true,
      data: [
        {
          name: MANUAL_GATEWAY_NAME,
          label: 'Manual (cash / bank transfer / cheque)',
          supports_charge: true,
          supports_hosted_page: false,
          supports_refunds: false,
          supports_webhooks: false,
          supports_polling: false,
        },
      ],
    };
  }

  /**
   * `BillingService::generateFromTrip()` — KNOWN_ISSUES 11.56 fixed: the old
   * app reused one `$events` variable for both the raw draft array and the
   * created-model accumulator, doubling the returned count with a
   * mixed-type array. Accumulated into a separate array here instead.
   */
  async generateEvents(tripId: string) {
    const trip = await this.tripsLookup.findTripById(tripId);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (trip.status !== 'completed') {
      throw new ValidationError(
        `Billable events can only be generated from a completed trip (status: ${trip.status}).`
      );
    }
    if (!trip.fleetCustomerId) {
      throw new ValidationError(
        `Trip ${trip.tripReference ?? trip.id} has no customer — cannot generate billable events.`
      );
    }

    const contract = await this.repo.findActiveContractForCustomer(trip.fleetCustomerId);
    const rateCardByBillingUnit = contract
      ? await this.repo.activeRateCardsByBillingUnit(contract.id)
      : new Map<string, { id: string; unitRate: number }>();

    const drafts = buildBillableEventDrafts(
      {
        id: trip.id,
        fleetCustomerId: trip.fleetCustomerId,
        actualDistanceKm: trip.actualDistanceKm,
        actualDurationMinutes: trip.actualDurationMinutes,
      },
      contract ? { id: contract.id, currency: contract.currency } : null,
      rateCardByBillingUnit
    );

    const created = await this.repo.createBillableEvents(drafts);

    return {
      success: true,
      message: `${String(created.length)} billable event(s) generated.`,
      data: created.map(e => this.billableEventJson(e)),
    };
  }

  async listPendingEvents(customerId: string | undefined, tripId: string | undefined) {
    const events = await this.repo.listPendingBillableEvents(customerId, tripId);
    return { success: true, data: events.map(e => this.billableEventJson(e)) };
  }

  // ===========================================================================
  // Billing chain — stage 2: invoices
  // ===========================================================================

  /** `BillingService::createInvoice()` — `customer_id`/`event_ids.*` are bare global-existence checks in Laravel's own validation (`exists:fleet_customers,id`/`exists:billable_events,id`, no company scoping), but the actual query underneath is already `forCompany($companyId)`-scoped, so a foreign id can never actually match a row — not a real cross-tenant leak in either app. Added an explicit customer lookup here anyway, for a clean 404 instead of a misleading "no pending events" 422 on a genuinely wrong id (Design notes, not a security fix). */
  async createInvoice(customerId: string, eventIds: string[], options: CreateInvoiceOptions) {
    const context = requireContext();
    const customer = await this.repo.findFleetCustomerById(customerId);
    if (!customer) throw new NotFoundError('Customer not found.');

    const events = await this.repo.pendingBillableEventsForCustomer(customerId, eventIds);
    if (events.length === 0) {
      throw new ValidationError('No pending billable events found for this customer.');
    }

    const subtotal = round(
      events.reduce((sum, e) => sum + e.amount, 0),
      2
    );
    const taxAmount = round(subtotal * options.taxRate, 2);
    const total = round(subtotal + taxAmount, 2);
    const currency = events[0]?.currency ?? customer.currency;
    const contractId = events[0]?.contractId ?? null;

    const invoiceNumber = await this.generateInvoiceNumber();
    const invoice = await this.repo.createInvoice(
      customerId,
      contractId,
      invoiceNumber,
      subtotal,
      taxAmount,
      total,
      currency,
      options,
      context.userId
    );

    await this.repo.linkEventsToInvoice(
      events.map(e => e.id),
      invoice.id
    );

    return {
      success: true,
      message: `Invoice ${invoice.invoiceNumber} created.`,
      data: this.invoiceJson(invoice),
    };
  }

  /** `BillingService::generateInvoiceNumber()` — `INV-%05d`, sequential per company. Same count-then-insert race as module 4.2's `TRP-%05d` trip-reference generation (not hardened there either) — matched, not hardened, per the same judgment call. */
  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.repo.countInvoicesForCompany();
    return `INV-${String(count + 1).padStart(5, '0')}`;
  }

  async listInvoices(
    filters: { status?: string | undefined; customerId?: string | undefined },
    page: number,
    perPage: number
  ): Promise<{ items: Json[]; total: number }> {
    const { items, total } = await this.repo.listInvoices(filters, page, perPage);
    return { items: items.map(i => this.invoiceJson(i)), total };
  }

  async getInvoice(id: string) {
    const invoice = await this.repo.findInvoiceById(id);
    if (!invoice) throw new NotFoundError('Invoice not found.');
    const [events, payments] = await Promise.all([
      this.repo.billableEventsForInvoice(id),
      this.repo.listPaymentsForInvoice(id),
    ]);
    return {
      success: true,
      data: {
        ...this.invoiceJson(invoice),
        billable_events: events.map(e => this.billableEventJson(e)),
        payments: payments.map(p => this.invoicePaymentJson(p)),
      },
    };
  }

  // ===========================================================================
  // Billing chain — stage 3/5: payments (manual gateway only, D-0080)
  // ===========================================================================

  private isPayable(invoice: Invoice): boolean {
    return (['issued', 'pending', 'partial', 'overdue'] as Invoice['status'][]).includes(
      invoice.status
    );
  }

  /** `BillingService::initiatePayment()` — only the `manual` gateway is registered this pass (D-0080); `ManualPaymentGateway::charge()` ported exactly (immediately returns `'pending'` with a synthesized `MANUAL-{invoiceId}-{timestamp}` reference, no external call). */
  async initiatePayment(invoiceId: string, gatewayName: string) {
    const context = requireContext();
    if (gatewayName !== MANUAL_GATEWAY_NAME) {
      throw new ValidationError(
        `The selected gateway is invalid. Registered: ${MANUAL_GATEWAY_NAME}.`,
        {
          gateway: [`The selected gateway is invalid. Registered: ${MANUAL_GATEWAY_NAME}.`],
        }
      );
    }

    const invoice = await this.repo.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found.');
    if (!this.isPayable(invoice)) {
      throw new ValidationError(
        `Invoice ${invoice.invoiceNumber} is not in a payable state (status: ${invoice.status}).`
      );
    }

    const gatewayReference = `MANUAL-${invoice.id}-${String(Date.now())}`;
    const payment = await this.repo.createInvoicePayment({
      invoiceId: invoice.id,
      paymentGateway: MANUAL_GATEWAY_NAME,
      gatewayReference,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      status: 'pending',
      failureReason: null,
      paidAt: null,
      recordedBy: context.userId,
    });

    await this.repo.updateInvoiceForPaymentInitiation(
      invoiceId,
      MANUAL_GATEWAY_NAME,
      gatewayReference,
      'pending'
    );

    return {
      success: true,
      message: 'Payment initiated.',
      data: this.invoicePaymentJson(payment),
      payment_url: null,
    };
  }

  /** `BillingService::markPaid()` — ported exactly, including the old app's own lack of an `isPayable()` guard (no `LogicException` anywhere in the source method; a cancelled invoice can be marked paid same as a pending one — not this module's call to add a guard the old app never had). */
  async markPaid(invoiceId: string) {
    const context = requireContext();
    const invoice = await this.repo.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found.');

    await this.repo.createInvoicePayment({
      invoiceId: invoice.id,
      paymentGateway: invoice.paymentGateway ?? MANUAL_GATEWAY_NAME,
      gatewayReference: null,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      status: 'paid',
      failureReason: null,
      paidAt: new Date(),
      recordedBy: context.userId,
    });
    await this.repo.markInvoicePaid(invoiceId);

    return { success: true, message: `Invoice ${invoice.invoiceNumber} marked as paid.` };
  }

  async paymentHistory(invoiceId: string) {
    const invoice = await this.repo.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found.');
    const payments = await this.repo.listPaymentsForInvoice(invoiceId);
    return { success: true, data: payments.map(p => this.invoicePaymentJson(p)) };
  }
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Postgres FK-violation error code (`23503`), surfaced through Prisma as `PrismaClientKnownRequestError` with `code: "P2003"`. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
}
