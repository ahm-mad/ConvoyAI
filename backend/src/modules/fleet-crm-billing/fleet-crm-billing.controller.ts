import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { FleetCrmBillingService } from './fleet-crm-billing.service.js';
import type {
  ContractInput,
  CreateInvoiceOptions,
  FleetCustomerInput,
  RateCardInput,
} from './fleet-crm-billing.types.js';
import {
  ContractIdParamSchema,
  ContractIdRouteParamSchema,
  CreateContractRequestSchema,
  CreateFleetCustomerRequestSchema,
  CreateInvoiceRequestSchema,
  CreateRateCardRequestSchema,
  CustomerIdParamSchema,
  CustomerIdRouteParamSchema,
  InitiatePaymentRequestSchema,
  InvoiceIdParamSchema,
  ListInvoicesQuerySchema,
  ListPendingEventsQuerySchema,
  RateCardIdParamSchema,
  TripIdRouteParamSchema,
  UpdateContractRequestSchema,
  UpdateFleetCustomerRequestSchema,
  UpdateRateCardRequestSchema,
} from './fleet-crm-billing.schemas.js';

function toFleetCustomerInput(
  body: ReturnType<typeof CreateFleetCustomerRequestSchema.parse>
): FleetCustomerInput {
  return {
    name: body.name,
    customerType: body.customer_type ?? null,
    contactName: body.contact_name ?? null,
    contactEmail: body.contact_email ?? null,
    contactPhone: body.contact_phone ?? null,
    billingAddress: body.billing_address ?? null,
    taxNumber: body.tax_number ?? null,
    currency: body.currency ?? null,
    paymentTerms: body.payment_terms ?? null,
    externalCrmId: body.external_crm_id ?? null,
    externalErpId: body.external_erp_id ?? null,
    isActive: body.is_active ?? null,
    notes: body.notes ?? null,
  };
}

/** Partial update — unlike `toFleetCustomerInput`, a field genuinely absent from the request body stays absent (`undefined`) here rather than collapsing to `null`, so the repository's own `!== undefined` checks correctly leave untouched fields alone instead of wiping them. */
function toFleetCustomerUpdateInput(
  body: ReturnType<typeof UpdateFleetCustomerRequestSchema.parse>
): Partial<FleetCustomerInput> {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.customer_type !== undefined ? { customerType: body.customer_type } : {}),
    ...(body.contact_name !== undefined ? { contactName: body.contact_name } : {}),
    ...(body.contact_email !== undefined ? { contactEmail: body.contact_email } : {}),
    ...(body.contact_phone !== undefined ? { contactPhone: body.contact_phone } : {}),
    ...(body.billing_address !== undefined ? { billingAddress: body.billing_address } : {}),
    ...(body.tax_number !== undefined ? { taxNumber: body.tax_number } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.payment_terms !== undefined ? { paymentTerms: body.payment_terms } : {}),
    ...(body.external_crm_id !== undefined ? { externalCrmId: body.external_crm_id } : {}),
    ...(body.external_erp_id !== undefined ? { externalErpId: body.external_erp_id } : {}),
    ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
}

function toContractInput(
  body: ReturnType<typeof CreateContractRequestSchema.parse>
): ContractInput {
  return {
    reference: body.reference ?? null,
    pricingModel: body.pricing_model,
    currency: body.currency ?? null,
    paymentTerms: body.payment_terms ?? null,
    startDate: body.start_date ?? null,
    endDate: body.end_date ?? null,
    status: body.status ?? null,
    slaTerms: body.sla_terms ?? null,
    slaDeliveryWindowHours: body.sla_delivery_window_hours ?? null,
    notes: body.notes ?? null,
  };
}

