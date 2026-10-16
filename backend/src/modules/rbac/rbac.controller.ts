import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import {
  toAccessPathResponse,
  toCompanyDetailResponse,
  toCompanyListItemResponse,
  toCompanyResponse,
  toCompanyRoleWithUsersResponse,
  toModuleCatalogResponse,
  toRoleResponse,
} from './rbac.mapper.js';
import type { RbacService } from './rbac.service.js';
import {
  BulkDeleteCompaniesRequestSchema,
  CompanyIdParamSchema,
  CreateCompanyRequestSchema,
  CreateModuleRequestSchema,
  CreateRoleRequestSchema,
  ListCompaniesRequestSchema,
  PermissionIdParamSchema,
  RoleIdParamSchema,
  UpdateCompanyRequestSchema,
  UpdateRoleRequestSchema,
  UserIdParamSchema,
} from './rbac.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  listCompanies = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListCompaniesRequestSchema, req.query);
    const result = await this.rbacService.listCompaniesWithRelations({
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
    });

    res.status(200).json({
      success: true,
      message: 'Companies fetched successfully.',
      data: {
        items: result.items.map(toCompanyListItemResponse),
        pagination: {
          page: result.pagination.page,
          per_page: result.pagination.perPage,
          total: result.pagination.total,
          total_pages: result.pagination.totalPages,
        },
      },
    });
  };

  createCompany = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateCompanyRequestSchema, req.body);
    const company = await this.rbacService.createCompany({
      name: input.name,
      email: input.email,
      address: input.address,
      city: input.city,
      state: input.state,
      country: input.country,
      zipCode: input.zip_code,
      currency: input.currency,
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully.',
      data: toCompanyResponse(company),
    });
  };

  getCompany = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CompanyIdParamSchema, req.params);
    const company = await this.rbacService.getCompanyWithRelations(String(id));

    res.status(200).json({
      success: true,
      message: 'Company fetched successfully.',
      data: toCompanyDetailResponse(company),
    });
  };

  updateCompany = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CompanyIdParamSchema, req.params);
    const input = parseOrThrow(UpdateCompanyRequestSchema, req.body);
    const company = await this.rbacService.updateCompany(String(id), {
      name: input.name,
      email: input.email,
      address: input.address,
      city: input.city,
      state: input.state,
      country: input.country,
      zipCode: input.zip_code,
      currency: input.currency,
    });

    res.status(200).json({
      success: true,
      message: 'Company updated successfully.',
      data: toCompanyResponse(company),
    });
  };

  deleteCompany = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(CompanyIdParamSchema, req.params);
    await this.rbacService.deleteCompany(String(id));

    // NOTE: 201, not 200/204 — matches the frozen contract (Laravel's own quirk, D-0013 keeps it exact).
    res.status(201).json({ success: true, message: 'Company deleted successfully.' });
  };

  bulkDeleteCompanies = async (req: Request, res: Response): Promise<void> => {
    const { company_ids } = parseOrThrow(BulkDeleteCompaniesRequestSchema, req.body);
    await this.rbacService.bulkDeleteCompanies(company_ids.map(String));

    // NOTE: 201, not 200 — matches the frozen contract.
    res.status(201).json({ success: true, message: 'Selected companies deleted successfully.' });
  };

  // -- Roles ------------------------------------------------------------

  getUserRoles = async (req: Request, res: Response): Promise<void> => {
    const { userId } = parseOrThrow(UserIdParamSchema, req.params);

    const roles = await this.rbacService.getUserRoles(String(userId));

    res.status(200).json({
      success: true,
      message: 'Roles fetched successfully.',
      roles: roles.map(toRoleResponse),
    });
  };

  getUserAccessPath = async (req: Request, res: Response): Promise<void> => {
    const { userId } = parseOrThrow(UserIdParamSchema, req.params);

    const entries = await this.rbacService.getUserAccessPath(String(userId));

    res.status(200).json({
      success: true,
      message: 'Access path retrieved.',
      data: entries.map(toAccessPathResponse),
    });
  };

  getCompanyRoles = async (_req: Request, res: Response): Promise<void> => {
    const roles = await this.rbacService.getCompanyRoles();

    res.status(200).json({
      success: true,
      message: 'Roles fetched successfully.',
      roles: roles.map(toCompanyRoleWithUsersResponse),
    });
  };

  getRoleDetails = async (req: Request, res: Response): Promise<void> => {
    const { roleId } = parseOrThrow(RoleIdParamSchema, req.params);

    const role = await this.rbacService.getRoleDetails(String(roleId));

    res.status(200).json({ success: true, role: toRoleResponse(role) });
  };

  createRole = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateRoleRequestSchema, req.body);

    const role = await this.rbacService.createRole({
      name: input.name,
      description: input.description,
      moduleIds: input.module_ids.map(String),
    });

    res
      .status(201)
      .json({ success: true, message: 'Role created successfully', role: toRoleResponse(role) });
  };

  updateRole = async (req: Request, res: Response): Promise<void> => {
    const { roleId } = parseOrThrow(RoleIdParamSchema, req.params);
    const input = parseOrThrow(UpdateRoleRequestSchema, req.body);

    const role = await this.rbacService.updateRole(String(roleId), {
      name: input.name,
      description: input.description,
      moduleIds: input.module_ids.map(String),
    });

    res
      .status(200)
      .json({ success: true, message: 'Role updated successfully', role: toRoleResponse(role) });
  };

  deleteRole = async (req: Request, res: Response): Promise<void> => {
    const { roleId } = parseOrThrow(RoleIdParamSchema, req.params);

    await this.rbacService.deleteRole(String(roleId));

    res.status(200).json({ success: true, message: 'Role deleted successfully.' });
  };

  // -- Permissions ------------------------------------------------------

  deletePermission = async (req: Request, res: Response): Promise<void> => {
    const { permissionId } = parseOrThrow(PermissionIdParamSchema, req.params);

    await this.rbacService.deletePermission(String(permissionId));

    res.status(200).json({ success: true, message: 'Permission deleted successfully.' });
  };

  // -- Modules ------------------------------------------------------------

  listModulesForAdmin = async (_req: Request, res: Response): Promise<void> => {
    const modules = await this.rbacService.listModulesForAdmin();

    res.status(200).json({ success: true, modules: modules.map(toModuleCatalogResponse) });
  };

  createModule = async (req: Request, res: Response): Promise<void> => {
    const { code } = parseOrThrow(CreateModuleRequestSchema, req.body);

    await this.rbacService.createModule(code);

    res
      .status(201)
      .json({ success: true, module: code, message: 'Module created with permissions.' });
  };

  getUserModules = async (req: Request, res: Response): Promise<void> => {
    const { userId } = parseOrThrow(UserIdParamSchema, req.params);

    const result = await this.rbacService.getUserModules(String(userId));

    res.status(200).json({
      success: true,
      message: 'Modules and permissions retrieved successfully.',
      modules: result.modules,
      permissions: result.permissions,
    });
  };
}
