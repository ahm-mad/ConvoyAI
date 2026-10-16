import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetCrmBillingController } from './fleet-crm-billing.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires the real
 * `all-fleet` permission, same guard as modules 4.1–4.6 —
 * including `fleet_customers`/`contracts`/`rate_cards`, which have no
 * Laravel route to inherit a guard from, so this is a deliberate design
 * choice (matching every sibling fleet resource) rather than a port.
 */
export function createFleetCrmBillingRouter(controller: FleetCrmBillingController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  // -- fleet_customers --------------------------------------------------------
  router.get('/fleet-customers', ...guards, controller.listFleetCustomers);
  router.post('/fleet-customers', ...guards, controller.createFleetCustomer);
  router.get('/fleet-customers/:id', ...guards, controller.getFleetCustomer);
  router.put('/fleet-customers/:id', ...guards, controller.updateFleetCustomer);
  router.delete('/fleet-customers/:id', ...guards, controller.deleteFleetCustomer);

  // -- contracts ------------------------------------------------------------
  router.get('/fleet-customers/:customerId/contracts', ...guards, controller.listContracts);
  router.post('/fleet-customers/:customerId/contracts', ...guards, controller.createContract);
  router.get('/contracts/:id', ...guards, controller.getContract);
  router.put('/contracts/:id', ...guards, controller.updateContract);
  router.delete('/contracts/:id', ...guards, controller.deleteContract);

  // -- rate_cards ------------------------------------------------------------
  router.get('/contracts/:contractId/rate-cards', ...guards, controller.listRateCards);
  router.post('/contracts/:contractId/rate-cards', ...guards, controller.createRateCard);
  router.put('/rate-cards/:id', ...guards, controller.updateRateCard);
  router.delete('/rate-cards/:id', ...guards, controller.deleteRateCard);

  // -- billing chain ----------------------------------------------------------
  router.get('/billing/gateways', ...guards, controller.gateways);
  router.post('/billing/trips/:tripId/billable-events', ...guards, controller.generateEvents);
  router.get('/billing/billable-events', ...guards, controller.listPendingEvents);
  router.post('/billing/invoices', ...guards, controller.createInvoice);
  router.get('/billing/invoices', ...guards, controller.listInvoices);
  router.get('/billing/invoices/:id', ...guards, controller.getInvoice);
  router.post('/billing/invoices/:id/initiate-payment', ...guards, controller.initiatePayment);
  router.post('/billing/invoices/:id/mark-paid', ...guards, controller.markPaid);
  router.get('/billing/invoices/:id/payments', ...guards, controller.paymentHistory);

  return router;
}
