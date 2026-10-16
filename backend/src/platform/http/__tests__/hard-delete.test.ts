import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors/app-error.js';
import { assertNeverUsed, joinLabels } from '../hard-delete.js';

describe('joinLabels / assertNeverUsed (D-0178, C14)', () => {
  it('reads naturally for one, two and many blockers', () => {
    expect(joinLabels(['trips'])).toBe('trips');
    expect(joinLabels(['trips', 'fuel logs'])).toBe('trips and fuel logs');
    expect(joinLabels(['trips', 'fuel logs', 'incidents'])).toBe('trips, fuel logs and incidents');
  });

  it('passes when nothing references the record, otherwise a 422 naming what is in the way', () => {
    expect(() => {
      assertNeverUsed('vehicle', []);
    }).not.toThrow();
    const error = (() => {
      try {
        assertNeverUsed('driver', ['trips', 'incidents']);
      } catch (e) {
        return e as ValidationError;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ValidationError);
    expect(error?.httpStatus).toBe(422);
    expect(error?.message).toBe(
      "This driver can't be deleted because it has trips and incidents. Deactivate it instead."
    );
  });
});
