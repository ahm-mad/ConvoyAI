import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import { config } from '../config/index.js';

/**
 * D-0067: `main.http.ts` (holds the live Socket.IO connections) and
 * `main.worker.ts` (consumes the `"realtime"` BullMQ queue, where every
 * event this module bridges actually originates) are **separate Node
 * processes** — confirmed by reading `ARCHITECTURE.md` §1's entrypoint
 * table and `package.json`'s `dev`/`dev:worker` scripts, run independently.
 * A plain in-process `io.to(room).emit(...)` call inside the worker would
 * do nothing: that process holds no Socket.IO server and no live
 * connections at all. Nothing in `ARCHITECTURE.md`/`STACK_MAPPING.md`
 * flagged this before this module — genuinely new finding, not previously
 * documented.
 *
 * `@socket.io/redis-emitter` is the standard fix for exactly this shape:
 * it lets any process holding only a Redis client publish a Socket.IO
 * event by room, which `socket.ts`'s real `io` server (via
 * `@socket.io/redis-adapter`, attached in `createSocketServer`) picks up
 * over Redis pub/sub and delivers to whichever process actually holds the
 * matching live connection. This is the write-only half of that pair.
 */
export interface RealtimeEmitterPort {
  emitToUser(userId: string, event: string, payload: unknown): void;
  /** D-0161: fleet events go to the `company:{companyId}` room (joined at handshake from the verified JWT, fleet permission only — `socket.ts`). */
  emitToCompany(companyId: string, event: string, payload: unknown): void;
}

export class RedisRealtimeEmitter implements RealtimeEmitterPort {
  private readonly emitter: Emitter;

  constructor() {
    this.emitter = new Emitter(new Redis(config.REDIS_URL));
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitter.to(`user:${userId}`).emit(event, payload);
  }

  emitToCompany(companyId: string, event: string, payload: unknown): void {
    this.emitter.to(`company:${companyId}`).emit(event, payload);
  }

  /** Tests only — production instances live for the process's lifetime and are never explicitly closed. */
  disconnect(): void {
    (this.emitter.redisClient as Redis).disconnect();
  }
}
