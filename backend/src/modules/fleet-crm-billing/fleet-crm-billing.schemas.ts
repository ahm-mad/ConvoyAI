import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 4.7. `fleet_customers`/`contracts`/`rate_cards`
 * request shapes are fresh design (no Laravel validation to match — see
 * this module's `types.ts` doc comment). The billing-chain shapes
 * (`createInvoice`/`initiatePayment`) match `BillingController`'s real
 * `$request->validate()` rules exactly.
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const CustomerIdParamSchema = z.object({ id: z.string() });
export const ContractIdParamSchema = z.object({ id: z.string() });
export const RateCardIdParamSchema = z.object({ id: z.string() });
export const InvoiceIdParamSchema = z.object({ id: z.string() });
export const CustomerIdRouteParamSchema = z.object({ customerId: z.string() });
export const ContractIdRouteParamSchema = z.object({ contractId: z.string() });
export const TripIdRouteParamSchema = z.object({ tripId: z.string() });

// -- fleet_customers ------------------------------------------------------------

export const CreateFleetCustomerRequestSchema = z.object({
  name: z.string().max(255),
  customer_type: z.string().max(255).nullable().optional(),
  contact_name: z.string().max(255).nullable().optional(),
  contact_email: z.email().max(255).nullable().optional(),
  contact_phone: z.string().max(255).nullable().optional(),
  billing_address: z.string().nullable().optional(),
  tax_number: z.string().max(255).nullable().optional(),
  currency: z.string().max(3).nullable().optional(),
  payment_terms: z.string().max(255).nullable().optional(),
  external_crm_id: z.string().max(255).nullable().optional(),
  external_erp_id: z.string().max(255).nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateFleetCustomerRequestSchema = CreateFleetCustomerRequestSchema.partial();

// -- contracts --------------------------------------------------------------

export const ContractStatusSchema = z.enum(['draft', 'active', 'expired', 'terminated']);

export const CreateContractRequestSchema = z.object({
  reference: z.string().max(255).nullable().optional(),
  pricing_model: z.string().max(255),
  currency: z.string().max(3).nullable().optional(),
  payment_terms: z.string().max(255).nullable().optional(),
  start_date: z.coerce.date().nullable().optional(),
  end_date: z.coerce.date().nullable().optional(),
  status: ContractStatusSchema.nullable().optional(),
  sla_terms: z.string().nullable().optional(),
  sla_delivery_window_hours: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateContractRequestSchema = CreateContractRequestSchema.partial();

// -- rate_cards --------------------------------------------------------------

export const CreateRateCardRequestSchema = z.object({
  description: z.string().max(255),
  billing_unit: z.string().max(255),
  unit_rate: z.coerce.number().min(0),
  currency: z.string().max(3).nullable().optional(),
  surcharge_type: z.string().max(255).nullable().optional(),
  surcharge_rate: z.coerce.number().min(0).nullable().optional(),
  vehicle_category: z.string().max(255).nullable().optional(),
  is_active: z.boolean().nullable().optional(),
});

export const UpdateRateCardRequestSchema = CreateRateCardRequestSchema.partial();

// -- billing chain ------------------------------------------------------------

export const ListPendingEventsQuerySchema = z.object({
  customer_id: z.string().optional(),
  trip_id: z.string().optional(),
});

export const CreateInvoiceRequestSchema = z.object({
  customer_id: z.union([z.number(), z.string()]),
  event_ids: z.array(z.union([z.number(), z.string()])).optional(),
  tax_rate: z.coerce.number().min(0).max(1).optional(),
  due_days: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().nullable().optional(),
});

export const ListInvoicesQuerySchema = z.object({
  status: z
    .enum(['draft', 'issued', 'pending', 'paid', 'partial', 'overdue', 'cancelled'])
    .optional(),
  customer_id: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const InitiatePaymentRequestSchema = z.object({
  gateway: z.string(),
});

for (const [method, path, summary] of [
  [
    'get',
    '/fleet-customers',
    'Fresh CRUD — no Laravel behavior exists to match (deep-dive confirmed)',
  ],
  ['post', '/fleet-customers', 'Fresh CRUD'],
  ['get', '/fleet-customers/{id}', 'Includes nested contracts'],
  ['put', '/fleet-customers/{id}', 'Fresh CRUD'],
  ['delete', '/fleet-customers/{id}', 'RESTRICT if the customer has any invoices/billable_events'],
  ['get', '/fleet-customers/{customerId}/contracts', 'Fresh CRUD'],
  ['post', '/fleet-customers/{customerId}/contracts', 'Fresh CRUD'],
  ['get', '/contracts/{id}', 'Includes nested rate_cards'],
  ['put', '/contracts/{id}', 'Fresh CRUD'],
  [
    'delete',
    '/contracts/{id}',
    'Cascades rate_cards; orphans (SET NULL) billable_events/invoices links',
  ],
  ['get', '/contracts/{contractId}/rate-cards', 'Fresh CRUD'],
  ['post', '/contracts/{contractId}/rate-cards', 'Fresh CRUD'],
  ['put', '/rate-cards/{id}', 'Fresh CRUD'],
  ['delete', '/rate-cards/{id}', 'Fresh CRUD'],
  [
    'get',
    '/billing/gateways',
    "Only 'manual' registered this pass (D-0080 — real payment integration deferred)",
  ],
  [
    'post',
    '/billing/trips/{tripId}/billable-events',
    'Generates billable events from a completed trip (KNOWN_ISSUES 11.56 fixed)',
  ],
  ['get', '/billing/billable-events', 'Pending (uninvoiced) events for the company'],
  ['post', '/billing/invoices', 'Bundles pending billable events into a new invoice'],
  ['get', '/billing/invoices', 'Laravel-paginator shape'],
  ['get', '/billing/invoices/{id}', 'With billable events + payment history'],
  ['post', '/billing/invoices/{id}/initiate-payment', 'Manual gateway only this pass (D-0080)'],
  ['post', '/billing/invoices/{id}/mark-paid', 'Manual/back-office'],
  ['get', '/billing/invoices/{id}/payments', 'Latest-first'],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-crm-billing'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}
