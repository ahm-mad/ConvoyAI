import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { ContactsSettingsNotificationsService } from './contacts-settings-notifications.service.js';
import {
  ContactIdParamSchema,
  CreateContactRequestSchema,
  CreateNotificationRequestSchema,
  ListContactsRequestSchema,
  NotificationIdParamSchema,
  SettingIdParamSchema,
  UpdateSettingsRequestSchema,
} from './contacts-settings-notifications.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class ContactsSettingsNotificationsController {
  constructor(private readonly service: ContactsSettingsNotificationsService) {}

  // -- Contacts (D-0090: index/show/destroy gated on platform_operator by the router) --

  listContacts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListContactsRequestSchema, req.query);
    const { items, total } = await this.service.listContacts({
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
    });

    const paginator = buildLaravelPaginator({
      items,
      page: query.page,
      perPage: query.per_page,
      total,
      path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      query: { search: query.search, sort_by: query.sort_by, sort_order: query.sort_order },
    });

    res
      .status(200)
      .json({ success: true, message: 'Contacts fetched successfully.', data: paginator });
  };

  createContact = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateContactRequestSchema, req.body);
    const result = await this.service.createContact(input);
    res.status(201).json(result);
  };

  getContact = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ContactIdParamSchema, req.params);
    const result = await this.service.getContact(String(id));
    res.status(200).json(result);
  };

  deleteContact = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(ContactIdParamSchema, req.params);
    await this.service.deleteContact(String(id));
    res.status(200).json({ success: true, message: 'Contact record deleted successfully.' });
  };

  // -- Settings --

  listSettings = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.listSettings();
    res.status(200).json(result);
  };

  getSetting = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(SettingIdParamSchema, req.params);
    const result = await this.service.getSetting(String(id));
    res.status(200).json(result);
  };

  updateSettings = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(UpdateSettingsRequestSchema, req.body);
    const result = await this.service.updateSettings(input.locale);
    res.status(200).json(result);
  };

  // -- Notifications (D-0090 closes 11.59) --

  createNotification = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateNotificationRequestSchema, req.body);
    const result = await this.service.createNotification(input.title, input.message);
    res.status(201).json(result);
  };

  listNotifications = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.listNotifications();
    res.status(200).json(result);
  };

  markNotificationRead = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(NotificationIdParamSchema, req.params);
    const result = await this.service.markNotificationRead(String(id));
    res.status(200).json(result);
  };

  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(NotificationIdParamSchema, req.params);
    await this.service.deleteNotification(String(id));
    res.status(200).json({ success: true, message: 'Notification deleted' });
  };
}
