import { listMountedRoutes } from "../src/platform/openapi/route-introspection.js";
import { traceRequest } from "../src/platform/openapi/request-types.js";
const r = listMountedRoutes();
let none = 0; const ub: string[] = [], uq: string[] = [], nob: string[] = [];
for (const x of r) {
  if (!x.handler) continue;
  const t = await traceRequest(x.handler.controller, x.handler.method);
  if (t.unvalidatedBody) ub.push(`${x.method} ${x.path}`);
  if (t.unvalidatedQuery) uq.push(`${x.method} ${x.path}`);
  if (["post","put","patch"].includes(x.method) && !t.body && !t.usesFile) nob.push(`${x.method} ${x.path}`);
}
console.log("unvalidated body:", ub, "\nunvalidated query:", uq, "\nwrite w/o body schema:", nob);
