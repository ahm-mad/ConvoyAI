import { z } from "zod";
import "../src/platform/http/app.js";
import * as assets from "../src/modules/assets/assets.schemas.js";
import * as rules from "../src/modules/rules/rules.schemas.js";
const opts = { io: "input", unrepresentable: "any" } as const;
for (const [n, s] of Object.entries({ ...assets, ...rules })) {
  if (!/Request|Query|Input/.test(n) || typeof (s as any)?.parse !== "function") continue;
  try { console.log(n, JSON.stringify(z.toJSONSchema(s as any, opts)).slice(0, 400)); } catch (e) { console.log(n, "ERR", (e as Error).message.slice(0, 100)); }
}
