import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateOpenApiDocument } from './registry.js';
import { listMountedRoutes, type MountedRoute } from './route-introspection.js';
import { traceHandler, type TracedError } from './error-trace.js';
import { traceResponses } from './response-types.js';
import { traceRequest, type TracedRequest } from './request-types.js';
import { hoistSharedSchemas } from './contract-components.js';
import type { GuardMeta } from '../http/guards.js';

/**
 * Assembles THE contract (published to `backend_frontend_sync/api_contract/openapi.yaml`, served to the
 * frontend). Three inputs, none hand-copied from another:
 *
 *  1. the Zod registry  -> paths, path/query params, request bodies
 *  2. the mounted router -> which operations exist, their auth guards
 *  3. the source AST     -> the literal error messages each operation can raise
 *
 * plus the curated data in `contract/` (response schemas, shared components,
 * per-operation quirk notes) that no code can supply. Anything that does not
 * line up — an operation mounted but undocumented, documented but not
 * mounted, a curated entry for a route that no longer exists — is reported by
 * `problems` so `npm run openapi:check` fails instead of silently drifting.
 */

export const CONTRACT_VERSION = '1.0.0';

type Json = any;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const CONTRACT_DIR = join(import.meta.dirname, 'contract');

function readJson(file: string): Json {
  return JSON.parse(readFileSync(file, 'utf8')) as Json;
}

function loadDir(dir: string): Json {
  const merged: Json = {};
  if (!existsSync(dir)) return merged;
  for (const f of readdirSync(dir)
    .filter(n => n.endsWith('.json'))
    .sort()) {
    for (const [k, v] of Object.entries(readJson(join(dir, f)))) {
      if (k in merged) throw new Error(`contract: duplicate key "${k}" in ${dir}/${f}`);
      merged[k] = v;
    }
  }
  return merged;
}

function operationId(method: string, path: string): string {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map(seg => {
      const m = /^\{(.+)\}$/.exec(seg);
      const word = (m ? m[1]! : seg).replace(/[^A-Za-z0-9]+(.)?/g, (_x, c: string | undefined) =>
        c ? c.toUpperCase() : ''
      );
      return (m ? 'By' : '') + word.charAt(0).toUpperCase() + word.slice(1);
    });
  return method + parts.join('');
}

