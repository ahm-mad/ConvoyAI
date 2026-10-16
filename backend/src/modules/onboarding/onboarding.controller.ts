import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import type { OnboardingService } from './onboarding.service.js';
import {
  ResendVerificationEmailRequestSchema,
  VerifyTokenRequestSchema,
} from './onboarding.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  verifyToken = async (req: Request, res: Response): Promise<void> => {
    const { token } = parseOrThrow(VerifyTokenRequestSchema, req.body);

    await this.onboardingService.verifyEmail(token);

    res.status(200).json({ success: true, message: 'Email verified successfully.' });
  };

  resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
    const { token } = parseOrThrow(ResendVerificationEmailRequestSchema, req.body);

    await this.onboardingService.resendVerificationEmail(token);

    res.status(200).json({ success: true, message: 'Verification email sent.' });
  };
}
