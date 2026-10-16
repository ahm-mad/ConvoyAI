import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

/**
 * Password hashing (D-0006, ARCHITECTURE.md §5). argon2id for every new
 * hash. One-time legacy path: a bcrypt-looking stored hash (`$2a$`/
 * `$2b$`/`$2y$`) is verified with bcryptjs; the caller (module 1.2's
 * login flow) is responsible for re-hashing to argon2id and persisting
 * the new hash on a successful legacy verify — this module only does
 * the crypto, not the "and then save it" side effect.
 */
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export function isLegacyBcryptHash(hash: string): boolean {
  return BCRYPT_PREFIX.test(hash);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (isLegacyBcryptHash(hash)) {
    return bcrypt.compare(plain, hash);
  }
  return argon2.verify(hash, plain);
}
