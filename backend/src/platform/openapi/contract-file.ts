import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { stringify, parse } from 'yaml';
import { splitByTag, mergeModules, type ModuleFile } from './contract-split.js';

type Json = any;

/**
 * The contract the frontend consumes, split by module (D-0140 — the single
 * 860 KB file was unwieldy to hand over or open on demand), and living in
 * `../backend_frontend_sync/api_contract/` (D-0141) — the hand-copied bridge
 * folder to the separate frontend workspace, not `migration/` — since
 * that folder, not this repo's own docs, is what actually gets handed over.
 * `CONTRACT_PATH` is the small **index** (conventions header, servers/
 * security, and an `x-modules` map of tag -> file); `MODULES_DIR` holds one
 * self-contained OpenAPI 3.1 file per tag. `npm run openapi:write` writes
 * both; `npm run openapi:check` reconstructs one logical document from all
 * of them (`readContract()`) and compares it against a fresh
 * `buildContract()`, so nothing about the drift-check's guarantee changed —
 * only the on-disk location/shape.
 */
export const CONTRACT_PATH = resolve(
  import.meta.dirname,
  '../../../../backend_frontend_sync/api_contract/openapi.yaml'
);
export const MODULES_DIR = resolve(
  import.meta.dirname,
  '../../../../backend_frontend_sync/api_contract/openapi'
);

const INDEX_HEADER = `# ConvoyAI API contract — INDEX (OpenAPI 3.1) — GENERATED FILE, do not edit by hand.
#
# This file has no \`paths\` — it's the entry point. Every operation lives in one of the per-module files
# under openapi/ (see \`x-modules\` below, or API_CONTRACT.md's endpoint index, which links each module
# section to its file). Source of truth: node-backend/src/platform/openapi/ (Zod registry + mounted
# routes + traced errors + contract/ data) in the backend repo. Change the code/data there, then run
# \`npm run openapi:write\` in node-backend/ and copy this whole api_contract/ folder into
# backend_frontend_sync/ (see that folder's own README.md); \`npm run openapi:check\` (CI, backend repo)
# fails if these files drift from the code. Human-readable companion: API_CONTRACT.md (this folder).
`;

function moduleHeader(tag: string): string {
  return `# ConvoyAI API contract — module "${tag}" (OpenAPI 3.1) — GENERATED FILE, do not edit by hand.
#
# One self-contained module of the full contract — see ../openapi.yaml (the index) for the complete
# module list, and ../API_CONTRACT.md for conventions, realtime events and known problems.
# Regenerate with \`npm run openapi:write\` in node-backend/ (backend repo); do not hand-edit.
`;
}

function stringifyYaml(document: unknown): string {
  return stringify(document, { lineWidth: 0, aliasDuplicateObjects: false, version: '1.1' });
}

/** Builds the small index document: everything from `document` except `paths`, plus an `x-modules` map. */
function buildIndexDocument(document: Json, modules: ModuleFile[]): Json {
  const xModules: Json = {};
  for (const m of modules)
    xModules[m.tag] = { file: `openapi/${m.fileName}`, operations: m.operationCount };
  return {
    openapi: document.openapi,
    info: document.info,
    servers: document.servers,
    security: document.security,
    tags: document.tags,
    'x-modules': xModules,
    components: {
      securitySchemes: document.components.securitySchemes,
      responses: document.components.responses,
    },
  };
}

/** Splits `document` exactly as `writeContract` would, without touching disk — the index + module files as they'd be written. */
function renderSplit(document: Json): { index: Json; modules: ModuleFile[] } {
  const modules = splitByTag(document);
  const index = buildIndexDocument(document, modules);
  return { index, modules };
}

/**
 * Canonicalizes `document` into the same shape `readContract()` returns (merged from the index +
 * module files, including the synthesized `x-modules` map and the YAML round-trip's type coercions)
 * — so a freshly generated document and the committed one can be compared apples-to-apples even
 * though the contract is split across files on disk (D-0140).
 */
export function renderContract(document: Json): string {
  const { index, modules } = renderSplit(document);
  // Round-trip every piece through YAML the same way disk read/write would, so e.g. a `Date` becomes
  // the same string type comparison expects either way.
  const reparsedIndex = parse(stringifyYaml(index)) as Json;
  const reparsedModules = modules.map(m => ({
    ...m,
    document: parse(stringifyYaml(m.document)) as Json,
  }));
  return stringifyYaml(mergeModules(reparsedIndex, reparsedModules));
}

export function writeContract(document: Json): void {
  const { index, modules } = renderSplit(document);
  writeFileSync(CONTRACT_PATH, INDEX_HEADER + stringifyYaml(index));

  mkdirSync(MODULES_DIR, { recursive: true });
  const wanted = new Set(modules.map(m => m.fileName));
  for (const existing of existsSync(MODULES_DIR) ? readdirSync(MODULES_DIR) : []) {
    if (existing.endsWith('.yaml') && !wanted.has(existing))
      unlinkSync(join(MODULES_DIR, existing));
  }
  for (const m of modules) {
    writeFileSync(join(MODULES_DIR, m.fileName), moduleHeader(m.tag) + stringifyYaml(m.document));
  }
}

