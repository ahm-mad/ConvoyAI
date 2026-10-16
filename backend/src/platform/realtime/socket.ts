import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';
import { verifyAccessToken } from '../auth/jwt.js';

interface AuthedSocketData {
  userId: string;
  /** D-0161: from the verified JWT only. */
  companyId?: string | undefined;
  perms: string[];
}

/** The permission that gates the fleet module's HTTP routes (`requirePermission("all-fleet")`, D-0110) — and, with it, the `company:{id}` fleet room. */
export const FLEET_PERMISSION = 'all-fleet';

/**
 * Socket.IO bootstrap (ARCHITECTURE.md §7).
 *
 * SECURITY: room membership is derived ONLY from the verified JWT at
 * handshake time — never from a client-supplied room/user id. This is
 * not a style preference: the Laravel app's equivalent (a per-user
 * Pusher channel name) was undermined by exactly that mistake — all 3
 * broadcast events published on a PUBLIC channel while the
 * authorization rule assumed a private one, so any client holding the
 * Pusher app key could subscribe to any user's channel by guessing
 * their id (KNOWN_ISSUES 11.36, reference/deep-dives/realtime-channels.md
 * §2). Socket.IO has no public/private channel distinction to get
 * backwards this way, but only if `userId` below always comes from the
 * verified token payload, never from `socket.handshake.query` or
 * anything else client-controlled. Do not "helpfully" accept a
 * client-supplied userId here, even for local testing.
 *
 * D-0067: attaches the Redis adapter — every event this module actually
 * broadcasts originates in `main.worker.ts`'s BullMQ job handlers, a
 * separate process from this one (`platform/realtime/emitter.ts`'s doc
 * comment). Without this adapter, a plain in-process `io.to(...).emit()`
 * would only ever reach sockets connected to *this* process, and cross-
 * process emits via `@socket.io/redis-emitter` would silently go nowhere.
 * Two dedicated ioredis connections (pub/sub can't share one client mid-
 * subscription), same "own connection per subsystem" pattern as
 * `queue-factory.ts`.
 */
export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: config.SOCKET_IO_PATH,
    // D-0096: Socket.IO's CORS is separate from Express's (`platform/http/
    // cors.ts`) — its own transport, not an Express middleware — but
    // driven by the same `CORS_ALLOWED_ORIGINS` allowlist, one place to
    // add an origin for both HTTP and realtime.
    cors: { origin: config.CORS_ALLOWED_ORIGINS },
  });

  const pubClient = new Redis(config.REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  // `io.close()` closes the underlying `httpServer` too (main.http.ts's own
  // shutdown comment) — piggyback on that event to disconnect the adapter's
  // two dedicated Redis connections rather than leaking them past shutdown.
  httpServer.on('close', () => {
    pubClient.disconnect();
    subClient.disconnect();
  });

  io.use((socket: Socket, next) => {
    const token: unknown = socket.handshake.auth['token'];
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const claims = verifyAccessToken(token);
      const data = socket.data as AuthedSocketData;
      data.userId = claims.sub;
      data.companyId = claims.companyId;
      data.perms = claims.perms ?? [];
      next();
    } catch (err) {
      logger.debug({ err }, 'Socket handshake auth failed');
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { userId, companyId, perms } = socket.data as AuthedSocketData;
    void socket.join(`user:${userId}`);
    // D-0161: the company-wide fleet room — only for a token that carries a company AND the fleet permission. Both come
    // from the verified JWT (never from the client), same rule as `user:{id}` above (11.36).
    if (companyId && perms.includes(FLEET_PERMISSION)) void socket.join(`company:${companyId}`);
    logger.debug({ userId, socketId: socket.id }, 'Socket connected');

    socket.on('disconnect', () => {
      logger.debug({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}
