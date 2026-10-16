import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Derives each route's response bodies from the code itself: for every
 * `res.status(N).json(X)` in a controller handler, the TypeScript checker
 * gives the static type of `X` (the mapper output, the envelope literal…) and
 * that type is converted to a JSON Schema. Nothing is executed and nothing is
 * sampled, so it covers writes and rarely-populated fields equally, and it is
 * re-derived on every `openapi:check` — a response shape cannot drift silently.
 *
 * Known limits (documented in API_CONTRACT.md): a value typed `any`/`unknown`
 * becomes `{}` (unknown shape); a number is `number` unless its property name
 * says it is a count/id/page (JSON has no int/float distinction to observe).
 */

export interface TracedResponse {
  status: number;
  /** `undefined` = the handler sends no body. */
  schema?: Json;
  contentType: string;
}

type Json = any;

const ROOT = resolve(import.meta.dirname, '../../..');

let cache:
  | { program: ts.Program; checker: ts.TypeChecker; classes: Map<string, ts.ClassDeclaration> }
  | undefined;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

export function load() {
  if (cache) return cache;
  const cfgPath = join(ROOT, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const rootNames = parsed.fileNames.filter(
    f => !f.includes('__tests__') && f.includes(`${join(ROOT, 'src')}`)
  );
  const program = ts.createProgram(rootNames, {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  });
  const classes = new Map<string, ts.ClassDeclaration>();
  for (const file of walk(join(ROOT, 'src', 'modules'))) {
    const sf = program.getSourceFile(file);
    sf?.forEachChild(n => {
      if (ts.isClassDeclaration(n) && n.name) classes.set(n.name.text, n);
    });
  }
  cache = { program, checker: program.getTypeChecker(), classes };
  return cache;
}

const INTEGER_KEY =
  /(^|_)(id|ids|count|total|page|per_page|from|to|last_page|current_page|limit|offset|year|month|day|port|by)$|_count$|^(id|total|count|x|y|w|h|enabled|inventory_check|alerts|normal|successful|failed)$|^is_|^total_|_devices$/;

function typeToSchema(checker: ts.TypeChecker, type: ts.Type, key: string, stack: ts.Type[]): Json {
  const f = type.flags;
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
  if (f & ts.TypeFlags.Never) return {};
  if (f & ts.TypeFlags.Null) return { type: 'null' };
  if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Void)
    return { type: 'null', 'x-undefined': true };
  if (f & ts.TypeFlags.StringLiteral) return { const: (type as ts.StringLiteralType).value };
  if (f & ts.TypeFlags.NumberLiteral) return { const: (type as ts.NumberLiteralType).value };
  if (f & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === 'true' };
  if (f & ts.TypeFlags.String || f & ts.TypeFlags.TemplateLiteral) return { type: 'string' };
  if (f & ts.TypeFlags.Number) return { type: INTEGER_KEY.test(key) ? 'integer' : 'number' };
  if (f & ts.TypeFlags.BigInt || f & ts.TypeFlags.BigIntLiteral) return { type: 'integer' };
  if (f & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (f & (ts.TypeFlags.EnumLiteral | ts.TypeFlags.Enum)) return { type: 'string' };

  if (type.isUnion()) {
    const parts = type.types;
    const nullable = parts.some(p => p.flags & ts.TypeFlags.Null);
    const nonNull = parts.filter(
      p => !(p.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void))
    );
    // boolean is `true | false` in the checker
    const bools = nonNull.filter(p => p.flags & ts.TypeFlags.BooleanLiteral);
    const rest = nonNull.filter(p => !(p.flags & ts.TypeFlags.BooleanLiteral));
    const schemas: Json[] = rest.map(p => typeToSchema(checker, p, key, stack));
    if (bools.length) schemas.push({ type: 'boolean' });
    // merge string/number literal consts into an enum
    const consts = schemas.filter(s => 'const' in s && Object.keys(s).length === 1);
    const others = schemas.filter(s => !consts.includes(s));
    if (consts.length > 1) {
      const kinds = new Set(consts.map(c => typeof c.const));
      if (kinds.size === 1) others.push({ type: [...kinds][0], enum: consts.map(c => c.const) });
      else others.push(...consts);
    } else others.push(...consts);
    let merged: Json;
    if (others.length === 0) merged = { type: 'null' };
    else if (others.length === 1) merged = { ...others[0] };
    else if (others.every(s => typeof s.type === 'string' && Object.keys(s).length === 1))
      merged = { type: others.map(s => s.type) };
    else merged = { anyOf: others };
    if (nullable) {
      if (merged.type && !merged.anyOf)
        merged.type = Array.isArray(merged.type) ? [...merged.type, 'null'] : [merged.type, 'null'];
      else if (merged.anyOf) merged.anyOf = [...merged.anyOf, { type: 'null' }];
      else merged = { anyOf: [merged, { type: 'null' }] };
    }
    return merged;
  }

  const name = type.symbol?.name ?? '';
  if (name === 'Date') return { type: 'string', format: 'date-time' };
  if (name === 'Decimal') return { type: 'string' };
  if (name === 'Buffer' || name === 'Uint8Array') return { type: 'string', format: 'byte' };
  if (name === 'JsonValue' || name === 'InputJsonValue') return {};

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const args = checker.getTypeArguments(type as ts.TypeReference);
    const parts = args.map(a => typeToSchema(checker, a, key, stack));
    const element = parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { anyOf: parts };
    return { type: 'array', items: element };
  }

  if (f & ts.TypeFlags.Object || f & ts.TypeFlags.Intersection) {
    if (stack.includes(type) || stack.length > 9) return {};
    const next = [...stack, type];
    const props = checker.getPropertiesOfType(type);
    const indexInfo = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    if (props.length === 0 && indexInfo)
      return {
        type: 'object',
        additionalProperties: typeToSchema(checker, indexInfo.type, key, next),
      };
    if (props.length === 0) return { type: 'object' };
    // call/construct signatures => a function; not JSON
    if (type.getCallSignatures().length && props.length === 0) return {};
    const properties: Record<string, Json> = {};
    const required: string[] = [];
    for (const p of props) {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      if (!decl) continue;
      const pt = checker.getTypeOfSymbolAtLocation(p, decl);
      if (pt.getCallSignatures().length && !(pt.flags & ts.TypeFlags.Union)) continue; // methods
      properties[p.name] = typeToSchema(checker, pt, p.name, next);
      if (!(p.flags & ts.SymbolFlags.Optional)) {
        // a property typed `T | undefined` is omitted from JSON when undefined
        const hasUndefined = pt.isUnion() && pt.types.some(t => t.flags & ts.TypeFlags.Undefined);
        if (!hasUndefined) required.push(p.name);
      }
      cleanUndefined(properties[p.name]);
    }
    const out: Json = { type: 'object', properties };
    if (required.length) out.required = required;
    if (indexInfo) out.additionalProperties = typeToSchema(checker, indexInfo.type, key, next);
    return out;
  }
  return {};
}

