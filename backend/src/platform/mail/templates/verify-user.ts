import { config } from '../../config/index.js';

/**
 * Port of the Laravel `VerifyUser` mailable (`resources/views/emails/verifyUser.blade.php` + the shared header/footer
 * layout) — D-0131. Subject and copy are Laravel's own; the fallback alt text keeps the header readable when the logo
 * image (which lived only on the old server's public storage) is unreachable.
 */
export const VERIFY_USER_SUBJECT = 'Please Verify Your Email Address';

/** The old app served `/storage/images/logo.png` from its own public disk (never in the repo); override with `MAIL_LOGO_URL` once the image is hosted somewhere permanent. */
const DEFAULT_LOGO_URL = 'https://example.com/images/logo.png';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function verifyUrlFor(token: string): string {
  return `${config.FRONTEND_URL.replace(/\/+$/, '')}/verify-token/${token}`;
}

export function renderVerifyUserEmail(input: { firstName: string; verifyUrl: string }): string {
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.verifyUrl);
  const logo = escapeHtml(config.MAIL_LOGO_URL ?? DEFAULT_LOGO_URL);

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Verification - ConvoyAI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
        <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                <tr>
                    <td style="background: #152635; padding: 25px 40px; text-align: center; color: #ffffff; font-size: 22px; font-weight: 700;">
                        <img src="${logo}" alt="ConvoyAI" style="height: 30px; color: #ffffff;" />
                    </td>
                </tr>
                <tr>
                    <td style="padding: 40px;">
<h1 style="color: #111827; font-size: 28px; font-weight: 700; margin: 0 0 20px 0; line-height: 1.2;">
    Welcome to ConvoyAI, ${name}
</h1>

<p style="font-size: 16px; color: #374151; margin: 0 0 25px 0; line-height: 1.6;">
    Thank you for creating your ConvoyAI account. To ensure the security of your account and begin monitoring your IoT devices, please verify your email address.
</p>

<div style="background-color: #eff6ff; border: 1px solid #2096F3; border-radius: 6px; padding: 18px; margin: 25px 0;">
    <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 500;">
        <strong>Account Security:</strong> This verification step protects your account and ensures secure access to your IoT monitoring dashboard.
    </p>
</div>

<div style="margin: 30px 0;">
    <h3 style="color: #111827; font-size: 18px; font-weight: 600; margin: 0 0 15px 0;">
        Verify Your Account
    </h3>

    <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0; line-height: 1.6;">
        Click the verification button below to activate your ConvoyAI account and gain access to our comprehensive IoT monitoring platform.
    </p>

    <div style="text-align: center; margin: 30px 0;">
        <a href="${url}"
           style="display: inline-block; background-color: #2096F3; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; letter-spacing: 0.3px;">
            Verify Email Address
        </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin: 20px 0 0 0; text-align: center;">
        Button not working? Copy and paste this link into your browser:<br>
        <a href="${url}" style="color: #2096F3; word-break: break-all; font-size: 13px;">
            ${url}
        </a>
    </p>
</div>

<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 30px 0;">
    <h4 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
        What's Next?
    </h4>

    <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.6;">
        <li style="margin-bottom: 8px;">Access your personalized IoT monitoring dashboard</li>
        <li style="margin-bottom: 8px;">Connect and configure your sensors and devices</li>
        <li style="margin-bottom: 8px;">Set up intelligent alerts and monitoring rules</li>
        <li style="margin-bottom: 0;">Begin real-time monitoring of your IoT infrastructure</li>
    </ul>
</div>

<div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
    <h4 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
        Security &amp; Privacy
    </h4>

    <p style="font-size: 14px; color: #6b7280; margin: 0 0 15px 0; line-height: 1.6;">
        This verification link is valid for 24 hours and can only be used once. If you did not create this account, please disregard this email or contact our security team.
    </p>

    <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px 0; line-height: 1.6;">
        Your data security is our priority. All communications are encrypted and your IoT data is protected with enterprise-grade security measures.
    </p>
</div>

<div style="border-top: 1px solid #e5e7eb; padding-top: 25px; margin-top: 25px;">
    <p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">
        Welcome to the future of IoT monitoring.
    </p>

    <p style="font-size: 14px; color: #374151; margin: 0;">
        <strong>The ConvoyAI Team</strong><br>
        <span style="color: #6b7280;">Intelligent IoT Solutions</span>
    </p>
</div>
                    </td>
                </tr>
                <tr>
                    <td style="background-color: #152635; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <a href="mailto:support@example.com" style="display: inline-block; padding: 10px 20px; border: 1px solid #2096F3; border-radius: 6px; color: #2096F3; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 15px;">
                            Contact Support
                        </a>
                        <p style="margin: 15px 0 0 0; font-size: 12px; color: #ffffff; line-height: 1.4;">
                            <strong style="color: #ffffff;">ConvoyAI</strong> • Office 1: 3901 Manayunk Ave, Philadelphia, PA 19128, United States<br>
                            Phone: +1 320-761-6308 • Email: support@example.com<br>
                            © 2025 All rights reserved
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>`;
}
