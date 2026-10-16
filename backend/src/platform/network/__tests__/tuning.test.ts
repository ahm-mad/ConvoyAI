import net from 'node:net';
import { describe, expect, it } from 'vitest';
import '../tuning.js';

describe('network tuning (D-0133)', () => {
  it("raises Node's 250 ms per-address connect-attempt timeout so slow links don't fail with ETIMEDOUT", () => {
    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(5000);
  });
});