/** `undefined` members never reach the wire; drop the marker used while converting. */
function cleanUndefined(s: Json): void {
  if (!s || typeof s !== 'object') return;
  if (s['x-undefined']) return;
  if (Array.isArray(s.type)) s.type = s.type.filter((t: string) => t !== 'undefined');
  if (s.oneOf) s.oneOf = s.oneOf.filter((x: Json) => !x['x-undefined']);
}

function statusOf(call: ts.CallExpression): number {
  // res.status(N).json(...) / res.status(N).send(...)
  const target = (call.expression as ts.PropertyAccessExpression).expression;
  if (
    ts.isCallExpression(target) &&
    ts.isPropertyAccessExpression(target.expression) &&
    target.expression.name.text === 'status'
  ) {
    const arg = target.arguments[0];
    if (arg && ts.isNumericLiteral(arg)) return Number(arg.text);
  }
  return 200;
}

function contentTypeOf(call: ts.CallExpression): string | undefined {
  // res.type("html").send(...) / res.setHeader("Content-Type", "text/html…")
  let node: ts.Expression = (call.expression as ts.PropertyAccessExpression).expression;
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    if (
      node.expression.name.text === 'type' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      return node.arguments[0].text === 'html' ? 'text/html' : node.arguments[0].text;
    }
    node = node.expression.expression;
  }
  return undefined;
}

