import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Shared Redis connection — backs BullMQ (queue/queue-factory.ts) and
 * general caching (ARCHITECTURE.md §2 platform/cache).
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for its blocking
 * connections; harmless for plain cache usage too.
 */
export function createRedisClient(): Redis {
  const client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

  client.on('error', err => {
    logger.error({ err }, 'Redis client error');
  });
  client.on('connect', () => {
    logger.debug('Redis connected');
  });

  return client;
}

export const redis = createRedisClient();
