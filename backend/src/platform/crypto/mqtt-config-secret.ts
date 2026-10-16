import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';

/**
 * At-rest encryption for module 6.5's `mqtt_configurations.username`/
 * `.password` (D-0117) — matches Laravel's own model-level `encrypted`
 * cast on those columns. Same AES-256-GCM envelope shape as
 * `ingestion-token.ts` (random 12-byte IV, auth tag stored alongside the
 * ciphertext, not derived from the plaintext), with its own dedicated
 * secret (`MQTT_CONFIG_ENCRYPTION_SECRET`) — not reused from JWT or the
 * ingestion-token secret, same "distinct secret per purpose" precedent.
 */
function deriveKey(): Buffer {
  return createHash('sha256').update(config.MQTT_CONFIG_ENCRYPTION_SECRET).digest();
}

export function encryptMqttConfigSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const envelope = {
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

export function decryptMqttConfigSecret(ciphertext: string): string {
  const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
  const envelope = JSON.parse(decoded) as { iv: string; data: string; tag: string };
  const key = deriveKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
