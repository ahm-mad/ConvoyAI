import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../src/platform/db/tenant-scoping.js';
import { applyTimestamps } from '../src/platform/db/timestamps.js';
import { runAsSystemAsync } from '../src/platform/http/request-context.js';
import { hashPassword } from '../src/platform/auth/password.js';
import { RbacRepository } from '../src/modules/rbac/rbac.repository.js';
import { RESERVED_ROLE_NAME } from '../src/modules/rbac/rbac.types.js';
import { logger } from '../src/platform/logging/logger.js';

/**
 * D-0039's still-open item: a seed script granting the reserved
 * `platform_operator` role to a real account, so `companies` CRUD (and
 * anything else gated the same way) is reachable in a real deployment.
 * Never creatable through the public roles-CRUD API by design — this
 * script is the only path that ever mints this role.
 *
 * Idempotent, but deliberately NOT destructive on re-run: if the account
 * already exists, its password is left untouched (re-running this script
 * must never silently rotate a real credential) — only the role
 * assignment is (re-)ensured.
 */
const EMAIL = 'superadmin@example.com';
const PLATFORM_COMPANY_NAME = 'ConvoyAI Platform';

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Exported so `bootstrap-db.ts` (Phase 7) can call this directly, bundled.
 * Deliberately has **no top-level side effect of its own** (D-0095) — see
 * `apply-timescale-migrations.ts`'s own doc comment for why a "run
 * standalone" guard here would silently misfire once tsup bundles this
 * into `dist/bootstrap-db.js` alongside other scripts. The standalone CLI
 * entrypoint (`run-seed-platform-operator.ts`, `npm run
 * db:seed-platform-operator`) is a separate, tiny file instead.
 */
export async function seedPlatformOperator(): Promise<void> {
  const rawPrisma = new PrismaClient();
  const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
  const rbac = new RbacRepository(prisma);

  try {
    const company =
      (await rbac.findByName(PLATFORM_COMPANY_NAME)) ??
      (await rbac.createMinimal(PLATFORM_COMPANY_NAME, EMAIL));

    const roleId = await runAsSystemAsync(async () => {
      const role = await rawPrisma.roles.upsert({
        where: {
          company_id_guard_name_name: {
            company_id: BigInt(company.id),
            guard_name: 'api',
            name: RESERVED_ROLE_NAME,
          },
        },
        create: {
          company_id: BigInt(company.id),
          name: RESERVED_ROLE_NAME,
          guard_name: 'api',
          created_at: new Date(),
          updated_at: new Date(),
        },
        update: {},
      });
      return role.id.toString();
    });

    const existingUser = await runAsSystemAsync(() =>
      rawPrisma.users.findUnique({ where: { email: EMAIL } })
    );

    let userId: string;
    let generatedPassword: string | undefined;
    if (existingUser) {
      userId = existingUser.id.toString();
      logger.info({ email: EMAIL }, 'Account already exists — password left untouched');
    } else {
      generatedPassword = generatePassword();
      const passwordHash = await hashPassword(generatedPassword);
      const created = await runAsSystemAsync(() =>
        rawPrisma.users.create({
          data: {
            first_name: 'Super',
            last_name: 'Admin',
            email: EMAIL,
            number: '0000000000',
            password: passwordHash,
            status: 'active',
            company_id: BigInt(company.id),
            email_verified_at: new Date(),
          },
        })
      );
      userId = created.id.toString();
    }

    await rbac.assignRoleToUser(userId, roleId);

    logger.info(
      { email: EMAIL, userId, companyId: company.id, roleId },
      'platform_operator seeded/confirmed'
    );
    if (generatedPassword) {
      // Logged once, deliberately as its own line — this is the only time this password is ever shown or stored in plaintext.
      logger.info(
        { email: EMAIL, password: generatedPassword },
        'Generated password — save this now, it is not shown again'
      );
    }
  } finally {
    await rawPrisma.$disconnect();
  }
}
