import { describe, expect, it } from 'vitest';
import { canRetrigger } from '../rule-cooldown.js';

const NOW = new Date('2026-09-15T12:00:00Z');

describe('canRetrigger (11.2a — one implementation, no raw SQL interval)', () => {
  it('never triggered before -> always allowed', () => {
    expect(
      canRetrigger({ allowRetriggering: false, lastTriggered: null, executionInterval: 60 }, NOW)
    ).toBe(true);
    expect(
      canRetrigger({ allowRetriggering: true, lastTriggered: null, executionInterval: 60 }, NOW)
    ).toBe(true);
  });

  it('retriggering off + already triggered once -> never again', () => {
    const lastTriggered = new Date(NOW.getTime() - 1000 * 60 * 60 * 24 * 365); // a year ago
    expect(
      canRetrigger({ allowRetriggering: false, lastTriggered, executionInterval: 60 }, NOW)
    ).toBe(false);
  });

  it('retriggering on, still within the cooldown interval -> not allowed yet', () => {
    const lastTriggered = new Date(NOW.getTime() - 30_000); // 30s ago
    expect(
      canRetrigger({ allowRetriggering: true, lastTriggered, executionInterval: 60 }, NOW)
    ).toBe(false);
  });

  it('retriggering on, cooldown interval has elapsed -> allowed', () => {
    const lastTriggered = new Date(NOW.getTime() - 61_000); // 61s ago
    expect(
      canRetrigger({ allowRetriggering: true, lastTriggered, executionInterval: 60 }, NOW)
    ).toBe(true);
  });

  it('retriggering on, exactly at the boundary -> allowed (>=, not >)', () => {
    const lastTriggered = new Date(NOW.getTime() - 60_000);
    expect(
      canRetrigger({ allowRetriggering: true, lastTriggered, executionInterval: 60 }, NOW)
    ).toBe(true);
  });

  it('null executionInterval treated as 0-second cooldown', () => {
    const lastTriggered = new Date(NOW.getTime() - 1);
    expect(
      canRetrigger({ allowRetriggering: true, lastTriggered, executionInterval: null }, NOW)
    ).toBe(true);
  });
});
