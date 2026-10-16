import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  return { config: { ...actual.config, GROQ_API_KEY: undefined } };
});

describe('groq-client (platform/ai, module 6.3)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('logs instead of calling out when Groq is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { completeChat } = await import('../groq-client.js');
    const result = await completeChat('prompt');

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the real chat-completions endpoint with the configured model when a key is set', async () => {
    const configModule = await import('../../config/index.js');
    Object.assign(configModule.config, {
      GROQ_API_KEY: 'test-key',
      GROQ_BASE_URL: 'https://groq.example.com/v1',
      GROQ_MODEL: 'some-free-model',
    });

    const fetchMock = vi.fn((): Promise<{ ok: boolean; json: () => Promise<unknown> }> =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'temp, humidity' } }] }),
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { completeChat } = await import('../groq-client.js');
    const result = await completeChat('prompt text');

    expect(fetchMock).toHaveBeenCalledWith('https://groq.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'some-free-model',
        messages: [{ role: 'user', content: 'prompt text' }],
      }),
    });
    expect(result).toBe('temp, humidity');
  });

  it('returns undefined (and logs) when the Groq API responds with a non-OK status', async () => {
    const configModule = await import('../../config/index.js');
    Object.assign(configModule.config, { GROQ_API_KEY: 'test-key' });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const { completeChat } = await import('../groq-client.js');
    const result = await completeChat('prompt');

    expect(result).toBeUndefined();
  });
});
