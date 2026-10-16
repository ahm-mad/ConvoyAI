import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Tests must never talk to real third-party services: `dotenv/config` loads the developer's real `.env` (which holds live
    // Gmail SMTP, Cloudflare R2 and Google OAuth credentials, D-0131/D-0132), and dotenv never overrides variables that are
    // already set — so blanking them here wins. (Empty = "not configured": the mailer logs, uploads/social login report it.)
    env: {
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      MAIL_FROM: '',
      R2_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_BUCKET_NAME: '',
      R2_PUBLIC_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // CONVENTIONS.md "Tests": 80% lines / 75% branches per module.
      // Not enforced globally yet at 0.7 (no modules exist) — module
      // task files turn this on for their own directory as they land.
      exclude: ['src/generated/**', 'prisma/**', 'src/main.*.ts', '**/*.d.ts'],
    },
  },
});
