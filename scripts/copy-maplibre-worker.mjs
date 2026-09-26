// MapLibre GL v6 runs its tile worker from a separate ES module. Next/webpack cannot bundle it reliably, so the worker
// files are copied to /public/maplibre and ConvoyMap points `setWorkerUrl` at them. Runs on `npm install` (postinstall).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const from = 'node_modules/maplibre-gl/dist';
const to = 'public/maplibre';

if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(`${from}/${f}`, `${to}/${f}`);
  console.log('[maplibre] worker files copied to public/maplibre');
}
