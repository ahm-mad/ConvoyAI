import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { ValidationError } from '../errors/app-error.js';

/**
 * Ingestion-token crypto (module 2.1's `get-encrypt-token`, D-0047).
 * Hardened replacement for Laravel's `get_encrypt_token`/`decrypt_token`
 * (`migration/reference/deep-dives/ingestion-token-crypto.md` §1.2/§1.4):
 * AES-256-GCM (integrity built in, replaces the old scheme's no-op `hash`
 * field) with a random 12-byte IV per token, stored alongside the
 * ciphertext and auth tag — not derived from the plaintext. Same intent
 * (a symmetric token binding user+product+protocol), same indefinite
 * lifetime (D-0047 — no expiry/revocation model), incompatible byte
 * format (expected and accepted; devices get reconfigured with new
 * tokens as part of onboarding onto the new backend regardless).
 */
export interface IngestionTokenPayload {
  userId: string;
  productId: string;
  protocolId: string;
}

function deriveKey(): Buffer {
  // The full 32-byte SHA-256 digest, used directly as the AES-256 key —
  // unlike Laravel's `substr(hash(...), 0, 32)`, which takes 32 *hex
  // characters* (16 bytes of real entropy) as if they were raw key bytes.
  // A dedicated secret (INGESTION_TOKEN_SECRET), not reused from JWT.
  return createHash('sha256').update(config.INGESTION_TOKEN_SECRET).digest();
}

export function signIngestionToken(payload: IngestionTokenPayload): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = {
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

export function verifyIngestionToken(token: string): IngestionTokenPayload {
  let envelope: { iv: string; data: string; tag: string };
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    envelope = JSON.parse(decoded) as { iv: string; data: string; tag: string };
    if (
      typeof envelope.iv !== 'string' ||
      typeof envelope.data !== 'string' ||
      typeof envelope.tag !== 'string'
    ) {
      throw new Error('malformed envelope');
    }
  } catch {
    throw new ValidationError('Invalid token structure.');
  }

  try {
    const key = deriveKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    const payload = JSON.parse(decrypted.toString('utf8')) as IngestionTokenPayload;
    if (!payload.userId || !payload.productId || !payload.protocolId) {
      throw new Error('incomplete payload');
    }
    return payload;
  } catch {
    // GCM's own auth-tag check throws on any tampering — same "fail
    // closed on corruption" behavior the old scheme had in practice, now
    // guaranteed by the cipher mode instead of an unchecked side field.
    throw new ValidationError('Invalid or tampered token.');
  }
}
