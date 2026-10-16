import type { Redis } from 'ioredis';
import type { Worker } from 'bullmq';
import { logger } from '../../platform/logging/logger.js';
import { createWorker } from '../../platform/queue/queue-factory.js';
import { runWithContextAsync } from '../../platform/http/request-context.js';
import type { FleetRealtimePort } from '../../platform/realtime/fleet-realtime.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type { FleetDashboardService } from './fleet-dashboard.service.js';

export const FLEET_STATUS_JOB = 'fleet-status-summary';
const LAST_KEY = (companyId: string) => `fleet:status-summary:last:${companyId}`;
const LAST_TTL_SECONDS = 24 * 3600;

/**
 * The scheduled half of `fleet:status_summary` (D-0185, flow 07 ask A9). Every minute (`main.scheduler.ts`) the worker computes each fleet
 * company's exclusive status counts and announces them to that company's socket room **only when they differ from the last announcement**
 * (kept in Redis) — so an idle fleet is silent, and a tracker that simply goes quiet (a timer-driven moving → offline change that produces no
 * packet, hence no other event) is announced within about a minute. One company failing never stops the others.
 */
export class FleetStatusBroadcaster {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly service: FleetDashboardService,
    private readonly realtime: FleetRealtimePort,
    private readonly redis: Pick<Redis, 'get' | 'set'>
  ) {}

  async run(now = new Date()): Promise<{ companies: number; published: number }> {
    const companyIds = await this.repo.companyIdsWithVehicles();
    let published = 0;
    for (const companyId of companyIds) {
      try {
        const counts = await runWithContextAsync(
          {
            userId: 'fleet-status',
            companyId,
            roles: [],
            perms: [],
            jti: 'fleet-status',
            exp: Number.MAX_SAFE_INTEGER,
          },
          () => this.service.statusCountsForBroadcast(now)
        );
        const signature = JSON.stringify(counts);
        if ((await this.redis.get(LAST_KEY(companyId))) === signature) continue;
        await this.realtime.publishFleetStatusSummary(companyId, {
          ...counts,
          occurredAt: now.toISOString(),
        });
        await this.redis.set(LAST_KEY(companyId), signature, 'EX', LAST_TTL_SECONDS);
        published += 1;
      } catch (err) {
        logger.warn({ err, companyId }, 'fleet status summary failed for one company — skipped');
      }
    }
    return { companies: companyIds.length, published };
  }
}

/** The `"fleet-status"` queue worker; the repeatable job is registered by `main.scheduler.ts`. */
export function registerFleetStatusWorker(broadcaster: FleetStatusBroadcaster): Worker {
  return createWorker('fleet-status', async () => {
    await broadcaster.run();
  });
}