/** Partial update — see `toFleetCustomerUpdateInput`'s doc comment for why absent fields stay `undefined`, not `null`. */
function toContractUpdateInput(
  body: ReturnType<typeof UpdateContractRequestSchema.parse>
): Partial<ContractInput> {
  return {
    ...(body.reference !== undefined ? { reference: body.reference } : {}),
    ...(body.pricing_model !== undefined ? { pricingModel: body.pricing_model } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.payment_terms !== undefined ? { paymentTerms: body.payment_terms } : {}),
    ...(body.start_date !== undefined ? { startDate: body.start_date } : {}),
    ...(body.end_date !== undefined ? { endDate: body.end_date } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.sla_terms !== undefined ? { slaTerms: body.sla_terms } : {}),
    ...(body.sla_delivery_window_hours !== undefined
      ? { slaDeliveryWindowHours: body.sla_delivery_window_hours }
      : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
}

function toRateCardInput(
  body: ReturnType<typeof CreateRateCardRequestSchema.parse>
): RateCardInput {
  return {
    description: body.description,
    billingUnit: body.billing_unit,
    unitRate: body.unit_rate,
    currency: body.currency ?? null,
    surchargeType: body.surcharge_type ?? null,
    surchargeRate: body.surcharge_rate ?? null,
    vehicleCategory: body.vehicle_category ?? null,
    isActive: body.is_active ?? null,
  };
}

/** Partial update — see `toFleetCustomerUpdateInput`'s doc comment for why absent fields stay `undefined`, not `null`. */
function toRateCardUpdateInput(
  body: ReturnType<typeof UpdateRateCardRequestSchema.parse>
): Partial<RateCardInput> {
  return {
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.billing_unit !== undefined ? { billingUnit: body.billing_unit } : {}),
    ...(body.unit_rate !== undefined ? { unitRate: body.unit_rate } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.surcharge_type !== undefined ? { surchargeType: body.surcharge_type } : {}),
    ...(body.surcharge_rate !== undefined ? { surchargeRate: body.surcharge_rate } : {}),
    ...(body.vehicle_category !== undefined ? { vehicleCategory: body.vehicle_category } : {}),
    ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
  };
}

export class FleetCrmBillingController {
  constructor(private readonly service: FleetCrmBillingService) {}

  // -- fleet_customers --------------------------------------------------------

  listFleetCustomers = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.listFleetCustomers());
  };

  createFleetCustomer = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateFleetCustomerRequestSchema, req.body);
    res.status(201).json(await this.service.createFleetCustomer(toFleetCustomerInput(input)));
  };

  getFleetCustomer = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CustomerIdParamSchema, req.params);
    res.status(200).json(await this.service.getFleetCustomer(id));
  };

  updateFleetCustomer = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CustomerIdParamSchema, req.params);
    const input = parseOrThrow(UpdateFleetCustomerRequestSchema, req.body);
    res
      .status(200)
      .json(await this.service.updateFleetCustomer(id, toFleetCustomerUpdateInput(input)));
  };

  deleteFleetCustomer = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CustomerIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteFleetCustomer(id));
  };

  // -- contracts ----------------------------------------------------------

  listContracts = async (req: Request, res: Response): Promise<void> => {
    const { customerId } = parseOrThrow(CustomerIdRouteParamSchema, req.params);
    res.status(200).json(await this.service.listContracts(customerId));
  };

  createContract = async (req: Request, res: Response): Promise<void> => {
    const { customerId } = parseOrThrow(CustomerIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateContractRequestSchema, req.body);
    res.status(201).json(await this.service.createContract(customerId, toContractInput(input)));
  };

  getContract = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ContractIdParamSchema, req.params);
    res.status(200).json(await this.service.getContract(id));
  };

  updateContract = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ContractIdParamSchema, req.params);
    const input = parseOrThrow(UpdateContractRequestSchema, req.body);
    res.status(200).json(await this.service.updateContract(id, toContractUpdateInput(input)));
  };

  deleteContract = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ContractIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteContract(id));
  };

  // -- rate_cards --------------------------------------------------------

  listRateCards = async (req: Request, res: Response): Promise<void> => {
    const { contractId } = parseOrThrow(ContractIdRouteParamSchema, req.params);
    res.status(200).json(await this.service.listRateCards(contractId));
  };

  createRateCard = async (req: Request, res: Response): Promise<void> => {
    const { contractId } = parseOrThrow(ContractIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateRateCardRequestSchema, req.body);
    res.status(201).json(await this.service.createRateCard(contractId, toRateCardInput(input)));
  };

  updateRateCard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RateCardIdParamSchema, req.params);
    const input = parseOrThrow(UpdateRateCardRequestSchema, req.body);
    res.status(200).json(await this.service.updateRateCard(id, toRateCardUpdateInput(input)));
  };

  deleteRateCard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RateCardIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteRateCard(id));
  };

  // -- billing chain --------------------------------------------------------

  gateways = (_req: Request, res: Response): void => {
    res.status(200).json(this.service.gateways());
  };

  generateEvents = async (req: Request, res: Response): Promise<void> => {
    const { tripId } = parseOrThrow(TripIdRouteParamSchema, req.params);
    res.status(201).json(await this.service.generateEvents(tripId));
  };

  listPendingEvents = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListPendingEventsQuerySchema, req.query);
    res.status(200).json(await this.service.listPendingEvents(query.customer_id, query.trip_id));
  };

  createInvoice = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateInvoiceRequestSchema, req.body);
    const options: CreateInvoiceOptions = {
      taxRate: input.tax_rate ?? 0,
      dueDays: input.due_days ?? 30,
      notes: input.notes ?? null,
    };
    res.status(201).json(
      await this.service.createInvoice(
        String(input.customer_id),
        (input.event_ids ?? []).map(id => String(id)),
        options
      )
    );
  };

  listInvoices = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListInvoicesQuerySchema, req.query);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const { items, total } = await this.service.listInvoices(
      { status: query.status, customerId: query.customer_id },
      page,
      perPage
    );

    const paginator = buildLaravelPaginator({
      items,
      page,
      perPage,
      total,
      path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      query: { status: query.status, customer_id: query.customer_id },
    });

    res.status(200).json({ success: true, data: paginator });
  };

  getInvoice = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(InvoiceIdParamSchema, req.params);
    res.status(200).json(await this.service.getInvoice(id));
  };

  initiatePayment = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(InvoiceIdParamSchema, req.params);
    const input = parseOrThrow(InitiatePaymentRequestSchema, req.body);
    res.status(201).json(await this.service.initiatePayment(id, input.gateway));
  };

  markPaid = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(InvoiceIdParamSchema, req.params);
    res.status(200).json(await this.service.markPaid(id));
  };

  paymentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(InvoiceIdParamSchema, req.params);
    res.status(200).json(await this.service.paymentHistory(id));
  };
}
