import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

/**
 * /health (liveness, no deps) and /ready (checks Postgres + Redis, MQTT
 * soft) — ARCHITECTURE.md §12.
 */
export interface ReadinessCheck {
  name: string;
  ok: boolean;
  error?: string;
}

export async function checkReadiness(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  redis: Redis
): Promise<{ ready: boolean; checks: ReadinessCheck[] }> {
  const checks = await Promise.all([checkPostgres(prisma), checkRedis(redis)]);
  return { ready: checks.every(c => c.ok), checks };
}

async function checkPostgres(prisma: Pick<PrismaClient, '$queryRaw'>): Promise<ReadinessCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'postgres', ok: true };
  } catch (err) {
    return { name: 'postgres', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRedis(redis: Redis): Promise<ReadinessCheck> {
  try {
    await redis.ping();
    return { name: 'redis', ok: true };
  } catch (err) {
    return { name: 'redis', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
