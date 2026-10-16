import { defineConfig } from 'tsup';

export default defineConfig({
  // Object form (explicit output names), not an array: mixing `src/` and
  // `scripts/` entries makes tsup fall back to mirroring each entry's full
  // source path under `dist/` (e.g. `dist/scripts/bootstrap-db.js`)
  // instead of flattening everything to `dist/<name>.js` — confirmed by
  // actually building both ways. The Dockerfile CMD and `package.json`'s
  // `start` script both hardcode the flat `dist/main.http.js` shape, so
  // this must stay flat regardless of which top-level folder an entry's
  // source lives in.
  entry: {
    'main.http': 'src/main.http.ts',
    'main.worker': 'src/main.worker.ts',
    'main.mqtt': 'src/main.mqtt.ts',
    'main.scheduler': 'src/main.scheduler.ts',
    'bootstrap-db': 'scripts/bootstrap-db.ts',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
});
