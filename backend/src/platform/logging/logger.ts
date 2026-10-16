import pino from 'pino';
import { config } from '../config/index.js';

/**
 * The one pino instance, injected everywhere (ARCHITECTURE.md §12).
 * No console.* elsewhere in the codebase (CONVENTIONS.md "Errors & logging").
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.card_number',
      '*.cvc',
    ],
    censor: '[redacted]',
  },
  ...(config.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
