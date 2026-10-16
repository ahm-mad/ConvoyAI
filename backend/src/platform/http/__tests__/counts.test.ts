import { describe, expect, it } from 'vitest';
import { statusCounts } from '../counts.js';

describe('statusCounts (D-0179, B7)', () => {
  it('lists every status (0 when empty), sums the total, and ignores nothing that is known', () => {
    expect(
      statusCounts(
        ['planned', 'in_progress', 'completed', 'cancelled'],
        [
          { status: 'completed', count: 31 },
          { status: 'planned', count: 4 },
        ]
      )
    ).toEqual({
      total: 35,
      by_status: { planned: 4, in_progress: 0, completed: 31, cancelled: 0 },
    });
  });

  it('an empty result is all zeros; an unexpected status from the database still counts (never silently dropped)', () => {
    expect(statusCounts(['active', 'inactive'], [])).toEqual({
      total: 0,
      by_status: { active: 0, inactive: 0 },
    });
    expect(statusCounts(['active'], [{ status: 'weird', count: 2 }])).toEqual({
      total: 2,
      by_status: { active: 0, weird: 2 },
    });
  });
});
