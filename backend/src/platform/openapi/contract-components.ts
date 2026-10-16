import { createHash } from 'node:crypto';

type Json = any;

/**
 * Turns the many inline copies of the same object shape (the login-style user,
 * the paginator envelope, a device…) that response tracing produces into named
 * `components.schemas` referenced with `$ref`. Names come from curated rules
 * (`contract/naming.json`: leading property names -> name) and otherwise from
 * the property the shape was found under; both are deterministic, so
 * regenerating an unchanged codebase yields an identical file.
 */

const stable = (o: unknown): string =>
  JSON.stringify(o, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(x => [x, v[x]])
        )
      : v
  );

const digest = (o: unknown) => createHash('sha1').update(stable(o)).digest('hex');
const MIN_PROPS = 4;
const MIN_SIZE = 260;

function isObj(s: Json): boolean {
  return (
    s &&
    typeof s === 'object' &&
    s.properties &&
    (s.type === 'object' || (Array.isArray(s.type) && s.type.includes('object')))
  );
}
const hoistable = (s: Json): boolean =>
  isObj(s) && Object.keys(s.properties).length >= MIN_PROPS && stable(s).length >= MIN_SIZE;

const pascal = (w: string) =>
  w
    .replace(/(^|[_\s-])(\w)/g, (_m, _a, c: string) => c.toUpperCase())
    .replace(/ies$/, 'y')
    .replace(/(?<!s)s$/, '');

const PAGINATOR_KEYS = [
  'current_page',
  'data',
  'first_page_url',
  'last_page',
  'links',
  'per_page',
  'total',
];

/**
 * Laravel's paginator appears with a different `data` item type on many endpoints. Factor the shared part into one
 * `LaravelPaginator` component and keep only `data` per endpoint (`allOf`), instead of a near-duplicate per endpoint.
 */
function factorPaginators(node: Json, base: { schema?: Json }): Json {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(n => factorPaginators(n, base));
  const out: Json = {};
  for (const [k, v] of Object.entries<Json>(node)) out[k] = factorPaginators(v, base);
  if (isObj(out) && PAGINATOR_KEYS.every(k => k in out.properties)) {
    const { data, ...rest } = out.properties as Record<string, Json>;
    base.schema ??= {
      type: 'object',
      properties: { ...rest, data: { type: 'array', items: {} } },
      required:
        (out.required as string[] | undefined)?.filter(k => k !== 'data').concat('data') ?? [],
    };
    const nullable = Array.isArray(out.type) && out.type.includes('null');
    const composed = {
      allOf: [
        { $ref: '#/components/schemas/LaravelPaginator' },
        { type: 'object', properties: { data }, required: ['data'] },
      ],
    };
    return nullable ? { anyOf: [composed, { type: 'null' }] } : composed;
  }
  return out;
}

export function hoistSharedSchemas(
  roots: Json[],
  rules: [string, string][],
  existing: Set<string>
): Record<string, Json> {
  const paginator: { schema?: Json } = {};
  roots.forEach((r, i) => {
    roots[i] = factorPaginators(r, paginator);
  });
  const counts = new Map<string, { n: number; hint: string; schema: Json }>();
  const scan = (s: Json, hint: string): void => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return;
    if (hoistable(s)) {
      const h = digest(s);
      const c = counts.get(h) ?? { n: 0, hint, schema: s };
      c.n++;
      counts.set(h, c);
    }
    for (const [k, v] of Object.entries<Json>(s.properties ?? {})) scan(v, k);
    if (s.items) scan(s.items, hint);
    if (s.additionalProperties && typeof s.additionalProperties === 'object')
      scan(s.additionalProperties, hint);
    for (const x of s.oneOf ?? []) scan(x, hint);
    for (const x of s.anyOf ?? []) scan(x, hint);
    for (const x of s.allOf ?? []) scan(x, hint);
  };
  for (const r of roots) scan(r, 'Root');

  const ruleFor = (schema: Json): string | undefined => {
    const keys = Object.keys(schema.properties ?? {}).join(',');
    let best: string | undefined;
    let bestLen = -1;
    for (const [prefix, name] of rules) {
      if (
        keys.startsWith(prefix) &&
        prefix.length > bestLen &&
        (keys.length === prefix.length || keys[prefix.length] === ',')
      ) {
        best = name;
        bestLen = prefix.length;
      }
    }
    return best;
  };

  const names = new Map<string, string>();
  const used = new Set(existing);
  const order = [...counts.entries()].sort((a, b) =>
    (a[1].hint + a[0]).localeCompare(b[1].hint + b[0])
  );
  for (const [h, c] of order) {
    const curated = ruleFor(c.schema);
    if (c.n < 2 && !curated) continue;
    const generic = ['data', 'items', 'object', 'root', 'result', 'results'].includes(
      c.hint.toLowerCase()
    );
    const base = curated ?? ((generic ? 'Shared' : pascal(c.hint)) || 'Shared');
    let n = base;
    let i = 2;
    while (used.has(n)) n = `${base}V${i++}`;
    used.add(n);
    names.set(h, n);
  }

  const components: Record<string, Json> = {};
  const replace = (s: Json): Json => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
    const h = hoistable(s) ? digest(s) : undefined;
    const out: Json = { ...s };
    if (out.properties)
      out.properties = Object.fromEntries(
        Object.entries<Json>(out.properties).map(([k, v]) => [k, replace(v)])
      );
    if (out.items) out.items = replace(out.items);
    if (out.additionalProperties && typeof out.additionalProperties === 'object')
      out.additionalProperties = replace(out.additionalProperties);
    if (out.oneOf) out.oneOf = out.oneOf.map(replace);
    if (out.anyOf) out.anyOf = out.anyOf.map(replace);
    if (out.allOf) out.allOf = out.allOf.map(replace);
    const name = h ? names.get(h) : undefined;
    if (!name) return out;
    const nullable = Array.isArray(out.type) && out.type.includes('null');
    const body = { ...out };
    if (nullable)
      body.type =
        out.type.filter((t: string) => t !== 'null').length === 1
          ? out.type.find((t: string) => t !== 'null')
          : out.type.filter((t: string) => t !== 'null');
    components[name] = body;
    return nullable
      ? { anyOf: [{ $ref: `#/components/schemas/${name}` }, { type: 'null' }] }
      : { $ref: `#/components/schemas/${name}` };
  };
  roots.forEach((r, i) => {
    roots[i] = replace(r);
  });
  if (paginator.schema) components['LaravelPaginator'] = paginator.schema;
  return components;
}
