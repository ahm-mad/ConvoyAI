import type {
  fleet_customers as FleetCustomerRow,
  contracts as ContractRow,
  rate_cards as RateCardRow,
  billable_events as BillableEventRow,
  invoices as InvoiceRow,
  invoice_payments as InvoicePaymentRow,
} from '@prisma/client';
import type {
  BillableEvent,
  BillableEventDraft,
  Contract,
  FleetCustomer,
  Invoice,
  InvoicePayment,
  RateCard,
} from './fleet-crm-billing.types.js';

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toFleetCustomer(row: FleetCustomerRow): FleetCustomer {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    name: row.name,
    customerType: row.customer_type,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    billingAddress: row.billing_address,
    taxNumber: row.tax_number,
    currency: row.currency,
    paymentTerms: row.payment_terms,
    externalCrmId: row.external_crm_id,
    externalErpId: row.external_erp_id,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toContract(row: ContractRow): Contract {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    fleetCustomerId: row.fleet_customer_id.toString(),
    reference: row.reference,
    pricingModel: row.pricing_model,
    currency: row.currency,
    paymentTerms: row.payment_terms,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    slaTerms: row.sla_terms,
    slaDeliveryWindowHours: toNumberOrNull(row.sla_delivery_window_hours),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRateCard(row: RateCardRow): RateCard {
  return {
    id: row.id.toString(),
    contractId: row.contract_id.toString(),
    description: row.description,
    billingUnit: row.billing_unit,
    unitRate: toNumber(row.unit_rate),
    currency: row.currency,
    surchargeType: row.surcharge_type,
    surchargeRate: toNumberOrNull(row.surcharge_rate),
    vehicleCategory: row.vehicle_category,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBillableEvent(row: BillableEventRow): BillableEvent {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    tripId: row.trip_id.toString(),
    fleetCustomerId: row.fleet_customer_id.toString(),
    contractId: row.contract_id?.toString() ?? null,
    rateCardId: row.rate_card_id?.toString() ?? null,
    eventType: row.event_type as BillableEvent['eventType'],
    description: row.description,
    quantity: toNumber(row.quantity),
    unit: row.unit,
    unitRate: toNumber(row.unit_rate),
    amount: toNumber(row.amount),
    currency: row.currency,
    invoiceId: row.invoice_id?.toString() ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    fleetCustomerId: row.fleet_customer_id.toString(),
    contractId: row.contract_id?.toString() ?? null,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    subtotal: toNumber(row.subtotal),
    taxAmount: toNumber(row.tax_amount),
    totalAmount: toNumber(row.total_amount),
    currency: row.currency,
    status: row.status,
    paymentGateway: row.payment_gateway,
    gatewayReference: row.gateway_reference,
    paidAt: row.paid_at,
    notes: row.notes,
    createdBy: row.created_by?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toInvoicePayment(row: InvoicePaymentRow): InvoicePayment {
  return {
    id: row.id.toString(),
    invoiceId: row.invoice_id.toString(),
    companyId: row.company_id.toString(),
    paymentGateway: row.payment_gateway,
    gatewayReference: row.gateway_reference,
    gatewayEventId: row.gateway_event_id,
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at,
    failureReason: row.failure_reason,
    recordedBy: row.recorded_by?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `BillingService::buildEvents()` ported exactly (pure, no DB writes — same
 * "separated so it can be unit-tested" design as the old app). Takes the
 * trip's real metrics + the customer's active contract's rate cards (looked
 * up by the caller, not here) and produces 0-3 draft events:
 *
 * - **Distance**: only if `actualDistanceKm > 0`. Rate = the `'km'` rate
 *   card's `unitRate`, or `0` if none/no contract — a zero-rate line is
 *   still generated (explicit old-app design intent: finance fills in
 *   rates manually later when there's no contract yet).
 * - **Duration**: only if `actualDurationMinutes > 0` **and** a `'hour'`
 *   rate card exists with `unitRate > 0` — a zero/missing hourly rate
 *   silently skips this event entirely, unlike the distance event.
 * - **Delivery**: a single flat-fee line only if a `'delivery'` rate card
 *   exists with `unitRate > 0`.
 */
export function buildBillableEventDrafts(
  trip: {
    id: string;
    fleetCustomerId: string;
    actualDistanceKm: number | null;
    actualDurationMinutes: number | null;
  },
  contract: { id: string; currency: string } | null,
  rateCardByBillingUnit: Map<string, { id: string; unitRate: number }>
): BillableEventDraft[] {
  const drafts: BillableEventDraft[] = [];
  const currency = contract?.currency ?? 'USD';

  if (trip.actualDistanceKm && trip.actualDistanceKm > 0) {
    const rateCard = rateCardByBillingUnit.get('km');
    const unitRate = rateCard?.unitRate ?? 0;
    drafts.push({
      tripId: trip.id,
      fleetCustomerId: trip.fleetCustomerId,
      contractId: contract?.id ?? null,
      rateCardId: rateCard?.id ?? null,
      eventType: 'distance',
      description: `${trip.actualDistanceKm.toFixed(2)} km × ${unitRate.toFixed(4)} ${currency}/km`,
      quantity: trip.actualDistanceKm,
      unit: 'km',
      unitRate,
      amount: round(trip.actualDistanceKm * unitRate, 2),
      currency,
    });
  }

  if (trip.actualDurationMinutes && trip.actualDurationMinutes > 0) {
    const hours = trip.actualDurationMinutes / 60;
    const rateCard = rateCardByBillingUnit.get('hour');
    const unitRate = rateCard?.unitRate ?? 0;
    if (unitRate > 0) {
      drafts.push({
        tripId: trip.id,
        fleetCustomerId: trip.fleetCustomerId,
        contractId: contract?.id ?? null,
        rateCardId: rateCard?.id ?? null,
        eventType: 'duration',
        description: `${hours.toFixed(2)} hours × ${unitRate.toFixed(4)} ${currency}/hr`,
        quantity: round(hours, 4),
        unit: 'hour',
        unitRate,
        amount: round(hours * unitRate, 2),
        currency,
      });
    }
  }

  const deliveryCard = rateCardByBillingUnit.get('delivery');
  if (deliveryCard && deliveryCard.unitRate > 0) {
    drafts.push({
      tripId: trip.id,
      fleetCustomerId: trip.fleetCustomerId,
      contractId: contract?.id ?? null,
      rateCardId: deliveryCard.id,
      eventType: 'delivery',
      description: 'Delivery fee',
      quantity: 1,
      unit: 'delivery',
      unitRate: deliveryCard.unitRate,
      amount: deliveryCard.unitRate,
      currency,
    });
  }

  return drafts;
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
