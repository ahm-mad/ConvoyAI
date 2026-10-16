import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';
import { createSocketServer } from '../socket.js';
import { RedisRealtimeEmitter } from '../emitter.js';
import { signAccessToken } from '../../auth/jwt.js';
import { config } from '../../config/index.js';

const probe = new Redis(config.REDIS_URL, { lazyConnect: true, retryStrategy: () => null });
const redisAvailable = await probe
  .connect()
  .then(() => true)
  .catch(() => false)
  .finally(() => {
    probe.disconnect();
  });

/**
 * Real-Redis integration test (CONVENTIONS.md "Tests") — the task file's
 * required first golden pair: "an unauthenticated or wrong-user socket
 * connection must never receive another user's events"
 * (`reference/deep-dives/realtime-channels.md` §2.2 — no such automated
 * test existed on the old Laravel app at all, the exact gap that let
 * KNOWN_ISSUES 11.36 ship unnoticed). Also exercises D-0067's real
 * cross-process delivery path end to end: `RedisRealtimeEmitter` (as used
 * by `main.worker.ts`, a separate process in production) publishing
 * through real Redis pub/sub, picked up by this process's `io` (via the
 * Redis adapter attached in `createSocketServer`) and delivered to a real
 * `socket.io-client` connection — not a same-process shortcut.
 */
describe.skipIf(!redisAvailable)('Socket.IO room-join security (11.36 must not recur)', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let port: number;
  let emitter: RedisRealtimeEmitter;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    io = createSocketServer(httpServer);
    emitter = new RedisRealtimeEmitter();
    await new Promise<void>(resolve => {
      httpServer.listen(0, () => {
        resolve();
      });
    });
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('expected a real port');
    port = address.port;
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.disconnect();
  });

  afterAll(async () => {
    emitter.disconnect();
    await io.close();
  });

  function connect(token: string | undefined): ClientSocket {
    const client = ioClient(`http://localhost:${String(port)}`, {
      path: '/socket.io',
      auth: token !== undefined ? { token } : {},
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  }

  function waitForEvent<T>(client: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timed out waiting for "${event}"`));
      }, timeoutMs);
      client.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function waitForConnectError(client: ClientSocket, timeoutMs = 2000): Promise<Error> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timed out waiting for connect_error'));
      }, timeoutMs);
      client.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        resolve(err);
      });
    });
  }

  it('no token at all -> connection rejected', async () => {
    const client = connect(undefined);
    const err = await waitForConnectError(client);
    expect(err.message).toBe('Authentication required');
  });

  it('an invalid/garbage token -> connection rejected', async () => {
    const client = connect('not-a-real-jwt');
    const err = await waitForConnectError(client);
    expect(err.message).toBe('Invalid token');
  });

  it("a valid token joins the room derived from the JWT's own sub, never a client-supplied id", async () => {
    const tokenA = signAccessToken({ sub: '111', companyId: '1', roles: [] });
    const clientA = connect(tokenA);
    await new Promise<void>(resolve =>
      clientA.once('connect', () => {
        resolve();
      })
    );
    expect(clientA.connected).toBe(true);
  });

  it("cross-user isolation: an event emitted to user A's room is received by A and NEVER by B, over real Redis pub/sub", async () => {
    const tokenA = signAccessToken({ sub: '201', companyId: '1', roles: [] });
    const tokenB = signAccessToken({ sub: '202', companyId: '1', roles: [] });
    const clientA = connect(tokenA);
    const clientB = connect(tokenB);

    await Promise.all([
      new Promise<void>(resolve =>
        clientA.once('connect', () => {
          resolve();
        })
      ),
      new Promise<void>(resolve =>
        clientB.once('connect', () => {
          resolve();
        })
      ),
    ]);

    let bReceivedAnything = false;
    clientB.on('device:value', () => {
      bReceivedAnything = true;
    });

    const received = waitForEvent<{ deviceId: string }>(clientA, 'device:value');
    emitter.emitToUser('201', 'device:value', { deviceId: 'd-only-for-201' });

    const payload = await received;
    expect(payload).toEqual({ deviceId: 'd-only-for-201' });

    // Give a real cross-process pub/sub round-trip a moment to have arrived
    // at B too, if it were (wrongly) going to.
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(bReceivedAnything).toBe(false);
  });

  /** D-0161 — the company-wide fleet room. Membership comes ONLY from the verified JWT (company + fleet permission). */
  async function connected(
    token: string,
    extraAuth: Record<string, unknown> = {}
  ): Promise<ClientSocket> {
    const client = ioClient(`http://localhost:${String(port)}`, {
      path: '/socket.io',
      auth: { token, ...extraAuth },
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    await new Promise<void>(resolve =>
      client.once('connect', () => {
        resolve();
      })
    );
    return client;
  }

  /** Resolves with what the client received within `ms` (usually nothing). */
  function collect(client: ClientSocket, event: string, ms = 400): Promise<unknown[]> {
    const received: unknown[] = [];
    client.on(event, (payload: unknown) => {
      received.push(payload);
    });
    return new Promise(resolve =>
      setTimeout(() => {
        resolve(received);
      }, ms)
    );
  }

  it("fleet events: only sockets of THAT company holding the fleet permission receive them — not another company's fleet user, not the same company without the permission, not a token with no company", async () => {
    const fleetSameCompany = await connected(
      signAccessToken({ sub: '301', companyId: '9', roles: [], perms: ['all-fleet'] })
    );
    const fleetOtherCompany = await connected(
      signAccessToken({ sub: '302', companyId: '10', roles: [], perms: ['all-fleet'] })
    );
    const noPermission = await connected(
      signAccessToken({ sub: '303', companyId: '9', roles: [], perms: ['other-permission'] })
    );
    const noCompany = await connected(
      signAccessToken({ sub: '304', roles: [], perms: ['all-fleet'] })
    );
    // A client can ask for a room in the handshake — it must be ignored (never trust a client-supplied room, 11.36).
    const forger = await connected(
      signAccessToken({ sub: '305', companyId: '9', roles: [], perms: [] }),
      {
        room: 'company:9',
        companyId: '9',
      }
    );

    const inboxes = [fleetSameCompany, fleetOtherCompany, noPermission, noCompany, forger].map(c =>
      collect(c, 'trip:update')
    );
    await new Promise(resolve => setTimeout(resolve, 100)); // let the rooms settle
    emitter.emitToCompany('9', 'trip:update', { tripId: '1', reason: 'started' });
    const [same, other, noPerm, noComp, forged] = await Promise.all(inboxes);

    expect(same).toEqual([{ tripId: '1', reason: 'started' }]);
    expect(other).toEqual([]);
    expect(noPerm).toEqual([]);
    expect(noComp).toEqual([]);
    expect(forged).toEqual([]);
  });

  it('a fleet user still receives their own user-room events (the company room is additional, not a replacement)', async () => {
    const client = await connected(
      signAccessToken({ sub: '311', companyId: '9', roles: [], perms: ['all-fleet'] })
    );
    const inbox = collect(client, 'alarm:state');
    await new Promise(resolve => setTimeout(resolve, 100));
    emitter.emitToUser('311', 'alarm:state', { ruleId: '1' });
    expect(await inbox).toEqual([{ ruleId: '1' }]);
  });
});
