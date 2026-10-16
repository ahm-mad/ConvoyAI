import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../src/platform/db/tenant-scoping.js';
import { applyTimestamps } from '../src/platform/db/timestamps.js';
import { runAsSystemAsync } from '../src/platform/http/request-context.js';
import { hashPassword } from '../src/platform/auth/password.js';
import { RbacRepository } from '../src/modules/rbac/rbac.repository.js';
import { SubscriptionsRepository } from '../src/modules/subscriptions/subscriptions.repository.js';
import { logger } from '../src/platform/logging/logger.js';

/**
 * Real Laravel seed data, ported after an explicit audit of every seeder
 * `database/seeders/DatabaseSeeder.php` actually runs (2026-09-17,
 * user-directed — "port both, use real values as-is"). Idempotent, safe
 * to re-run on both a fresh database and this project's own dev DB.
 *
 * Ported from `ProtocolSeeder.php` (the real protocol catalog — since D-0135 only `HTTPS` and `MQTT`,
 * user-directed; Laravel's 6 rows included LoRaWAN/BACnet/Modbus/OPC UA and named the second one `MQTTS`. MQTT
 * ingestion resolves its protocol id BY NAME, so without the `MQTT` row it cannot resolve one at all — a confirmed
 * live bug, not just a gap),
 * `PreconfigureTemplateSeeder.php` (5 real starter templates for the
 * "create product from template" flow), and `UserRolePermissionSeeder.php`
 * (a real "Default Company" + admin/manager/user roles + the real
 * `junead@chaminade-hs.org` seed user, confirmed to be a genuine existing
 * account via `reference/fixtures/json/users.json`, not fabricated here).
 *
 * Deliberately NOT ported:
 * - `PlanModuleSeeder.php`'s real Basic/Gold/Platinum plan→module mapping
 *   — the real mapping grants none of the three plans `fleet-management`
 *   at all. Module 5.1's placeholder plan (D-0085) already additively
 *   grants every module currently in the catalog instead — seeding
 *   `REAL_MODULES` here means that placeholder plan now covers all 8 real
 *   modules too, with no gap, once `seedPlaceholderPlan()` next runs in
 *   the bootstrap sequence.
 * - `SuperAdminSeeder.php` — already a deliberate, different, previously
 *   logged decision (D-0039/D-0088): a real company/email instead of
 *   Laravel's `company_id = 0` sentinel hack.
 *
 * D-0101 correction (2026-09-17, same day as D-0097): `REAL_MODULES`
 * below originally used `reference/fixtures/json/modules.json` (captured
 * 2026-08-19: dashboard/device-management/plan-management/module-
 * management/role-management/permission-management/member-management/
 * fleet-management) on the assumption that `PlanModuleSeeder.php`'s own
 * hardcoded list was stale. The user's real login against the live
 * Laravel app (2026-09-17) returned different permission names than this
 * seed produced — direct read-only verification against the live
 * Laravel MySQL database (`modules`/`permissions`/`plan_modules` tables)
 * confirmed `PlanModuleSeeder.php`'s list is the one that's actually live
 * today (product/dashboard/connect/building/fleet/alarms/role-permission/
 * rule-builder), not the fixture. The fixture snapshot was itself stale
 * (an earlier, since-superseded state of the app) — D-0097's own
 * "verify against the real fixture" reasoning was sound, the fixture
 * data it trusted was wrong. `REAL_MODULES` below now matches the live
 * database directly, and `reference/fixtures/json/modules.json`/
 * `permissions.json`/`plan_modules.json` were re-captured from the same
 * live query to correct the frozen reference.
 */

const REAL_PROTOCOLS: { name: string; category: 'transport' | 'device_protocol'; image: string }[] =
  [
    { name: 'HTTPS', category: 'transport', image: 'https.png' },
    { name: 'MQTT', category: 'transport', image: 'mqtts.png' },
  ];

/** `PlanModuleSeeder.php`'s module list — confirmed live-current directly against the real Laravel MySQL database (D-0101 corrects D-0097's own reliance on a stale fixture snapshot). */
const REAL_MODULES: { code: string; slug: string }[] = [
  { code: 'product', slug: 'product' },
  { code: 'dashboard', slug: 'dashboard' },
  { code: 'connect', slug: 'connect' },
  { code: 'building', slug: 'building' },
  { code: 'fleet', slug: 'fleet' },
  { code: 'alarms', slug: 'alarms' },
  { code: 'role-permission', slug: 'role-permission' },
  { code: 'rule-builder', slug: 'rule-builder' },
];

