import { isDeepStrictEqual } from 'node:util';
import { buildContract } from '../src/platform/openapi/contract.js';
import {
  readContract,
  renderContract,
  companionDrift,
} from '../src/platform/openapi/contract-file.js';
import { parse } from 'yaml';

/**
 * `npm run openapi:check` — fails when backend_frontend_sync/api_contract/openapi.yaml no longer matches what the code
 * generates (routes, request schemas, guards, traced errors, curated responses). Closes KNOWN_ISSUES 11.65.
 */
type Doc = {
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
};

const { document, problems } = await buildContract();
// Compare exactly what would be written, so key order/formatting differences cannot hide drift.
const generated = parse(renderContract(document)) as Doc;
let committed: Doc;
try {
  committed = readContract() as Doc;
} catch (e) {
  console.error(`openapi:check — cannot read the committed contract: ${(e as Error).message}`);
  process.exit(1);
}

const drift: string[] = [...problems];
const ops = (d: Doc) =>
  new Map(
    Object.entries(d.paths).flatMap(([p, item]) =>
      Object.entries(item).map(([m, op]) => [`${m.toUpperCase()} ${p}`, op] as const)
    )
  );
const a = ops(committed);
const b = ops(generated);
for (const k of b.keys())
  if (!a.has(k)) drift.push(`operation missing from the committed contract: ${k}`);
for (const k of a.keys())
  if (!b.has(k)) drift.push(`operation in the committed contract but no longer generated: ${k}`);
for (const [k, op] of b)
  if (a.has(k) && !isDeepStrictEqual(a.get(k), op)) drift.push(`operation changed: ${k}`);
const sa = committed.components?.schemas ?? {};
const sb = generated.components?.schemas ?? {};
for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
  if (!(k in sa)) drift.push(`schema added: ${k}`);
  else if (!(k in sb)) drift.push(`schema removed: ${k}`);
  else if (!isDeepStrictEqual(sa[k], sb[k])) drift.push(`schema changed: ${k}`);
}
if (companionDrift(document))
  drift.push(
    "backend_frontend_sync/api_contract/API_CONTRACT.md's generated endpoint index is stale"
  );
if (!isDeepStrictEqual(committed, generated) && drift.length === 0)
  drift.push('document metadata changed (info/servers/tags/security)');

if (drift.length) {
  console.error(
    `openapi:check — FAILED: ${drift.length} difference(s) between the code and backend_frontend_sync/api_contract/`
  );
  for (const d of drift.slice(0, 60)) console.error(`  - ${d}`);
  if (drift.length > 60) console.error(`  … and ${drift.length - 60} more`);
  console.error(
    'Update the code/contract data first, then run `npm run openapi:write` and commit the regenerated file.'
  );
  process.exit(1);
}
console.log(`openapi:check — OK (${b.size} operations, ${Object.keys(sb).length} schemas)`);
