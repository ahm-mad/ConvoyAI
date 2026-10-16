import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { UpstreamError } from '../errors/app-error.js';

/**
 * Cloudflare R2 (S3-compatible) object storage — module 1.4's profile-image
 * uploads (D-0044). `R2_*` are optional in `env.schema.ts`, same
 * graceful-degradation pattern as `platform/mail/mailer.ts`'s SMTP handling
 * — a dev/CI environment without them configured doesn't fail at boot, but
 * an actual upload attempt throws a clear error rather than silently
 * no-op'ing (unlike email, there's no sensible "log it instead" fallback
 * for a file the caller expects to be stored and served back).
 */
let client: S3Client | undefined;

function getClient(): S3Client {
  if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
    throw new UpstreamError('Object storage is not configured (R2_* env vars missing).');
  }
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

function requireBucket(): string {
  if (!config.R2_BUCKET_NAME) {
    throw new UpstreamError('Object storage is not configured (R2_BUCKET_NAME missing).');
  }
  return config.R2_BUCKET_NAME;
}

function requirePublicUrl(): string {
  if (!config.R2_PUBLIC_URL) {
    throw new UpstreamError('Object storage is not configured (R2_PUBLIC_URL missing).');
  }
  return config.R2_PUBLIC_URL;
}

/**
 * Uploads a buffer under `${prefix}/${randomUUID()}.${extension}` and
 * returns its public URL. The random key (not the original filename)
 * avoids collisions and never leaks the caller's local filename.
 */
export async function uploadObject(params: {
  prefix: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
}): Promise<{ key: string; url: string }> {
  const bucket = requireBucket();
  const publicUrl = requirePublicUrl();
  const key = `${params.prefix}/${randomUUID()}.${params.extension}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return { key, url: `${publicUrl.replace(/\/$/, '')}/${key}` };
}

/** Idempotent — deleting a key that doesn't exist is not an error (matches Laravel's `Storage::exists()` + `delete()` pattern's effective behavior). */
export async function deleteObject(key: string): Promise<void> {
  const bucket = requireBucket();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Recovers the object key from a previously-returned public URL, for deleting an old image before uploading a new one. */
export function keyFromUrl(url: string): string | undefined {
  if (!config.R2_PUBLIC_URL) {
    return undefined;
  }
  const prefix = `${config.R2_PUBLIC_URL.replace(/\/$/, '')}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : undefined;
}
