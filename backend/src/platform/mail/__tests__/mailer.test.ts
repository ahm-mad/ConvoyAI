import { afterEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue(undefined);
const createTransportMock = vi.fn((_options: unknown) => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (options: unknown) => createTransportMock(options) },
}));

vi.mock('../../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  return { config: { ...actual.config, SMTP_HOST: undefined } };
});

describe("mailer (platform/mail, built ahead of 6.1 for register's verification email)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs instead of sending when SMTP is not configured', async () => {
    const { sendMail } = await import('../mailer.js');

    await sendMail({ to: 'a@b.com', subject: 'hi', html: '<p>hi</p>' });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends via nodemailer when SMTP_HOST is configured', async () => {
    const configModule = await import('../../config/index.js');
    (configModule.config as { SMTP_HOST?: string }).SMTP_HOST = 'smtp.example.com';

    const { sendMail } = await import('../mailer.js');
    await sendMail({ to: 'a@b.com', subject: 'Verify', html: '<p>click</p>' });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com' })
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', subject: 'Verify', html: '<p>click</p>' })
    );
  });
});
