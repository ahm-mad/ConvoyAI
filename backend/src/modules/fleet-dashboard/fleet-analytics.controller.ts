import type { Request, Response } from 'express';
import { streamCsv } from '../../platform/http/csv.js';
import { flagValue, mergeIdLists } from '../../platform/http/list-query.js';
import { parseOrThrow } from '../../platform/http/validate.js';
import {
  AnalyticsSummaryQuerySchema,
  AttentionQuerySchema,
  ComplianceReportQuerySchema,
  DriversReportQuerySchema,
  FuelReportQuerySchema,
  IncidentsSummaryQuerySchema,
  GeofenceEventSummaryQuerySchema,
  MaintenanceReportQuerySchema,
  TripsReportQuerySchema,
  UtilisationReportQuerySchema,
  YardSummaryQuerySchema,
} from './fleet-analytics.schemas.js';
import type { FleetActivityService } from './fleet-activity.service.js';
import type { FleetAnalyticsService } from './fleet-analytics.service.js';
import type { FleetAttentionService } from './fleet-attention.service.js';
import type {
  ComplianceReportQuery,
  FleetComplianceReportService,
} from './fleet-compliance-report.service.js';
import type {
  DriversReportQuery,
  FleetDriversReportService,
} from './fleet-drivers-report.service.js';
import type {
  FleetUtilisationReportService,
  UtilisationReportQuery,
} from './fleet-utilisation-report.service.js';
import type { FleetIncidentsSummaryService } from './fleet-incidents-summary.service.js';
import type { FleetFuelReportService, FuelReportQuery } from './fleet-fuel-report.service.js';
import type { FleetMaintenanceReportService } from './fleet-maintenance-report.service.js';
import type { FleetTripsReportService, TripsReportQuery } from './fleet-trips-report.service.js';
import type { VehicleScope } from './fleet-dashboard.types.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. */
export class FleetAnalyticsController {
  constructor(
    private readonly analytics: FleetAnalyticsService,
    private readonly attention: FleetAttentionService,
    private readonly activity: FleetActivityService,
    private readonly tripsReport: FleetTripsReportService,
    private readonly fuelReport: FleetFuelReportService,
    private readonly maintenanceReport: FleetMaintenanceReportService,
    private readonly complianceReport: FleetComplianceReportService,
    private readonly driversReport: FleetDriversReportService,
    private readonly incidentsSummary: FleetIncidentsSummaryService,
    private readonly utilisationReport: FleetUtilisationReportService
  ) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(AnalyticsSummaryQuerySchema, req.query);
    const scope: VehicleScope = {
      vehicleCategory: query.vehicle_category || undefined,
      costCentre: query.cost_centre || undefined,
      vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
      driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
      yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
    };
    res.status(200).json(
      await this.analytics.summary({
        from: query.from,
        to: query.to,
        interval: query.interval,
        compare: query.compare,
        scope,
      })
    );
  };

  listAttention = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(AttentionQuerySchema, req.query);
    const severities = [...new Set([...(query.severity ?? []), ...(query['severity[]'] ?? [])])];
    const types = [...new Set([...(query.type ?? []), ...(query['type[]'] ?? [])])];
    const paged = query.page !== undefined || query.per_page !== undefined;
    res.status(200).json(
      await this.attention.list({
        severities: severities.length > 0 ? severities : undefined,
        types: types.length > 0 ? types : undefined,
        yardDays: query.yard_days,
        window: paged ? { page: query.page ?? 1, perPage: query.per_page ?? 20 } : undefined,
      })
    );
  };

  yardSummary = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(YardSummaryQuerySchema, req.query);
    res.status(200).json(
      await this.activity.yardSummary({
        from: query.from,
        to: query.to,
        interval: query.interval,
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        includeInactive: query.include_inactive === '1' || query.include_inactive === 'true',
        search: query.search || undefined,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  geofenceSummary = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(GeofenceEventSummaryQuerySchema, req.query);
    res.status(200).json(
      await this.activity.geofenceSummary({
        from: query.from,
        to: query.to,
        interval: query.interval,
        geofenceId: query.geofence_id === undefined ? undefined : String(query.geofence_id),
        vehicleId: query.vehicle_id === undefined ? undefined : String(query.vehicle_id),
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        top: query.top,
      })
    );
  };

  private tripsQuery(
    query: ReturnType<typeof TripsReportQuerySchema.parse>
  ): Omit<TripsReportQuery, 'window'> {
    const statuses = [...new Set([...(query.status ?? []), ...(query['status[]'] ?? [])])];
    return {
      from: query.from,
      to: query.to,
      interval: query.interval,
      compare: query.compare,
      // the vehicle scope only — `driver_id` here is the trip's own driver, not the vehicle's current one
      scope: {
        vehicleCategory: query.vehicle_category || undefined,
        costCentre: query.cost_centre || undefined,
        vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
      },
      driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
      customerIds: mergeIdLists(query.customer_id, query['customer_id[]']),
      statuses: statuses.length > 0 ? statuses : undefined,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      topReasons: query.top_reasons,
    };
  }

  tripsReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(TripsReportQuerySchema, req.query);
    res.status(200).json(
      await this.tripsReport.report({
        ...this.tripsQuery(query),
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  tripsReportExport = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(TripsReportQuerySchema, req.query);
    await streamCsv(res, await this.tripsReport.exportRows(this.tripsQuery(query)));
  };

  private fuelQuery(
    query: ReturnType<typeof FuelReportQuerySchema.parse>
  ): Omit<FuelReportQuery, 'window'> {
    const anomalyTypes = [
      ...new Set([...(query.anomaly_type ?? []), ...(query['anomaly_type[]'] ?? [])]),
    ];
    return {
      from: query.from,
      to: query.to,
      interval: query.interval,
      compare: query.compare,
      scope: {
        vehicleCategory: query.vehicle_category || undefined,
        costCentre: query.cost_centre || undefined,
        vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
      },
      vendor: query.vendor || undefined,
      paymentMethod: query.payment_method || undefined,
      isFullTank: flagValue(query.is_full_tank),
      anomaly: flagValue(query.anomaly),
      anomalyTypes: anomalyTypes.length > 0 ? anomalyTypes : undefined,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      topVendors: query.top_vendors,
      topAnomalies: query.top_anomalies,
      economyDropPct: query.economy_drop_pct,
    };
  }

  fuelReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(FuelReportQuerySchema, req.query);
    res.status(200).json(
      await this.fuelReport.report({
        ...this.fuelQuery(query),
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  fuelReportExport = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(FuelReportQuerySchema, req.query);
    await streamCsv(res, await this.fuelReport.exportRows(this.fuelQuery(query)));
  };

  maintenanceReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(MaintenanceReportQuerySchema, req.query);
    res.status(200).json(
      await this.maintenanceReport.report({
        from: query.from,
        to: query.to,
        interval: query.interval,
        compare: query.compare,
        scope: {
          vehicleCategory: query.vehicle_category || undefined,
          costCentre: query.cost_centre || undefined,
          vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
          yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        },
        topServiceTypes: query.top_service_types,
        topVehicles: query.top_vehicles,
      })
    );
  };

  private complianceQuery(
    query: ReturnType<typeof ComplianceReportQuerySchema.parse>
  ): Omit<ComplianceReportQuery, 'window'> {
    const statuses = [...new Set([...(query.status ?? []), ...(query['status[]'] ?? [])])];
    return {
      horizonDays: query.horizon_days,
      interval: query.interval,
      kind: query.kind,
      statuses: statuses.length > 0 ? statuses : undefined,
      documentableType: query.documentable_type,
      documentType: query.document_type || undefined,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  complianceReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ComplianceReportQuerySchema, req.query);
    res.status(200).json(
      await this.complianceReport.report({
        ...this.complianceQuery(query),
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  complianceReportExport = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ComplianceReportQuerySchema, req.query);
    await streamCsv(res, await this.complianceReport.exportRows(this.complianceQuery(query)));
  };

  private driversQuery(
    query: ReturnType<typeof DriversReportQuerySchema.parse>
  ): Omit<DriversReportQuery, 'window'> {
    return {
      from: query.from,
      to: query.to,
      interval: query.interval,
      compare: query.compare,
      // the vehicle scope only — `driver_id` here is the driver of the trip / incident, not the vehicle's current one
      scope: {
        vehicleCategory: query.vehicle_category || undefined,
        costCentre: query.cost_centre || undefined,
        vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
      },
      driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
      includeInactive: flagValue(query.include_inactive),
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  driversReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(DriversReportQuerySchema, req.query);
    res.status(200).json(
      await this.driversReport.report({
        ...this.driversQuery(query),
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  driversReportExport = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(DriversReportQuerySchema, req.query);
    await streamCsv(res, await this.driversReport.exportRows(this.driversQuery(query)));
  };

  incidentsSummaryHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(IncidentsSummaryQuerySchema, req.query);
    const severities = [...new Set([...(query.severity ?? []), ...(query['severity[]'] ?? [])])];
    res.status(200).json(
      await this.incidentsSummary.summary({
        from: query.from,
        to: query.to,
        interval: query.interval,
        compare: query.compare,
        scope: {
          vehicleCategory: query.vehicle_category || undefined,
          costCentre: query.cost_centre || undefined,
          vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
          yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        },
        driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
        severities: severities.length > 0 ? severities : undefined,
        incidentType: query.incident_type || undefined,
        top: query.top,
        topTypes: query.top_types,
      })
    );
  };

  private utilisationQuery(
    query: ReturnType<typeof UtilisationReportQuerySchema.parse>
  ): Omit<UtilisationReportQuery, 'window'> {
    return {
      from: query.from,
      to: query.to,
      interval: query.interval,
      compare: query.compare,
      scope: {
        vehicleCategory: query.vehicle_category || undefined,
        costCentre: query.cost_centre || undefined,
        vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
        driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
      },
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  utilisationReportHandler = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(UtilisationReportQuerySchema, req.query);
    res.status(200).json(
      await this.utilisationReport.report({
        ...this.utilisationQuery(query),
        window: { page: query.page ?? 1, perPage: query.per_page ?? 20 },
      })
    );
  };

  utilisationReportExport = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(UtilisationReportQuerySchema, req.query);
    await streamCsv(res, await this.utilisationReport.exportRows(this.utilisationQuery(query)));
  };
}
