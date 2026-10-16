import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import type { AiSuggestionsService } from './ai-suggestions.service.js';
import { HighlightAttributesRequestSchema } from './ai-suggestions.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class AiSuggestionsController {
  constructor(private readonly service: AiSuggestionsService) {}

  highlightAttributes = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(HighlightAttributesRequestSchema, req.body);
    const suggested = await this.service.highlightAttributes(
      input.keys,
      input.context ?? 'Building automation'
    );

    if (suggested.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No relevant attributes could be suggested.',
        highlighted_keys: [],
      });
      return;
    }

    res.status(200).json({ success: true, highlighted_keys: suggested });
  };
}
