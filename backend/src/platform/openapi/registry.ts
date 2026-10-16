import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Central OpenAPI registry (ARCHITECTURE.md §4). Every module registers
 * its request/response Zod schemas here via `<module>.schemas.ts`; the
 * generated spec is diffed against reference/openapi.yaml in CI
 * (D-0008) — drift fails the build unless the frozen file was
 * deliberately updated with a DECISIONS.md entry.
 *
 * Empty at this stage (0.7 walking skeleton, no modules yet) — the
 * generated document below has zero paths until a module registers.
 */
export const openApiRegistry = new OpenAPIRegistry();

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ConvoyAI API',
      version: '0.0.0',
      description:
        'Node/TypeScript rewrite — see migration/reference/openapi.yaml for the frozen target contract.',
    },
    // Matches the frozen contract's `servers: /api` (openapi.yaml) — every
    // module's routes are registered path-relative (`/login`, not
    // `/api/login`) and mounted under this prefix in app.ts.
    servers: [{ url: '/api' }],
  });
}
