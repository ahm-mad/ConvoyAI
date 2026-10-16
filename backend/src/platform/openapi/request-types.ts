import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';
import { load } from './response-types.js';

/**
 * Derives each route's accepted input from the controller: every
 * `parseOrThrow(SomeSchema, req.body | req.query | req.params)` names the Zod
 * schema that really validates that part of the request, and Zod's own
 * `toJSONSchema` turns it into the contract schema (including the Laravel-style
 * leniency the schemas implement: integer strings, `0`/`1` booleans, `""`->null).
 * So the documented request shape is the enforced one, not a parallel copy.
 */

export type Json = any;

export interface TracedRequest {
  body?: Json;
  query?: Json;
  params?: Json;
  /** The handler reads `req.body` / `req.query` without a schema. */
  unvalidatedBody?: boolean;
  unvalidatedQuery?: boolean;
  /** The handler reads an uploaded file (`req.file`). */
  usesFile?: boolean;
}

const SAFE = 9007199254740991;

/** Zod emits the safe-integer bounds for every `.int()`; they are noise in a contract. */
function clean(node: Json): Json {
  if (Array.isArray(node)) return node.map(clean);
  if (node && typeof node === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'minimum' && v === -SAFE) || (k === 'maximum' && v === SAFE)) continue;
      if (k === '$schema' || k === '$id') continue;
      if (k === 'pattern' && node['format'] === 'email') continue; // Zod's e-mail regex is noise next to `format: email`
      out[k] = clean(v);
    }
    return out;
  }
  return node;
}

const moduleCache = new Map<string, Record<string, unknown>>();
async function exportsOf(file: string): Promise<Record<string, unknown>> {
  let m = moduleCache.get(file);
  if (!m) {
    m = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    moduleCache.set(file, m);
  }
  return m;
}

function toJson(schema: unknown): Json | undefined {
  try {
    return clean(z.toJSONSchema(schema as z.ZodType, { io: 'input', unrepresentable: 'any' }));
  } catch {
    return undefined;
  }
}

export async function traceRequest(
  controllerClass: string,
  handler: string
): Promise<TracedRequest> {
  const { checker, classes } = load();
  const cls = classes.get(controllerClass);
  const result: TracedRequest = {};
  if (!cls) return result;

  const pending: { part: 'body' | 'query' | 'params'; file: string; name: string }[] = [];
  let sawBody = false;
  let sawQuery = false;
  const validated = new Set<string>();
  const seen = new Set<string>();

  const findMember = (name: string): ts.Node | undefined => {
    for (const m of cls.members) {
      if (m.name && ts.isIdentifier(m.name) && m.name.text === name) {
        if (ts.isPropertyDeclaration(m) && m.initializer) return m.initializer;
        if (ts.isMethodDeclaration(m)) return m;
      }
    }
    return undefined;
  };

  const partOf = (expr: ts.Expression): 'body' | 'query' | 'params' | undefined => {
    const text = expr.getText();
    if (/^req\.body\b/.test(text)) return 'body';
    if (/^req\.query\b/.test(text)) return 'query';
    if (/^req\.params\b/.test(text)) return 'params';
    return undefined;
  };

  const visitMember = (name: string, depth: number): void => {
    if (seen.has(name) || depth > 3) return;
    seen.add(name);
    const body = findMember(name);
    if (!body) return;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        // parseOrThrow(Schema, req.x)
        if (
          ts.isIdentifier(callee) &&
          callee.text === 'parseOrThrow' &&
          node.arguments.length >= 2
        ) {
          const part = partOf(node.arguments[1]!);
          const schemaArg = node.arguments[0]!;
          if (part && ts.isIdentifier(schemaArg)) {
            let sym = checker.getSymbolAtLocation(schemaArg);
            if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
            const decl = sym?.declarations?.[0];
            if (sym && decl) {
              pending.push({ part, file: decl.getSourceFile().fileName, name: sym.name });
              validated.add(part);
            }
          } else if (part) {
            validated.add(part); // inline schema — validated, shape not resolvable
          }
        }
        // this.helper(...)
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.expression.kind === ts.SyntaxKind.ThisKeyword
        )
          visitMember(callee.name.text, depth + 1);
      }
      if (ts.isPropertyAccessExpression(node)) {
        const t = node.getText();
        if (/^req\.body$/.test(t)) sawBody = true;
        if (/^req\.query$/.test(t)) sawQuery = true;
        if (/^req\.files?$/.test(t)) result.usesFile = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  };
  visitMember(handler, 0);

  for (const p of pending) {
    const schema = (await exportsOf(p.file))[p.name];
    const json = schema ? toJson(schema) : undefined;
    if (json) result[p.part] = result[p.part] ? { allOf: [result[p.part], json] } : json;
  }
  if (sawBody && !validated.has('body')) result.unvalidatedBody = true;
  if (sawQuery && !validated.has('query')) result.unvalidatedQuery = true;
  return result;
}
