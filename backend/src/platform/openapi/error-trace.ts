import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Static (AST-only, no type-checking, nothing is executed) trace of every
 * error an HTTP route can raise: route file -> controller handler -> the
 * service/repository methods it calls (followed transitively through
 * `this.<field>.<method>()` and `this.<helper>()`) -> `throw new XError("literal")`.
 *
 * It exists so the OpenAPI contract's error responses carry the *literal*
 * messages the frontend will see, derived from the code and re-derived on
 * every `openapi:check` — a hand-written list would rot.
 */

export type ErrorKind =
  | 'NotFound'
  | 'Validation'
  | 'Forbidden'
  | 'Unauthenticated'
  | 'Conflict'
  | 'Upstream'
  | 'Internal'
  | 'Response';

export interface TracedError {
  status: number;
  /** Literal message, or a `{placeholder}` pattern for template strings, or `<dynamic>`. */
  message: string;
  /** `success` value in a hand-built error body (`res.status(404).json({ success: true, … })` parity quirks). */
  success?: boolean;
  /** Where it is raised (`file:line`, relative to `src/`). */
  source: string;
}

const STATUS: Record<string, number> = {
  NotFoundError: 404,
  ValidationError: 422,
  ForbiddenError: 403,
  UnauthenticatedError: 401,
  ConflictError: 409,
  UpstreamError: 502,
};
const DEFAULT_MESSAGE: Record<string, string> = {
  NotFoundError: 'Resource not found',
  ValidationError: 'Validation failed',
  ForbiddenError: 'Forbidden',
  UnauthenticatedError: 'Authentication required',
  ConflictError: 'Conflict',
  UpstreamError: 'Upstream service error',
};

const SRC = resolve(import.meta.dirname, '../..');

interface ClassInfo {
  name: string;
  file: string;
  sf: ts.SourceFile;
  /** `this.<field>` -> class name, from constructor parameter properties and typed fields. */
  fields: Map<string, string>;
  methods: Map<string, ts.Node>;
}

let classIndex: Map<string, ClassInfo> | undefined;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts')
    )
      out.push(full);
  }
  return out;
}

function typeName(node: ts.TypeNode | undefined): string | undefined {
  if (node && ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName))
    return node.typeName.text;
  return undefined;
}

function buildIndex(): Map<string, ClassInfo> {
  if (classIndex) return classIndex;
  classIndex = new Map();
  for (const file of walkFiles(join(SRC, 'modules')).concat(
    walkFiles(join(SRC, 'platform')),
    walkFiles(join(SRC, 'shared'))
  )) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    sf.forEachChild(function visit(node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const info: ClassInfo = {
          name: node.name.text,
          file,
          sf,
          fields: new Map(),
          methods: new Map(),
        };
        for (const member of node.members) {
          if (ts.isConstructorDeclaration(member)) {
            for (const p of member.parameters) {
              const t = typeName(p.type);
              if (t && ts.isIdentifier(p.name)) info.fields.set(p.name.text, t);
            }
          } else if (
            ts.isPropertyDeclaration(member) &&
            member.name &&
            ts.isIdentifier(member.name)
          ) {
            const t = typeName(member.type);
            if (t) info.fields.set(member.name.text, t);
            if (
              member.initializer &&
              (ts.isArrowFunction(member.initializer) ||
                ts.isFunctionExpression(member.initializer))
            ) {
              info.methods.set(member.name.text, member.initializer);
            }
          } else if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
            info.methods.set(member.name.text, member);
          }
        }
        classIndex!.set(info.name, info);
      }
      ts.forEachChild(node, visit);
    });
  }
  return classIndex;
}

function messageOf(arg: ts.Expression | undefined, fallback: string): string {
  if (!arg) return fallback;
  if (ts.isStringLiteralLike(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return (
      arg.head.text +
      arg.templateSpans
        .map(s => `{${s.expression.getText().replace(/^.*\./, '')}}` + s.literal.text)
        .join('')
    );
  }
  return '<dynamic>';
}

function rel(file: string, node: ts.Node, sf: ts.SourceFile): string {
  return `${file.slice(SRC.length + 1)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

/** Errors raised inside one method body, following calls into other classes. */
function collect(
  cls: ClassInfo,
  method: string,
  seen: Set<string>,
  out: TracedError[],
  depth = 0
): void {
  const key = `${cls.name}.${method}`;
  if (seen.has(key) || depth > 8) return;
  seen.add(key);
  const body = cls.methods.get(method);
  if (!body) return;

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const cn = node.expression.text;
      if (cn in STATUS) {
        out.push({
          status: STATUS[cn]!,
          message: messageOf(node.arguments?.[0], DEFAULT_MESSAGE[cn]!),
          source: rel(cls.file, node, cls.sf),
        });
      } else if (cn === 'AppError') {
        // new AppError({ code, httpStatus, message })
        const obj = node.arguments?.[0];
        if (obj && ts.isObjectLiteralExpression(obj)) {
          let status = 500;
          let message = '<dynamic>';
          for (const p of obj.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
              if (p.name.text === 'httpStatus' && ts.isNumericLiteral(p.initializer))
                status = Number(p.initializer.text);
              if (p.name.text === 'message') message = messageOf(p.initializer, '<dynamic>');
            }
          }
          out.push({ status, message, source: rel(cls.file, node, cls.sf) });
        }
      }
    }
    // res.status(N).json({ ... message: "..." }) with N >= 400, or `success: false` bodies
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'json'
    ) {
      const inner = node.expression.expression;
      if (
        ts.isCallExpression(inner) &&
        ts.isPropertyAccessExpression(inner.expression) &&
        inner.expression.name.text === 'status'
      ) {
        const st = inner.arguments[0];
        const obj = node.arguments[0];
        if (
          st &&
          ts.isNumericLiteral(st) &&
          Number(st.text) >= 400 &&
          obj &&
          ts.isObjectLiteralExpression(obj)
        ) {
          const prop = (n: string) =>
            obj.properties.find(
              p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === n
            ) as ts.PropertyAssignment | undefined;
          const succ = prop('success')?.initializer;
          out.push({
            status: Number(st.text),
            message: messageOf(prop('message')?.initializer, '<dynamic>'),
            ...(succ?.kind === ts.SyntaxKind.TrueKeyword ? { success: true } : {}),
            source: rel(cls.file, node, cls.sf),
          });
        }
      }
    }
    // this.<helper>(...) and this.<field>.<method>(...)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
        collect(cls, callee.name.text, seen, out, depth + 1);
      } else if (
        ts.isPropertyAccessExpression(callee.expression) &&
        callee.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        const target = cls.fields.get(callee.expression.name.text);
        const targetCls = target ? buildIndex().get(target) : undefined;
        if (targetCls) collect(targetCls, callee.name.text, seen, out, depth + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
}

/** All errors a controller handler can raise (through the service layer). */
export function traceHandler(controllerClass: string, handler: string): TracedError[] {
  const cls = buildIndex().get(controllerClass);
  if (!cls) return [];
  const out: TracedError[] = [];
  collect(cls, handler, new Set(), out);
  const dedup = new Map<string, TracedError>();
  for (const e of out)
    dedup.set(`${e.status}|${e.message}`, dedup.get(`${e.status}|${e.message}`) ?? e);
  return [...dedup.values()].sort(
    (a, b) => a.status - b.status || a.message.localeCompare(b.message)
  );
}
