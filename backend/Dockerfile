# ConvoyAI backend (Node/TypeScript). One image, 4 possible entrypoints
# (ARCHITECTURE.md §1) selected at `docker run` time via CMD override —
# see the examples at the bottom.

FROM node:22-slim AS base
WORKDIR /app
# Prisma's query engine needs libssl to detect the OpenSSL version, both
# at `prisma generate` time and at boot — installed on the shared base
# so the engine generated in the build stage matches the runtime stage.
# Confirmed by actually running this image: skipping this on just one
# side (e.g. runtime only) causes a binaryTarget mismatch
# ("Query Engine for runtime debian-openssl-3.0.x... generated for
# debian-openssl-1.1.x") because the two stages guess differently.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
# The generated Prisma Client (query engine + runtime) lives in
# node_modules/.prisma, not node_modules/@prisma — confirmed by actually
# running this image: omitting it fails at boot with "did not initialize
# yet", not a lint/typecheck-visible error, since the generate step only
# ran in the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
# Raw-SQL Timescale migrations (ARCHITECTURE.md §9, D-0057) aren't part of
# the Prisma-generated client or the tsup bundle — copied explicitly so
# `dist/bootstrap-db.js` (module 6.2/Phase 7's consolidated bootstrap) can
# find them at runtime, same reason `prisma/` (manual-migrations' home) is
# copied above.
COPY --from=build /app/src/platform/timeseries/migrations ./src/platform/timeseries/migrations

# Default: HTTP + Socket.IO API. Override CMD to run the worker/mqtt/
# scheduler processes from this same image instead, e.g.:
#   docker run <image> node dist/main.worker.js
#   docker run <image> node dist/main.mqtt.js
#   docker run <image> node dist/main.scheduler.js
EXPOSE 8080
CMD ["node", "dist/main.http.js"]
