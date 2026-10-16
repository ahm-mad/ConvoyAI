import { describe, expect, it } from 'vitest';
import { signIngestionToken, verifyIngestionToken } from '../ingestion-token.js';

const PAYLOAD = { userId: '1', productId: '2', protocolId: '3' };

describe('ingestion-token crypto (D-0047)', () => {
  it('round-trips: sign then verify recovers the exact payload', () => {
    const token = signIngestionToken(PAYLOAD);

    expect(verifyIngestionToken(token)).toEqual(PAYLOAD);
  });

  it("two tokens for the same payload are different (random IV, unlike Laravel's deterministic scheme)", () => {
    const a = signIngestionToken(PAYLOAD);
    const b = signIngestionToken(PAYLOAD);

    expect(a).not.toBe(b);
    expect(verifyIngestionToken(a)).toEqual(PAYLOAD);
    expect(verifyIngestionToken(b)).toEqual(PAYLOAD);
  });

  it('rejects a tampered token (GCM auth tag fails closed)', () => {
    const token = signIngestionToken(PAYLOAD);
    const envelope = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as { data: string };
    envelope.data = Buffer.from('tampered-ciphertext').toString('base64');
    const tampered = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

    expect(() => verifyIngestionToken(tampered)).toThrow();
  });

  it('rejects garbage input', () => {
    expect(() => verifyIngestionToken('not-a-real-token')).toThrow();
  });
});