/**
 * The checker widens literals in object-literal expressions (`{ success: true }` -> `success: boolean`). The
 * envelope literals are exactly the information the frontend branches on, so restore them from the syntax:
 * boolean and string literals written directly in the returned object become `const`.
 */
function restoreLiterals(node: ts.Expression, schema: Json): void {
  if (
    !ts.isObjectLiteralExpression(node) ||
    !schema ||
    typeof schema !== 'object' ||
    !schema.properties
  )
    return;
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)))
      continue;
    const name = p.name.text;
    const target = schema.properties[name];
    if (!target) continue;
    const init = p.initializer;
    if (init.kind === ts.SyntaxKind.TrueKeyword) schema.properties[name] = { const: true };
    else if (init.kind === ts.SyntaxKind.FalseKeyword) schema.properties[name] = { const: false };
    else if (ts.isStringLiteralLike(init) && ts.isStringLiteral(init))
      schema.properties[name] = { const: init.text };
    else restoreLiterals(init, target);
  }
}

export function traceResponses(controllerClass: string, handler: string): TracedResponse[] {
  const { checker, classes } = load();
  const cls = classes.get(controllerClass);
  if (!cls) return [];
  const findMember = (name: string): ts.Node | undefined => {
    for (const m of cls.members) {
      if (m.name && ts.isIdentifier(m.name) && m.name.text === name) {
        if (ts.isPropertyDeclaration(m) && m.initializer) return m.initializer;
        if (ts.isMethodDeclaration(m)) return m;
      }
    }
    return undefined;
  };

  const out: TracedResponse[] = [];
  const seen = new Set<string>();
  const visitMember = (name: string, depth: number): void => {
    if (seen.has(name) || depth > 3) return;
    seen.add(name);
    const body = findMember(name);
    if (!body) return;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (
          method === 'json' ||
          method === 'send' ||
          method === 'end' ||
          method === 'sendStatus' ||
          method === 'redirect'
        ) {
          const recv = node.expression.expression.getText();
          if (
            /^res\b/.test(recv) ||
            /\.status\(/.test(recv) ||
            /\.type\(/.test(recv) ||
            /^response\b/.test(recv)
          ) {
            const status =
              method === 'sendStatus' && ts.isNumericLiteral(node.arguments[0]!)
                ? Number(node.arguments[0].text)
                : method === 'redirect'
                  ? 302
                  : statusOf(node);
            const arg = node.arguments[0];
            if (method === 'json' && arg) {
              const schema = typeToSchema(checker, checker.getTypeAtLocation(arg), '', []);
              restoreLiterals(arg, schema);
              out.push({ status, schema, contentType: 'application/json' });
            } else if (method === 'send' && arg) {
              const ct = contentTypeOf(node) ?? 'text/html';
              out.push({ status, schema: { type: 'string' }, contentType: ct });
            } else {
              out.push({ status, contentType: 'application/json' });
            }
          }
        }
        if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword)
          visitMember(node.expression.name.text, depth + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  };
  visitMember(handler, 0);

  // Merge same-status bodies into a oneOf (deduplicated by JSON).
  const byStatus = new Map<string, TracedResponse[]>();
  for (const r of out)
    byStatus.set(`${r.status}|${r.contentType}`, [
      ...(byStatus.get(`${r.status}|${r.contentType}`) ?? []),
      r,
    ]);
  const merged: TracedResponse[] = [];
  for (const list of byStatus.values()) {
    const uniq = new Map<string, TracedResponse>();
    for (const r of list) uniq.set(JSON.stringify(r.schema ?? null), r);
    const items = [...uniq.values()];
    merged.push(
      items.length === 1
        ? items[0]!
        : {
            status: items[0]!.status,
            contentType: items[0]!.contentType,
            schema: { anyOf: items.map(i => i.schema ?? {}) },
          }
    );
  }
  return merged.sort((a, b) => a.status - b.status);
}
