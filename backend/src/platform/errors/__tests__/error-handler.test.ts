import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../error-handler.js';
import { ConflictError, ForbiddenError, ValidationError } from '../app-error.js';
import type { Logger } from '../../logging/logger.js';

function fakeLogger(): Logger {
  return { error: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

function appThatThrows(err: unknown) {
  const app = express();
  app.get('/boom', () => {
    throw err;
  });
  app.use(createErrorHandler(fakeLogger()));
  return app;
}

describe('error handler (D-0026: matches the frozen ErrorResponse shape)', () => {
  it('renders an AppError as {success:false, message}', async () => {
    const res = await request(appThatThrows(new ForbiddenError('Requires role: admin'))).get(
      '/boom'
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Requires role: admin' });
  });

  it('renders a ValidationError with the field->messages errors bag, at 422', async () => {
    const err = new ValidationError('Validation failed', { email: ['is required'] });

    const res = await request(appThatThrows(err)).get('/boom');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      message: 'Validation failed',
      errors: { email: ['is required'] },
    });
  });

  it('never leaks exception text for an unhandled (non-AppError) error', async () => {
    const res = await request(appThatThrows(new Error('db password is hunter2'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
  it('D-0176: a 409 carries its structured extras (e.g. `current`) but they can never override success / message', async () => {
    const res = await request(
      appThatThrows(
        new ConflictError('Changed.', { current: { id: '1' }, success: true, message: 'hacked' })
      )
    ).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ current: { id: '1' }, success: false, message: 'Changed.' });
  });
});
