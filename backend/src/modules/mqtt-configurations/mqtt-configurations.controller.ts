import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { NotFoundError, UnauthenticatedError } from '../../platform/errors/app-error.js';
import {
  toMqttConfigurationCreateResponse,
  toMqttConfigurationResponse,
} from './mqtt-configurations.mapper.js';
import type { MqttConfigurationsService } from './mqtt-configurations.service.js';
import {
  CreateMqttConfigurationRequestSchema,
  MqttConfigurationIdParamSchema,
  UpdateMqttConfigurationRequestSchema,
} from './mqtt-configurations.schemas.js';
import type {
  CreateMqttConfigurationInput,
  UpdateMqttConfigurationInput,
} from './mqtt-configurations.types.js';

/** `index()`/`getActive()` only — the two real Laravel methods with an explicit `company_not_found` 404 branch (`$user->company_id ?? $request->input('company_id')` falsy). Every other method here proceeds under the caller's own context regardless, same as real Laravel. */
function requireCompanyContext() {
  const context = getRequestContext();
  if (!context) throw new UnauthenticatedError();
  if (!context.companyId) throw new NotFoundError('Company not found.');
  return context;
}

function toCreateInput(
  body: ReturnType<typeof CreateMqttConfigurationRequestSchema.parse>
): CreateMqttConfigurationInput {
  return {
    name: body.name,
    host: body.host,
    port: body.port,
    username: body.username,
    password: body.password,
    useTls: body.use_tls,
    clientIdPrefix: body.client_id_prefix,
    description: body.description,
  };
}

function toUpdateInput(
  body: ReturnType<typeof UpdateMqttConfigurationRequestSchema.parse>
): UpdateMqttConfigurationInput {
  return {
    name: body.name,
    host: body.host,
    port: body.port,
    username: body.username,
    password: body.password,
    useTls: body.use_tls,
    clientIdPrefix: body.client_id_prefix,
    description: body.description,
    status: body.status,
  };
}

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class MqttConfigurationsController {
  constructor(private readonly service: MqttConfigurationsService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    requireCompanyContext();
    const configs = await this.service.list();
    res.status(200).json({
      success: true,
      message: 'MQTT configurations fetched successfully',
      data: configs.map(toMqttConfigurationResponse),
    });
  };

  getActive = async (_req: Request, res: Response): Promise<void> => {
    requireCompanyContext();
    const config = await this.service.getActive();
    res.status(200).json({
      success: true,
      message: 'MQTT configuration fetched successfully',
      data: toMqttConfigurationResponse(config),
    });
  };

  show = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MqttConfigurationIdParamSchema, req.params);
    const config = await this.service.getById(String(id));
    res.status(200).json({
      success: true,
      message: 'MQTT configuration fetched successfully',
      data: toMqttConfigurationResponse(config),
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(CreateMqttConfigurationRequestSchema, req.body);
    const input = toCreateInput(body);
    const config = await this.service.create(input);
    res.status(201).json({
      success: true,
      message: 'MQTT configuration created successfully',
      data: toMqttConfigurationCreateResponse(config, input),
    });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MqttConfigurationIdParamSchema, req.params);
    const input = parseOrThrow(UpdateMqttConfigurationRequestSchema, req.body);
    const config = await this.service.update(String(id), toUpdateInput(input));
    res.status(200).json({
      success: true,
      message: 'MQTT configuration updated successfully',
      data: toMqttConfigurationResponse(config),
    });
  };

  destroy = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MqttConfigurationIdParamSchema, req.params);
    await this.service.delete(String(id));
    res.status(200).json({ success: true, message: 'MQTT configuration deleted successfully' });
  };

  testConnection = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(MqttConfigurationIdParamSchema, req.params);
    const { success, config } = await this.service.testConnection(String(id));
    res.status(200).json({
      success,
      message: success ? 'MQTT connection test successful' : 'MQTT connection test failed',
      data: {
        status: config.status,
        last_tested_at: config.lastTestedAt,
        test_result: config.testResult,
      },
    });
  };
}
