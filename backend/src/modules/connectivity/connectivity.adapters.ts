import type { Redis } from 'ioredis';
import { getQueue } from '../../platform/queue/queue-factory.js';
import { readMqttConnectionState } from '../../platform/mqtt/connection-state.js';
import type {
  ConnectivityMqttStateLookup,
  ConnectivityQueueLookup,
} from './connectivity.service.js';

/** Thin adapters over shared platform infra (BullMQ, Redis) — not owned by any other module's repository, so no cross-module interface needed, just a small wrapper (same pattern as `ingestion/queue-adapter.ts`). */
export class BullMqConnectivityQueueLookup implements ConnectivityQueueLookup {
  async waitingCount(): Promise<number> {
    return getQueue('ingestion').getWaitingCount();
  }
}

export class RedisConnectivityMqttStateLookup implements ConnectivityMqttStateLookup {
  constructor(private readonly redis: Redis) {}

  async read() {
    return readMqttConnectionState(this.redis);
  }
}