interface TemplateField {
  attribute_key: string;
  label: string;
  unit: string | null;
}

const REAL_TEMPLATES: {
  name: string;
  manufacturer: string;
  description: string;
  image: string;
  fields: TemplateField[];
}[] = [
  {
    name: 'Tektelic Room Sensor',
    manufacturer: 'Tektelic',
    description:
      'Indoor temperature, humidity, and battery monitoring — common LoRaWAN room sensor fields.',
    image: 'tektelic-room-sensor.png',
    fields: [
      { attribute_key: 'objectJSON.temperature', label: 'Temperature', unit: 'Cel' },
      { attribute_key: 'objectJSON.humidity', label: 'Humidity', unit: '%' },
      { attribute_key: 'objectJSON.battery_voltage', label: 'Battery Voltage', unit: 'V' },
    ],
  },
  {
    name: 'Tektelic Industrial Sensor',
    manufacturer: 'Tektelic',
    description:
      'Wider-range temperature and humidity monitoring for industrial/outdoor deployments.',
    image: 'tektelic-industrial-sensor.png',
    fields: [
      { attribute_key: 'objectJSON.temperature', label: 'Temperature', unit: 'Cel' },
      { attribute_key: 'objectJSON.humidity', label: 'Humidity', unit: '%' },
      { attribute_key: 'objectJSON.battery_voltage', label: 'Battery Voltage', unit: 'V' },
      { attribute_key: 'objectJSON.light_level', label: 'Light Level', unit: 'lux' },
    ],
  },
  {
    name: 'Sensative Strips Guard',
    manufacturer: 'Sensative',
    description:
      'Door/window contact, temperature, and tamper detection — common Sensative Strips fields.',
    image: 'sensative-strips-guard.png',
    fields: [
      { attribute_key: 'objectJSON.doorStatus', label: 'Door Status', unit: null },
      { attribute_key: 'objectJSON.temperature', label: 'Temperature', unit: 'Cel' },
      { attribute_key: 'objectJSON.tamperStatus', label: 'Tamper Status', unit: null },
      { attribute_key: 'objectJSON.batteryLevel', label: 'Battery Level', unit: '%' },
    ],
  },
  {
    name: 'Generic BACnet AHU Controller',
    manufacturer: 'Generic',
    description:
      'Common air handling unit points — discharge temperature, fan status, cooling setpoint.',
    image: 'generic-bacnet-ahu.png',
    fields: [
      { attribute_key: 'present_value', label: 'Discharge Temperature', unit: 'Cel' },
      { attribute_key: 'supply_fan_status', label: 'Supply Fan Status', unit: null },
      { attribute_key: 'cooling_setpoint', label: 'Cooling Setpoint', unit: 'Cel' },
    ],
  },
  {
    name: 'Generic GPS Fleet Tracker',
    manufacturer: 'Generic',
    description:
      'Vehicle/asset GPS tracking — position, speed, and heading. Works with most cellular or LoRaWAN GPS trackers that report these fields.',
    image: 'generic-gps-tracker.png',
    fields: [
      { attribute_key: 'latitude', label: 'Latitude', unit: null },
      { attribute_key: 'longitude', label: 'Longitude', unit: null },
      { attribute_key: 'speed', label: 'Speed', unit: 'km/h' },
      { attribute_key: 'heading', label: 'Heading', unit: 'deg' },
      { attribute_key: 'battery_voltage', label: 'Battery Voltage', unit: 'V' },
    ],
  },
];

const DEFAULT_COMPANY_NAME = 'Default Company';
const DEMO_USER = {
  email: 'junead@chaminade-hs.org',
  firstName: 'Nuzzi2',
  lastName: 'Developer2',
  number: '2343546786',
  timezone: 'Asia/Karachi',
  password: 'password123',
};

