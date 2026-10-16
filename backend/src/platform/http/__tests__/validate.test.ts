import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOrThrow } from '../validate.js';
import { ValidationError } from '../../errors/app-error.js';

const schema = z.object({ email: z.email(), password: z.string().min(8) });

describe('parseOrThrow (D-0026: Zod issues -> the one validation-error shape)', () => {
  it('returns the parsed data on success', () => {
    expect(parseOrThrow(schema, { email: 'a@b.com', password: 'longenough' })).toEqual({
      email: 'a@b.com',
      password: 'longenough',
    });
  });

  it('throws a ValidationError with a field->messages bag on failure', () => {
    try {
      parseOrThrow(schema, { email: 'not-an-email', password: 'short' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validationError = err as ValidationError;
      expect(validationError.errors).toHaveProperty('email');
      expect(validationError.errors).toHaveProperty('password');
      expect(validationError.message).toBe(validationError.errors?.['email']?.[0]);
    }
  });
});
