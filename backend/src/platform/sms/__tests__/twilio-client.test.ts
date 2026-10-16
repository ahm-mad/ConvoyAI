import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn().mockResolvedValue(undefined);
const twilioFactoryMock = vi.fn((_sid: string, _token: string) => ({
  messages: { create: createMock },
}));

vi.mock('twilio', () => ({
  default: (sid: string, token: string) => twilioFactoryMock(sid, token),
}));

vi.mock('../../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  return {
    config: {
      ...actual.config,
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM: undefined,
    },
  };
});

describe("twilio-client (platform/sms, module 2.5's SMS rule action)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs instead of sending when Twilio is not configured', async () => {
    const { sendSms } = await import('../twilio-client.js');

    await sendSms('+15551234567', 'hi');

    expect(twilioFactoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('sends via Twilio when fully configured', async () => {
    const configModule = await import('../../config/index.js');
    Object.assign(configModule.config, {
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM: '+15559990000',
    });

    const { sendSms } = await import('../twilio-client.js');
    await sendSms('+15551234567', 'A rule has triggered');

    expect(twilioFactoryMock).toHaveBeenCalledWith('AC123', 'secret');
    expect(createMock).toHaveBeenCalledWith({
      to: '+15551234567',
      from: '+15559990000',
      body: 'A rule has triggered',
    });
  });
});
