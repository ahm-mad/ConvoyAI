import net from 'node:net';
import { config } from '../config/index.js';

/**
 * D-0133: Node's "happy eyeballs" (`autoSelectFamily`) gives each resolved address only 250 ms to connect before moving on.
 * On a slower link (a laptop on a high-latency ISP — TCP connects to Google took 0.5–1.8 s) every attempt times out, and
 * `fetch()` fails with `ETIMEDOUT` even though the host is reachable (curl works). Google login's server-side token
 * exchange hit exactly this. A longer per-attempt timeout costs nothing where the network is healthy — an unreachable
 * address family (e.g. IPv6 with no route) still fails immediately with ENETUNREACH.
 *
 * Imported for its side effect at the top of every process entrypoint (`main.*.ts`).
 */
net.setDefaultAutoSelectFamilyAttemptTimeout(config.NETWORK_CONNECT_ATTEMPT_TIMEOUT_MS);
