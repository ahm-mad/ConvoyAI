import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readContract } from '../src/platform/openapi/contract-file.js';

/**
 * `npm run openapi:conformance` — live check of the contract against a RUNNING server.
 *
 * Logs in, calls every GET operation that can be called without creating data (path ids are discovered from
 * list endpoints), and validates each real 200 response against its schema in the contract (the index at
 * backend_frontend_sync/api_contract/openapi.yaml plus every module file under api_contract/openapi/, D-0140/D-0141).
 * A mismatch means the contract (or the server) is wrong. Read-only: no POST/PUT/PATCH/DELETE is ever sent.
 *
 *   CONFORMANCE_BASE=http://localhost:8080/api CONFORMANCE_EMAIL=… CONFORMANCE_PASSWORD=… npm run openapi:conformance
 */
const BASE = process.env['CONFORMANCE_BASE'] ?? 'http://localhost:8080/api';
const EMAIL = process.env['CONFORMANCE_EMAIL'];
const PASSWORD = process.env['CONFORMANCE_PASSWORD'];
if (!EMAIL || !PASSWORD) {
  console.error(
    'Set CONFORMANCE_EMAIL and CONFORMANCE_PASSWORD (a company admin on the target server).'
  );
  process.exit(2);
}

const spec = readContract() as any;
const login = (await (
  await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
).json()) as { token?: string };
if (!login.token) {
  console.error('Login failed — cannot run the conformance check.');
  process.exit(2);
}
const headers = { authorization: `Bearer ${login.token}` };

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: undefined };
  }
}

function idsIn(body: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const it of v)
        if (it && typeof it === 'object' && 'id' in it)
          out.push(Number((it as { id: unknown }).id));
      v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(body);
  return out;
}

// path parameter -> list endpoint that yields ids for it
const SOURCE: Record<string, string> = {
  product: '/products',
  product_id: '/products',
  company_id: '/companies',
  companyId: '/companies',
  user: '/members',
  userId: '/members',
  rule: '/rules',
  vehicleId: '/vehicles',
  driverId: '/drivers',
  tripId: '/trips',
  yardId: '/yards',
  roleId: '/roles/company',
  widget: '/widgets',
  widgetSetting: '/widget-settings',
  plan: '/plans',
  protocol: '/protocols',
  assetId: '/assets',
  asset: '/assets',
};
const BY_PREFIX: Record<string, string> = {
  assets: '/assets',
  companies: '/companies',
  contact: '/contact',
  dashboards: '/dashboards',
  drivers: '/drivers',
  geofences: '/geofences',
  members: '/members',
  'mqtt-configurations': '/mqtt-configurations',
  notifications: '/notifications',
  'preconfigure-templates': '/preconfigure-templates',
  rules: '/rules',
  trips: '/trips',
  vehicles: '/vehicles',
  yards: '/yards',
  'fleet-customers': '/fleet-customers',
  alarms: '/alarms',
};
const cache = new Map<string, number[]>();
async function idsFrom(list: string): Promise<number[]> {
  if (!cache.has(list)) {
    const r = await get(list);
    cache.set(list, r.status === 200 ? idsIn(r.body) : []);
  }
  return cache.get(list)!;
}

const ajv = new (Ajv2020 as any).default({ strict: false });
(addFormats as any).default(ajv);
ajv.addSchema({ $id: 'spec', components: spec.components });

let ok = 0;
let bad = 0;
let skipped = 0;
let notOk = 0;
for (const [path, item] of Object.entries<any>(spec.paths)) {
  const op = item.get;
  if (!op || (op['x-auth'] === 'public' && path.startsWith('/auth/'))) continue;
  let concrete: string | undefined = path;
  for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!)) {
    const list = name === 'id' ? BY_PREFIX[path.split('/')[1]!] : SOURCE[name];
    const id = list ? (await idsFrom(list))[0] : undefined;
    if (id === undefined) {
      concrete = undefined;
      break;
    }
    concrete = concrete!.replace(`{${name}}`, String(id));
  }
  if (!concrete) {
    skipped++;
    continue;
  }
  const res = await get(concrete);
  if (res.status !== 200) {
    notOk++;
    console.log(`  ${res.status} GET ${path} (not validated: not a 200 for this account/data)`);
    continue;
  }
  const schema = op.responses?.['200']?.content?.['application/json']?.schema;
  if (!schema) {
    skipped++;
    continue;
  }
  const validate = ajv.compile(
    JSON.parse(JSON.stringify(schema).replaceAll('#/components/', 'spec#/components/'))
  );
  if (validate(res.body)) ok++;
  else {
    bad++;
    console.log(`  MISMATCH GET ${path}: ${JSON.stringify(validate.errors?.[0])}`);
  }
}
console.log(
  `openapi:conformance — ${ok} responses match the contract, ${bad} mismatch, ${notOk} not a 200, ${skipped} skipped (no id/schema)`
);
process.exit(bad ? 1 : 0);
