import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { WebhookBodySchema } from './ingestion.schemas.js';
import type { IngestionService } from './ingestion.service.js';
import type { IngestResult } from './ingestion.types.js';

/**
 * Transport layer only (ARCHITECTURE.md §2). `POST /webhook` is
 * device-facing — no `requireAuth` (the frozen contract's `security: []`),
 * authenticated instead by the `token` header inside the service.
 */
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  storePacket = async (req: Request, res: Response): Promise<void> => {
    const tokenHeader = req.headers['token'];
    const token = typeof tokenHeader === 'string' ? tokenHeader : undefined;

    if (!token) {
      res.status(401).json({ success: false, error: 'Authentication failed' });
      return;
    }

    const body = parseOrThrow(WebhookBodySchema, req.body);
    const result = await this.ingestionService.ingestHttpPacket(token, body);

    this.respond(res, result);
  };

  private respond(res: Response, result: IngestResult): void {
    switch (result.kind) {
      case 'unauthenticated':
        res.status(401).json({ success: false, error: 'Authentication failed' });
        return;
      case 'invalid_token':
        res.status(400).json({ success: false, error: 'Invalid token structure' });
        return;
      case 'duplicate':
        res.status(201).json({ success: true, message: 'Packet already processed' });
        return;
      case 'initial_packet':
        // "reacived" is Laravel's own literal (typo'd) response text — matched verbatim for parity.
        res.status(201).json({ success: true, message: 'Initial Packet reacived' });
        return;
      case 'no_preferences':
        res.status(201).json({ success: false, message: 'no user preferences found' });
        return;
      case 'no_unique_identifier':
        res
          .status(201)
          .json({ success: false, message: 'Please select a proper Unique Identifier' });
        return;
      case 'device_not_found':
        res.status(404).json({ success: false, error: 'Device not found.' });
        return;
      case 'accepted':
        res.status(201).json({ success: true });
        return;
    }
  }
}