/** Reads the index + every module file back off disk and folds them into one logical document, for diffing/conformance. */
export function readContract(): Json {
  const index = parse(readFileSync(CONTRACT_PATH, 'utf8')) as Json;
  const files = (existsSync(MODULES_DIR) ? readdirSync(MODULES_DIR) : []).filter(f =>
    f.endsWith('.yaml')
  );
  const modules: ModuleFile[] = files.map(f => {
    const doc = parse(readFileSync(join(MODULES_DIR, f), 'utf8')) as Json;
    const tag: string = doc.tags?.[0]?.name ?? f.replace(/\.yaml$/, '');
    const operationCount = Object.values<Json>(doc.paths).reduce(
      (n: number, item) => n + Object.keys(item as object).length,
      0
    );
    return { tag, fileName: f, document: doc, operationCount };
  });
  return mergeModules(index, modules);
}

/** The human-readable companion; only the region between the markers is generated. */
export const COMPANION_PATH = resolve(
  import.meta.dirname,
  '../../../../backend_frontend_sync/api_contract/API_CONTRACT.md'
);
const BEGIN = '<!-- BEGIN GENERATED: endpoint-index (npm run openapi:write) -->';
const END = '<!-- END GENERATED: endpoint-index -->';

type Op = Record<string, any>;

function authCell(op: Op): string {
  if (op['x-auth'] === 'public') return 'public';
  const roles = (op['x-required-roles'] as string[] | undefined)?.map(r => `role \`${r}\``) ?? [];
  const perms =
    (op['x-required-permissions'] as string[] | undefined)?.map(p => `perm \`${p}\``) ?? [];
  return ['token', ...roles, ...perms].join(' + ');
}

export function renderIndex(document: Json): string {
  const byTag = new Map<string, { method: string; path: string; op: Op }[]>();
  for (const [path, item] of Object.entries<Record<string, Op>>(document.paths)) {
    for (const [method, op] of Object.entries(item)) {
      const tag = (op['tags'] as string[] | undefined)?.[0] ?? 'misc';
      byTag.set(tag, [...(byTag.get(tag) ?? []), { method: method.toUpperCase(), path, op }]);
    }
  }
  const tagDesc = new Map<string, string>(
    (document.tags ?? []).map((t: { name: string; description: string }) => [t.name, t.description])
  );
  const total = [...byTag.values()].reduce((n, l) => n + l.length, 0);
  const lines: string[] = [
    `${total} operations across ${byTag.size} module files under [\`openapi/\`](openapi/) (index: [\`openapi.yaml\`](openapi.yaml)). Each module heading below links to its file. **Tested** = exercised from the real frontend (backend repo's own \`migration/API_TESTING_LOG.md\` row); **Notes** = has quirks/deviations (listed below, also inside that module's own file).`,
    '',
  ];
  for (const tag of [...byTag.keys()].sort()) {
    lines.push(
      `### ${tag} — [\`openapi/${tag}.yaml\`](openapi/${tag}.yaml)`,
      '',
      ...(tagDesc.get(tag) ? [`${tagDesc.get(tag)}`, ''] : [])
    );
    lines.push('| Method | Path | Auth | Summary | Tested | Notes |', '|---|---|---|---|---|---|');
    for (const { method, path, op } of byTag
      .get(tag)!
      .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
      const summary = String(op['summary'] ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ');
      const tested = op['x-tested-with-frontend']
        ? `row ${op['x-tested-with-frontend'].log_row}`
        : '';
      const notes = op['x-quirks'] || op['x-deviation'] ? '⚑' : '';
      lines.push(
        `| ${method} | \`${path}\` | ${authCell(op)} | ${summary} | ${tested} | ${notes} |`
      );
    }
    lines.push('');
  }
  const notes: string[] = [];
  for (const [path, item] of Object.entries<Record<string, Op>>(document.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!op['x-quirks'] && !op['x-deviation']) continue;
      notes.push(`#### ${method.toUpperCase()} \`${path}\``, '');
      for (const q of (op['x-quirks'] as string[] | undefined) ?? []) notes.push(`- ${q}`);
      for (const d of (op['x-deviation'] as { decision: string; what: string }[] | undefined) ?? [])
        notes.push(`- **Deliberate deviation from Laravel (${d.decision}):** ${d.what}`);
      notes.push('');
    }
  }
  lines.push('### Operation notes (quirks and deviations)', '', ...notes);
  return lines.join('\n');
}

export function renderCompanion(existing: string, document: Json): string {
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i < 0 || j < 0)
    throw new Error(`${COMPANION_PATH} must contain the generated-region markers`);
  return `${existing.slice(0, i + BEGIN.length)}\n\n${renderIndex(document)}\n${existing.slice(j)}`;
}

export function writeCompanion(document: Json): void {
  writeFileSync(COMPANION_PATH, renderCompanion(readFileSync(COMPANION_PATH, 'utf8'), document));
}

export function companionDrift(document: Json): boolean {
  const existing = readFileSync(COMPANION_PATH, 'utf8');
  return existing !== renderCompanion(existing, document);
}