/** `listCompanies` -> "List companies", `getUserAccessPath` -> "Get user access path". */
function humanize(handler: string): string {
  const words = handler.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const errorEnvelope = { $ref: '#/components/schemas/ErrorResponse' };
const parityEnvelope = {
  type: 'object',
  required: ['success', 'message'],
  properties: { success: { type: 'boolean' }, message: { type: 'string' } },
};
const validationEnvelope = { $ref: '#/components/schemas/ValidationErrorResponse' };

function errorResponse(
  status: number,
  messages: string[],
  schema: Json,
  extra?: string,
  success = false
): Json {
  const uniq = [...new Set(messages)];
  const examples: Json = {};
  uniq.slice(0, 12).forEach((m, i) => {
    examples[`m${i + 1}`] = { summary: m, value: { success, message: m } };
  });
  const names: Record<number, string> = {
    401: 'Unauthenticated',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    422: 'Validation failed',
    500: 'Internal server error',
    502: 'Upstream error',
  };
  return {
    description: [
      names[status] ?? `Error ${status}`,
      extra,
      uniq.length ? `Possible messages: ${uniq.map(m => `\`${m}\``).join('; ')}` : undefined,
    ]
      .filter(Boolean)
      .join('. '),
    content: { 'application/json': { schema, ...(uniq.length ? { examples } : {}) } },
  };
}

function guardsDoc(guards: GuardMeta[]): {
  security: Json[];
  roles: string[];
  perms: string[];
  forbidden: string[];
} {
  const roles = guards.filter(g => g.kind === 'role').map(g => (g as { name: string }).name);
  const perms = guards.filter(g => g.kind === 'permission').map(g => (g as { name: string }).name);
  return {
    security: guards.length ? [{ bearerAuth: [] }] : [],
    roles,
    perms,
    forbidden: [
      ...roles.map(r => `Requires role: ${r}`),
      ...perms.map(p => `Requires permission: ${p}`),
    ],
  };
}

function refsIn(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) node.forEach(n => refsIn(n, acc));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') acc.add(v.replace('#/components/schemas/', ''));
      else refsIn(v, acc);
    }
  }
}

/** `upload.single("field")` calls in the route files -> the multipart file field of that route. */
function uploadFields(): Map<string, { field: string; maxMb: number }> {
  const out = new Map<string, { field: string; maxMb: number }>();
  const modules = join(import.meta.dirname, '..', '..', 'modules');
  for (const dir of readdirSync(modules)) {
    for (const file of readdirSync(join(modules, dir)).filter(f => f.endsWith('.routes.ts'))) {
      const text = readFileSync(join(modules, dir, file), 'utf8');
      const limit = /fileSize:\s*(\d+)\s*\*\s*1024/.exec(text);
      const maxMb = limit ? Math.round((Number(limit[1]) / 1024) * 10) / 10 : 10;
      for (const m of text.matchAll(/upload\.single\("(\w+)"\)/g)) {
        const before = text.slice(0, m.index);
        const route = [
          ...before.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g),
        ].pop();
        if (route)
          out.set(`${route[1]!.toUpperCase()} ${route[2]!.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`, {
            field: m[1]!,
            maxMb,
          });
      }
    }
  }
  return out;
}

/** Replace the Zod registry's guess with the schemas the handler really validates against. */
function applyRequest(
  op: Json,
  route: MountedRoute,
  t: TracedRequest,
  upload: { field: string; maxMb: number } | undefined
): void {
  const registryParams: Json[] = op.parameters ?? [];
  const params: Json[] = [];

  const pathNames = [...route.path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!);
  for (const name of pathNames) {
    const fromSchema =
      t.params?.properties?.[name] ??
      registryParams.find(p => p.in === 'path' && p.name === name)?.schema;
    // Ids are JSON integers everywhere in the API; anything else in a path (`provider`, `connector`, `gateway`) is a string.
    const fallback = /(^id$|Id$|_id$)/.test(name) ? { type: 'integer' } : { type: 'string' };
    params.push({ name, in: 'path', required: true, schema: fromSchema ?? fallback });
  }

  if (t.query?.properties) {
    const required = new Set<string>(t.query.required ?? []);
    for (const [name, schema] of Object.entries<Json>(t.query.properties)) {
      params.push({ name, in: 'query', required: required.has(name), schema });
    }
  } else {
    params.push(...registryParams.filter(p => p.in === 'query'));
    if (t.unvalidatedQuery && !registryParams.some(p => p.in === 'query'))
      op['x-unvalidated-query'] = true;
  }
  if (params.length) op.parameters = params;
  else delete op.parameters;

  if (upload) {
    const props: Json = {
      ...(t.body?.properties ?? {}),
      [upload.field]: {
        type: 'string',
        format: 'binary',
        description: `Image file (multipart); max ${upload.maxMb} MB`,
      },
    };
    op.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: props,
            ...(t.body?.required?.length ? { required: t.body.required } : {}),
          },
        },
      },
    };
  } else if (t.body) {
    op.requestBody = { required: true, content: { 'application/json': { schema: t.body } } };
  } else if (!op.requestBody && t.unvalidatedBody) {
    op.requestBody = { content: { 'application/json': { schema: { type: 'object' } } } };
    op['x-unvalidated-body'] = true;
  }
}

export interface ContractResult {
  document: Json;
  problems: string[];
}

export async function buildContract(): Promise<ContractResult> {
  const problems: string[] = [];
  const doc = structuredClone(generateOpenApiDocument()) as Json;
  const mounted = listMountedRoutes();

  const curatedResponses = loadDir(join(CONTRACT_DIR, 'responses'));
  const annotations = loadDir(join(CONTRACT_DIR, 'annotations'));
  const sharedComponents = loadDir(join(CONTRACT_DIR, 'components'));
  const examplesData = loadDir(join(CONTRACT_DIR, 'examples'));
  const naming: [string, string][] = existsSync(join(CONTRACT_DIR, 'naming.json'))
    ? (JSON.parse(readFileSync(join(CONTRACT_DIR, 'naming.json'), 'utf8')) as [string, string][])
    : [];
  const head = existsSync(join(CONTRACT_DIR, 'info.json'))
    ? readJson(join(CONTRACT_DIR, 'info.json'))
    : {};

  const key = (m: string, p: string) => `${m.toUpperCase()} ${p}`;
  const usedCurated = new Set<string>();
  const usedAnnotations = new Set<string>();
  const outPaths: Json = {};

  // PATCH aliases (`Route::match(['put','patch'])`) are mounted next to their PUT — document them as
  // the same operation rather than inventing separate schemas.
  const opFor = (r: MountedRoute): Json | undefined => {
    const item = doc.paths[r.path];
    const direct = item?.[r.method];
    if (direct) return structuredClone(direct);
    if (r.method === 'patch' && item?.put) {
      const alias = structuredClone(item.put);
      alias.summary = `${alias.summary ?? ''} (PATCH alias of PUT)`.trim();
      alias['x-alias-of'] = key('put', r.path);
      return alias;
    }
    return undefined;
  };

  const uploads = uploadFields();
  for (const r of mounted) {
    const base = opFor(r);
    if (!base) {
      problems.push(`mounted but not documented: ${key(r.method, r.path)}`);
      continue;
    }
    const { security, roles, perms, forbidden } = guardsDoc(r.guards);
    const traced: TracedError[] = r.handler
      ? traceHandler(r.handler.controller, r.handler.method)
      : [];
    const byStatus = new Map<number, string[]>();
    const successTrue = new Set<number>();
    for (const e of traced) {
      byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e.message]);
      if (e.success) successTrue.add(e.status);
    }

    const tracedRequest = r.handler
      ? await traceRequest(r.handler.controller, r.handler.method)
      : {};
    applyRequest(base, r, tracedRequest, uploads.get(key(r.method, r.path)));
    const hasInput = Boolean(base.requestBody) || (base.parameters ?? []).length > 0;
    const responses: Json = {};

    // 2xx: derived from the controller's `res.json(...)` argument types (response-types.ts); curated data
    // (`contract/responses`) overrides per status code; the Zod registry's guess is only a last resort.
    const curated = curatedResponses[key(r.method, r.path)] as Json | undefined;
    if (curated) usedCurated.add(key(r.method, r.path));
    const derived = (
      r.handler ? traceResponses(r.handler.controller, r.handler.method) : []
    ).filter(t => t.status < 400);
    const examples = examplesData[key(r.method, r.path)] as Json | undefined;
    for (const t of derived) {
      responses[String(t.status)] = {
        description: t.schema ? 'OK' : 'OK (no body)',
        ...(t.schema
          ? {
              content: {
                [t.contentType]: {
                  schema: t.schema,
                  ...(examples?.[String(t.status)] !== undefined
                    ? { example: examples[String(t.status)] }
                    : {}),
                },
              },
            }
          : {}),
        'x-shape-source': 'typescript',
      };
    }
    if (Object.keys(responses).length === 0) {
      for (const [code, def] of Object.entries<Json>(base.responses ?? {}))
        if (Number(code) < 400) responses[code] = def;
      if (Object.keys(responses).length === 0) responses['200'] = { description: 'OK' };
    }
    for (const [code, def] of Object.entries<Json>(curated ?? {})) {
      const { schema, example, description, ...rest } = def;
      responses[code] = {
        description: description ?? responses[code]?.description ?? 'OK',
        ...(schema
          ? {
              content: {
                [def.contentType ?? 'application/json']: {
                  schema,
                  ...(example !== undefined ? { example } : {}),
                },
              },
            }
          : responses[code]?.content
            ? { content: responses[code].content }
            : {}),
        ...Object.fromEntries(
          Object.entries(rest).filter(([k]) => k.startsWith('x-') || k === 'headers')
        ),
        'x-shape-source': 'curated',
      };
    }

    // Errors: guards + traced service errors + the platform-wide ones.
    // The standard 401 (no extra messages) and every 500 are shared `components.responses`.
    const extra401 = (byStatus.get(401) ?? []).filter(m => m !== 'Authentication required');
    if (security.length && extra401.length === 0)
      responses['401'] = { $ref: '#/components/responses/Unauthenticated' };
    if (forbidden.length) responses['403'] = errorResponse(403, forbidden, errorEnvelope);
    for (const [status, msgs] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
      if (status === 422) continue;
      if (status === 403 && responses['403']) {
        const combined = [...forbidden, ...msgs];
        responses['403'] = errorResponse(403, combined, errorEnvelope);
      } else if (status === 401) {
        if (security.length && extra401.length === 0) continue;
        const extra = security.length ? ['Authentication required'] : [];
        responses['401'] = errorResponse(
          401,
          [...extra, ...extra401],
          errorEnvelope,
          security.length ? 'Missing, malformed, expired or logged-out bearer token' : undefined
        );
      } else {
        responses[String(status)] = errorResponse(
          status,
          msgs,
          successTrue.has(status) ? parityEnvelope : errorEnvelope,
          successTrue.has(status)
            ? 'Laravel-parity quirk: the error body carries `success: true`'
            : undefined,
          successTrue.has(status)
        );
      }
    }
    if (hasInput || byStatus.has(422)) {
      responses['422'] = errorResponse(
        422,
        byStatus.get(422) ?? [],
        validationEnvelope,
        'Request failed validation; `errors` maps each field to its messages'
      );
    }
    responses['500'] = { $ref: '#/components/responses/InternalServerError' };

    const op: Json = { ...base, responses };
    if (r.handler) {
      // The registry's `summary` holds implementation notes ("D-0076 precedent…"); the contract wants a plain
      // one-line summary, so derive it from the handler name and keep the note as the description.
      const note = typeof base.summary === 'string' ? base.summary.trim() : '';
      op.summary = humanize(r.handler.method);
      if (note && note.toLowerCase() !== op.summary.toLowerCase()) op.description = note;
    }
    op.operationId = operationId(r.method, r.path);
    op.security = security;
    op['x-auth'] = security.length ? 'bearer' : 'public';
    if (roles.length) op['x-required-roles'] = roles;
    if (perms.length) op['x-required-permissions'] = perms;

    const note = annotations[key(r.method, r.path)] as Json | undefined;
    if (note) {
      usedAnnotations.add(key(r.method, r.path));
      Object.assign(op, note);
    }

    (outPaths[r.path] ??= {})[r.method] = op;
  }

  for (const p of Object.keys(doc.paths)) {
    for (const m of METHODS) {
      if (doc.paths[p][m] && !outPaths[p]?.[m])
        problems.push(`documented but not mounted: ${key(m, p)}`);
    }
  }
  for (const k of Object.keys(curatedResponses))
    if (!usedCurated.has(k)) problems.push(`curated response for unknown operation: ${k}`);
  for (const k of Object.keys(annotations))
    if (!usedAnnotations.has(k)) problems.push(`annotation for unknown operation: ${k}`);

  // Stable ordering: paths alphabetical, methods in a fixed order.
  const sortedPaths: Json = {};
  for (const p of Object.keys(outPaths).sort()) {
    sortedPaths[p] = {};
    for (const m of METHODS) if (outPaths[p][m]) sortedPaths[p][m] = outPaths[p][m];
  }

  const components: Json = {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          '`Authorization: Bearer <token>` where the token is `token` (== `access_token`) from `POST /login`. Valid 7 days; revoked by `POST /logout`.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: { success: { const: false }, message: { type: 'string' } },
      },
      ValidationErrorResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { const: false },
          message: { type: 'string', description: 'The first validation message.' },
          errors: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
            description: 'Field (dot path) -> messages.',
          },
        },
      },
      ...(doc.components?.schemas ?? {}),
      ...sharedComponents,
    },
  };

  components.responses = {
    Unauthenticated: errorResponse(
      401,
      ['Authentication required'],
      errorEnvelope,
      'Missing, malformed, expired or logged-out bearer token'
    ),
    InternalServerError: errorResponse(
      500,
      ['Internal server error'],
      errorEnvelope,
      'Unexpected failure; no detail is leaked to the client'
    ),
  };

  const out: Json = {
    openapi: '3.1.0',
    info: {
      title: 'ConvoyAI API',
      version: CONTRACT_VERSION,
      ...head.info,
    },
    servers: [{ url: '/api', description: 'All routes are mounted under /api' }],
    ...(head.tags ? { tags: head.tags } : {}),
    ...(head.extensions ?? {}),
    paths: sortedPaths,
    components,
  };
  if (head.security !== false) out.security = [{ bearerAuth: [] }];

  // Hoist repeated response shapes into named components.
  const responseSchemas: Json[] = [];
  const slots: { holder: Json; k: string }[] = [];
  for (const item of Object.values<Json>(out.paths)) {
    for (const op of Object.values<Json>(item)) {
      for (const [code, resp] of Object.entries<Json>(op.responses)) {
        if (Number(code) >= 400) continue;
        for (const media of Object.values<Json>(resp.content ?? {})) {
          if (media.schema && !media.schema.$ref) {
            responseSchemas.push(media.schema);
            slots.push({ holder: media, k: 'schema' });
          }
        }
      }
    }
  }
  // Names already taken = what the (non-response) parts of the document still reference, plus the fixed ones.
  const taken = new Set<string>([
    'LaravelPaginator',
    ...Object.keys(sharedComponents),
    'ErrorResponse',
    'ValidationErrorResponse',
  ]);
  refsIn(out.paths, taken);
  const hoisted = hoistSharedSchemas(responseSchemas, naming, taken);
  slots.forEach((s, i) => {
    s.holder[s.k] = responseSchemas[i];
  });
  Object.assign(components.schemas, hoisted);

  // Prune components nothing references (the Zod registry's superseded response guesses).
  const keep = new Set<string>();
  const queue = new Set<string>();
  refsIn(out.paths, queue);
  while (queue.size) {
    const name = queue.values().next().value as string;
    queue.delete(name);
    if (keep.has(name)) continue;
    keep.add(name);
    const child = new Set<string>();
    refsIn(components.schemas[name], child);
    child.forEach(c => !keep.has(c) && queue.add(c));
  }
  for (const name of Object.keys(components.schemas)) {
    if (!keep.has(name)) delete components.schemas[name];
  }
  const sortedSchemas: Json = {};
  for (const n of Object.keys(components.schemas).sort()) sortedSchemas[n] = components.schemas[n];
  components.schemas = sortedSchemas;

  return { document: out, problems };
}
