import { describe, expect, it } from 'vitest';
import { decryptMqttConfigSecret, encryptMqttConfigSecret } from '../mqtt-config-secret.js';

describe('mqtt-config-secret crypto (D-0117)', () => {
  it('round-trips: encrypt then decrypt recovers the exact plaintext', () => {
    const ciphertext = encryptMqttConfigSecret('broker-password-123');

    expect(decryptMqttConfigSecret(ciphertext)).toBe('broker-password-123');
  });

  it('two encryptions of the same plaintext are different (random IV)', () => {
    const a = encryptMqttConfigSecret('same-value');
    const b = encryptMqttConfigSecret('same-value');

    expect(a).not.toBe(b);
    expect(decryptMqttConfigSecret(a)).toBe('same-value');
    expect(decryptMqttConfigSecret(b)).toBe('same-value');
  });

  it('rejects a tampered ciphertext (GCM auth tag fails closed)', () => {
    const ciphertext = encryptMqttConfigSecret('secret');
    const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8')) as {
      data: string;
    };
    envelope.data = Buffer.from('tampered-ciphertext').toString('base64');
    const tampered = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

    expect(() => decryptMqttConfigSecret(tampered)).toThrow();
  });
});
