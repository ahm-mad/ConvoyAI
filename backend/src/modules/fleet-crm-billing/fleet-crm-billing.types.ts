/**
 * Module 4.7 — the last Phase 4 module. Two genuinely different halves,
 * confirmed via the out-of-band deep-dive (`reference/deep-dives/
 * fleet-crm-billing.md`, written 2026-09-16 per D-0080) before designing
 * either:
 *
 * 1. **`fleet_customers`/`contracts`/`rate_cards` CRUD — fresh design.**
 *    Zero Laravel HTTP endpoints exist for any of these (confirmed by an
 *    exhaustive grep across `app/` in the deep-dive) — there is no old-app
 *    behavior to match, only the schema shape. `vendors`/`customer_locations`
 *    are deliberately NOT built this pass (user-deferred, see this file's
 *    own doc comment on `tenant-rules.ts`'s module 4.7 section) — zero code
 *    references either table anywhere in Laravel; flagged for a future pass
 *    when there's an actual product ask, not built speculatively now.
 * 2. **The billable-event → invoice → payment chain — a genuinely
 *    well-built, live Laravel feature, ported closely.** `BillingService`'s
 *    five-stage flow (`generateFromTrip`/`createInvoice`/`initiatePayment`/
 *    `handlePaymentResult`/`markPaid`) and the `PaymentGateway` abstraction
 *    are both strong reference designs. Per D-0080 (still in force): real
 *    payment-gateway integration (Stripe, `PaymentWebhookController`'s
 *    equivalent) is deferred — only a `ManualPaymentGateway`-equivalent is
 *    registered, `handlePaymentResult()` (webhook-driven) is out of scope,
 *    and `initiatePayment`/`markPaid` are the only two ways an invoice
 *    reaches `paid` in this pass.
 *
 * KNOWN_ISSUES 11.56 (`generateFromTrip()`'s reused-variable double-array
 * bug) fixed while porting, not carried forward — see the service's own
 * doc comment.
 */

// ===========================================================================
// fleet_customers / contracts / rate_cards (fresh CRUD)
// ===========================================================================

export interface FleetCustomer {
  id: string;
  companyId: string;
  name: string;
  customerType: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  currency: string;
  paymentTerms: string | null;
  externalCrmId: string | null;
  externalErpId: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface FleetCustomerInput {
  name: string;
  customerType: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  taxNumber: string | null;
  currency: string | null;
  paymentTerms: string | null;
  externalCrmId: string | null;
  externalErpId: string | null;
  isActive: boolean | null;
  notes: string | null;
}

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface Contract {
  id: string;
  companyId: string;
  fleetCustomerId: string;
  reference: string | null;
  pricingModel: string;
  currency: string;
  paymentTerms: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ContractStatus;
  slaTerms: string | null;
  slaDeliveryWindowHours: number | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ContractInput {
  reference: string | null;
  pricingModel: string;
  currency: string | null;
  paymentTerms: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ContractStatus | null;
  slaTerms: string | null;
  slaDeliveryWindowHours: number | null;
  notes: string | null;
}

export interface RateCard {
  id: string;
  contractId: string;
  description: string;
  billingUnit: string;
  unitRate: number;
  currency: string;
  surchargeType: string | null;
  surchargeRate: number | null;
  vehicleCategory: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface RateCardInput {
  description: string;
  billingUnit: string;
  unitRate: number;
  currency: string | null;
  surchargeType: string | null;
  surchargeRate: number | null;
  vehicleCategory: string | null;
  isActive: boolean | null;
}

// ===========================================================================
// Billing chain (ported from BillingService)
// ===========================================================================

export type BillableEventType = 'distance' | 'duration' | 'delivery';
export type BillableEventStatus = 'pending' | 'invoiced' | 'cancelled';

export interface BillableEvent {
  id: string;
  companyId: string;
  tripId: string;
  fleetCustomerId: string;
  contractId: string | null;
  rateCardId: string | null;
  eventType: BillableEventType;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitRate: number;
  amount: number;
  currency: string;
  invoiceId: string | null;
  status: BillableEventStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** The pre-persistence shape `buildEvents()` produces — separated from `BillableEvent` so it can be unit-tested with no DB (matching `BillingService::buildEvents()`'s own "separated so it can be unit-tested without DB writes" design). */
export interface BillableEventDraft {
  tripId: string;
  fleetCustomerId: string;
  contractId: string | null;
  rateCardId: string | null;
  eventType: BillableEventType;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  amount: number;
  currency: string;
}

export type InvoiceStatus =
  'draft' | 'issued' | 'pending' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  companyId: string;
  fleetCustomerId: string;
  contractId: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  paymentGateway: string | null;
  gatewayReference: string | null;
  paidAt: Date | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateInvoiceOptions {
  taxRate: number;
  dueDays: number;
  notes: string | null;
}

export type InvoicePaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  companyId: string;
  paymentGateway: string;
  gatewayReference: string | null;
  gatewayEventId: string | null;
  amount: number;
  currency: string;
  status: InvoicePaymentStatus;
  paidAt: Date | null;
  failureReason: string | null;
  recordedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `PaymentResult` DTO (`app/Domain/Fleet/DataTransferObjects/PaymentResult.php`) — the normalised shape every gateway returns. Only the `ManualPaymentGateway` equivalent is implemented this pass (D-0080). */
export interface PaymentResult {
  status: InvoicePaymentStatus;
  gatewayReference: string | null;
  paymentUrl: string | null;
  errorMessage: string | null;
}

/** `GatewayCapabilities` DTO — backs `GET /billing/gateways`. */
export interface GatewayCapabilities {
  name: string;
  label: string;
  supportsCharge: boolean;
  supportsHostedPage: boolean;
  supportsRefunds: boolean;
  supportsWebhooks: boolean;
  supportsPolling: boolean;
}

/** `fleetTripsRepository` doubles as this module's trip lookup for `generateFromTrip()` (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same cross-module pattern as every other fleet module. */
export interface FleetBillingTripsLookup {
  findTripById(id: string): Promise<
    | {
        id: string;
        companyId: string;
        tripReference: string | null;
        status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
        fleetCustomerId: string | null;
        actualDistanceKm: number | null;
        actualDurationMinutes: number | null;
      }
    | undefined
  >;
}