/** Exported so `bootstrap-db.ts` (Phase 7) can call this directly, bundled — see `apply-timescale-migrations.ts`'s doc comment for why this must not carry its own "am I the entrypoint" guard. Standalone CLI: `run-seed-demo-data.ts`. */
export async function seedDemoData(): Promise<void> {
  const rawPrisma = new PrismaClient();
  const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
  const rbac = new RbacRepository(prisma);
  const subscriptions = new SubscriptionsRepository(prisma);

  try {
    // -- Protocols (ProtocolSeeder.php) — `name` has no unique constraint, find-then-create matches Laravel's own firstOrCreate exactly. --
    for (const protocol of REAL_PROTOCOLS) {
      const existing = await prisma.protocols.findFirst({ where: { name: protocol.name } });
      if (!existing) {
        await prisma.protocols.create({ data: protocol });
      }
    }
    logger.info({ count: REAL_PROTOCOLS.length }, 'Real protocol catalog seeded/confirmed');

    // -- Preconfigure templates (PreconfigureTemplateSeeder.php) — global (company_id/created_by null), same find-then-create discipline. --
    for (const template of REAL_TEMPLATES) {
      const existing = await prisma.preconfigure_templates.findFirst({
        where: { name: template.name },
      });
      if (!existing) {
        await prisma.preconfigure_templates.create({
          data: {
            name: template.name,
            manufacturer: template.manufacturer,
            description: template.description,
            image: template.image,
            configuration: { fields: template.fields },
          },
        });
      }
    }
    logger.info({ count: REAL_TEMPLATES.length }, 'Real preconfigure templates seeded/confirmed');

    // -- Real module catalog (PlanModuleSeeder.php, confirmed live-current — D-0101) --
    for (const module_ of REAL_MODULES) {
      await prisma.modules.upsert({
        where: { slug: module_.slug },
        create: { code: module_.code, slug: module_.slug },
        update: { code: module_.code },
      });
    }
    logger.info({ count: REAL_MODULES.length }, 'Real module catalog seeded/confirmed');

    // -- Default Company + admin/manager/user roles + permissions (UserRolePermissionSeeder.php) --
    let company = await runAsSystemAsync(() =>
      rawPrisma.companies.findFirst({ where: { name: DEFAULT_COMPANY_NAME } })
    );
    if (!company) {
      company = await runAsSystemAsync(() =>
        rawPrisma.companies.create({ data: { name: DEFAULT_COMPANY_NAME } })
      );
    }
    const companyId = company.id.toString();

    await rbac.bootstrapCompany(companyId);
    await rbac.grantModulePermissionsToBootstrapRoles(
      companyId,
      REAL_MODULES.map(m => m.slug)
    );
    logger.info(
      { companyId },
      'Default Company + admin/manager/user roles + real module permissions seeded/confirmed'
    );

    // D-0134: the demo user has a publicly known password (`password123`, Laravel's own seed) and is an admin of the Default
    // Company — fine on a laptop or a throwaway staging box, a backdoor on a real server. `SEED_DEMO_USER=false` skips ONLY
    // this user (the protocol/module/template catalogs above are real data the app needs and are always seeded).
    if (process.env['SEED_DEMO_USER'] === 'false') {
      logger.info(
        'SEED_DEMO_USER=false — demo user not created (catalogs and default company seeded)'
      );
      return;
    }

    // -- Demo seed user (UserRolePermissionSeeder.php's $defaultUser) --
    const existingUser = await runAsSystemAsync(() =>
      rawPrisma.users.findUnique({ where: { email: DEMO_USER.email } })
    );
    let userId: string;
    if (existingUser) {
      userId = existingUser.id.toString();
      logger.info({ email: DEMO_USER.email }, 'Demo user already exists — password left untouched');
    } else {
      const passwordHash = await hashPassword(DEMO_USER.password);
      const created = await runAsSystemAsync(() =>
        rawPrisma.users.create({
          data: {
            first_name: DEMO_USER.firstName,
            last_name: DEMO_USER.lastName,
            email: DEMO_USER.email,
            number: DEMO_USER.number,
            timezone: DEMO_USER.timezone,
            password: passwordHash,
            status: 'active',
            company_id: BigInt(companyId),
            email_verified_at: new Date(),
          },
        })
      );
      userId = created.id.toString();
      logger.info(
        { email: DEMO_USER.email, password: DEMO_USER.password },
        'Demo user created with the real Laravel seed password (this is what UserRolePermissionSeeder.php also uses — not a generated secret)'
      );
    }

    const adminRoleId = await rbac.findRoleIdByCompanyAndName(companyId, 'admin');
    if (adminRoleId) {
      await rbac.assignRoleToUser(userId, adminRoleId);
    }

    const activeSubscription = await runAsSystemAsync(() =>
      subscriptions.findActiveForUser(userId)
    );
    if (!activeSubscription) {
      await runAsSystemAsync(() => subscriptions.createPlaceholder(userId));
    }

    logger.info(
      { email: DEMO_USER.email, userId, companyId, role: 'admin' },
      'Demo data seed complete'
    );
  } finally {
    await rawPrisma.$disconnect();
  }
}
