import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { UnauthenticatedError } from '../../platform/errors/app-error.js';
import { toLoginUserResponse, toUserResponse } from './auth.mapper.js';
import type { AuthService } from './auth.service.js';
import type { SocialLoginService } from './social-login.service.js';
import {
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  VerifyResetTokenRequestSchema,
} from './auth.schemas.js';

/**
 * Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape
 * response. No business logic, no Prisma. Response envelopes per D-0026
 * (errors, via the shared error handler) and D-0030 (lean user, +
 * access_token/refresh_token alongside the old `token` field).
 */
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly socialLoginService: SocialLoginService
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = parseOrThrow(LoginRequestSchema, req.body);
    const { user, tokens, enrichment } = await this.authService.login(email, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: toLoginUserResponse(user, enrichment),
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      packet_issues: [], // D-0030 — still no ingestion-derived value; not part of this revisit (D-0098).
    });
  };

  register = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(RegisterRequestSchema, req.body);
    const { user, tokens } = await this.authService.register({
      firstName: input.first_name,
      lastName: input.last_name,
      email: input.email,
      number: input.number,
      password: input.password,
      timezone: input.timezone,
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully with basic plan.',
      user: toUserResponse(user),
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'bearer',
    });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const context = getRequestContext();
    if (!context) {
      throw new UnauthenticatedError();
    }
    const { refresh_token } = parseOrThrow(LogoutRequestSchema, req.body ?? {});

    await this.authService.logout(context.jti, context.exp, refresh_token);

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = parseOrThrow(RefreshRequestSchema, req.body);
    const tokens = await this.authService.refresh(refresh_token);

    res.status(200).json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'bearer',
    });
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    const context = getRequestContext();
    if (!context) {
      throw new UnauthenticatedError();
    }
    const { current_password, new_password } = parseOrThrow(ChangePasswordRequestSchema, req.body);

    await this.authService.changePassword(context.userId, current_password, new_password);

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = parseOrThrow(ForgotPasswordRequestSchema, req.body);
    await this.authService.forgotPassword(email);

    res.status(200).json({ success: true, message: 'We have emailed your password reset link.' });
  };

  verifyResetToken = async (req: Request, res: Response): Promise<void> => {
    const { email, token } = parseOrThrow(VerifyResetTokenRequestSchema, req.body);
    await this.authService.verifyResetToken(email, token);

    res.status(200).json({ success: true, message: 'Token is valid.' });
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const { email, token, password } = parseOrThrow(ResetPasswordRequestSchema, req.body);
    await this.authService.resetPassword(email, token, password);

    res.status(200).json({ success: true, message: 'Your password has been reset.' });
  };

  socialRedirect = (req: Request, res: Response): void => {
    const provider =
      typeof req.params['provider'] === 'string' ? req.params['provider'] : undefined;
    const url = this.socialLoginService.getRedirectUrl(provider);

    res.status(200).json({ success: true, redirect_url: url });
  };

  socialCallback = async (req: Request, res: Response): Promise<void> => {
    const provider =
      typeof req.params['provider'] === 'string' ? req.params['provider'] : undefined;
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : undefined;

    const result = await this.socialLoginService.handleCallback(provider, code);
    if ('redirect' in result) {
      res.redirect(result.redirect);
      return;
    }
    res.status(200).type('html').send(result.html);
  };
}
