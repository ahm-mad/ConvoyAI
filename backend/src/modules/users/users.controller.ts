import type { Request, Response } from 'express';
import type {} from 'multer'; // side-effect import: augments Express.Request with `.file`/`.files`
import { parseOrThrow } from '../../platform/http/validate.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../platform/errors/app-error.js';
import {
  toFullProfileUserResponse,
  toMemberResponse,
  toProfileUserResponse,
} from './users.mapper.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { UsersService } from './users.service.js';
import {
  BulkDeleteMembersRequestSchema,
  CreateMemberRequestSchema,
  ListMembersRequestSchema,
  MemberIdParamSchema,
  UpdateMemberRequestSchema,
  UpdateProfileRequestSchema,
} from './users.schemas.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const EXTENSION_BY_MIME_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  getProfile = async (_req: Request, res: Response): Promise<void> => {
    const context = getRequestContext();
    if (!context) {
      throw new UnauthenticatedError();
    }
    const profile = await this.usersService.getProfile(context.userId);
    const company = await this.usersService.getProfileCompany(profile.companyId);

    res.status(200).json({
      success: true,
      message: 'Fetch user profile details successfully.',
      data: { user: toFullProfileUserResponse(profile, company), user_image: profile.profileImage },
    });
  };

  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const context = getRequestContext();
    if (!context) {
      throw new UnauthenticatedError();
    }
    // D-0043 (11.42): the {user} path param is kept for URL-shape parity
    // with the frozen contract, but must equal the caller's own id — never
    // trust it to select which account gets updated.
    const targetUserId = String(req.params['user']);
    if (targetUserId !== context.userId) {
      throw new ForbiddenError('Unauthorized');
    }

    const input = parseOrThrow(UpdateProfileRequestSchema, req.body);
    const file = req.file;
    if (file && !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationError('The profile image must be a file of type: jpeg, png, jpg.', {
        profile_image: ['The profile image must be a file of type: jpeg, png, jpg.'],
      });
    }

    const profile = await this.usersService.updateProfile(
      context.userId,
      {
        firstName: input.first_name,
        lastName: input.last_name,
        email: input.email,
        number: input.number,
      },
      file
        ? {
            buffer: file.buffer,
            contentType: file.mimetype,
            extension: EXTENSION_BY_MIME_TYPE[file.mimetype] ?? 'jpg',
          }
        : undefined
    );

    res
      .status(200)
      .json({ success: 'Member updated successfully.', user: toProfileUserResponse(profile) });
  };

  listMembers = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListMembersRequestSchema, req.query);
    const result = await this.usersService.listMembers({
      search: query.search,
      page: query.page,
      perPage: query.per_page,
    });

    // MemberController.php:64-68 — Laravel's real paginator envelope, not a lean {items, pagination}.
    res.status(200).json({
      success: true,
      message: 'Members list fetched successfully.',
      data: buildLaravelPaginator({
        items: result.items.map(toMemberResponse),
        page: result.pagination.page,
        perPage: result.pagination.perPage,
        total: result.pagination.total,
        path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      }),
    });
  };

  createMember = async (req: Request, res: Response): Promise<void> => {
    const context = getRequestContext();
    if (!context) {
      throw new UnauthenticatedError();
    }
    const input = parseOrThrow(CreateMemberRequestSchema, req.body);

    await this.usersService.createMember(
      {
        firstName: input.first_name,
        lastName: input.last_name,
        number: input.number,
        email: input.email,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        role: input.role,
        password: input.password,
      },
      context.userId
    );

    res.status(201).json({ success: 'Member added successfully, email sent.' });
  };

  getMember = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MemberIdParamSchema, req.params);
    const member = await this.usersService.getMember(String(id));

    res.status(200).json({
      success: true,
      message: 'Member fetched successfully.',
      data: toMemberResponse(member),
    });
  };

  updateMember = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MemberIdParamSchema, req.params);
    const input = parseOrThrow(UpdateMemberRequestSchema, req.body);

    await this.usersService.updateMember(String(id), {
      name: input.name,
      address: input.address,
      city: input.city,
      state: input.state,
      country: input.country,
    });

    res.status(200).json({ success: 'Member updated successfully.' });
  };

  bulkDeleteMembers = async (req: Request, res: Response): Promise<void> => {
    const { ids } = parseOrThrow(BulkDeleteMembersRequestSchema, req.body);

    const result = await this.usersService.bulkDeleteMembers(ids.map(String));

    res.status(200).json({
      success: true,
      message: 'Members deleted successfully',
      deleted_count: result.deletedCount,
      not_deleted_count: result.notDeletedCount,
    });
  };
}
