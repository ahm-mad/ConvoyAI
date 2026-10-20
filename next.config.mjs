import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

// Asset extensions that, under Vite, resolved to a plain URL string on import.
// The codebase relies on that in ~58 places (`<img src={imported}>`, leaflet
// iconUrl, CSS url(), <video src>). Next would otherwise return a StaticImageData
// object for images and fail outright on media. We route them all through
// webpack's `asset/resource` so `import x from './a.png'` === a string URL again.
const URL_ASSET_RE = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|mp4|webm|m4v|ogv|mp3|wav|flac|aac|m4a)$/i;

function excludeFromNextImageLoader(rules) {
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;
    if (rule.loader === 'next-image-loader') {
      rule.exclude = rule.exclude
        ? [].concat(rule.exclude, URL_ASSET_RE)
        : URL_ASSET_RE;
    }
    if (Array.isArray(rule.oneOf)) excludeFromNextImageLoader(rule.oneOf);
  }
}

const nextConfig = {
  reactStrictMode: true,

  // Pin the workspace root to this repo. Without it Next picks ~/package-lock.json
  // (a stray file in $HOME) as the root and warns about multiple lockfiles.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),

  // ESLint: ~2900 pre-existing issues in the codebase (unrelated to the Next/TS
  // migration) — don't block builds on them. `npm run lint` still works; cleanup
  // is a separate track.
  eslint: { ignoreDuringBuilds: true },

  // TypeScript: `tsc --noEmit` is clean (0 errors). Files not yet fully typed
  // carry `// @ts-nocheck -- TODO(ts-migration)` (grep for it) and get typed
  // incrementally. A type regression in an already-typed file now fails the build.
  typescript: { ignoreBuildErrors: false },

  // Large static assets are served straight from /public; Next's
  // image optimizer is not in the picture for this app (see task.md).
  // `disableStaticImages` turns off Next's `*.png -> StaticImageData` typing so
  // our own `src/types/assets.d.ts` (`*.png -> string`) wins — which matches
  // what the webpack rule below actually produces (a URL string).
  images: { unoptimized: true, disableStaticImages: true },

  webpack(config) {
    excludeFromNextImageLoader(config.module.rules);
    config.module.rules.push({
      test: URL_ASSET_RE,
      type: 'asset/resource',
      generator: { filename: 'static/media/[name].[hash][ext]' },
    });
    return config;
  },
};

export default nextConfig;
