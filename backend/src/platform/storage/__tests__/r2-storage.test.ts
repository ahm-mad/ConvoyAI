import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET_NAME: undefined,
    R2_PUBLIC_URL: undefined,
  },
}));

import { config } from '../../config/index.js';
import { deleteObject, keyFromUrl, uploadObject } from '../r2-storage.js';

describe('r2-storage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  afterEach(() => {
    config.R2_ACCOUNT_ID = undefined;
    config.R2_ACCESS_KEY_ID = undefined;
    config.R2_SECRET_ACCESS_KEY = undefined;
    config.R2_BUCKET_NAME = undefined;
    config.R2_PUBLIC_URL = undefined;
  });

  it('uploadObject throws a clear UpstreamError when R2 is not configured', async () => {
    await expect(
      uploadObject({
        prefix: 'profile-images',
        buffer: Buffer.from('x'),
        contentType: 'image/png',
        extension: 'png',
      })
    ).rejects.toMatchObject({ httpStatus: 502 });
  });

  it('uploadObject sends a PutObjectCommand and returns a public URL under a random key', async () => {
    config.R2_ACCOUNT_ID = 'acct';
    config.R2_ACCESS_KEY_ID = 'key';
    config.R2_SECRET_ACCESS_KEY = 'secret';
    config.R2_BUCKET_NAME = 'bucket';
    config.R2_PUBLIC_URL = 'https://images.example.com/';

    const result = await uploadObject({
      prefix: 'profile-images',
      buffer: Buffer.from('x'),
      contentType: 'image/png',
      extension: 'png',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.key).toMatch(/^profile-images\/[0-9a-f-]+\.png$/);
    expect(result.url).toBe(`https://images.example.com/${result.key}`);
  });

  it('deleteObject sends a DeleteObjectCommand', async () => {
    config.R2_ACCOUNT_ID = 'acct';
    config.R2_ACCESS_KEY_ID = 'key';
    config.R2_SECRET_ACCESS_KEY = 'secret';
    config.R2_BUCKET_NAME = 'bucket';

    await deleteObject('profile-images/some-key.png');

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('keyFromUrl extracts the key from a previously-returned public URL', () => {
    config.R2_PUBLIC_URL = 'https://images.example.com';

    expect(keyFromUrl('https://images.example.com/profile-images/abc.png')).toBe(
      'profile-images/abc.png'
    );
    expect(keyFromUrl('https://other-host.example.com/x.png')).toBeUndefined();
  });

  it("keyFromUrl returns undefined when R2_PUBLIC_URL isn't configured", () => {
    expect(keyFromUrl('https://images.example.com/profile-images/abc.png')).toBeUndefined();
  });
});
