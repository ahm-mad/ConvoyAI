import { DateTime } from 'luxon';
import { config } from '../../config/index.js';

/**
 * Port of Laravel's `RuleTriggeredMail` (`resources/views/emails/rule-triggered.blade.php` +
 * `rule-triggered-text.blade.php`, same shared header/footer layout as `verify-user.ts`, D-0131) —
 * built for module 2.5's `sendEmail` rule action, which previously just wrapped the raw custom
 * message as the entire HTML body with no template at all (noted, not fixed, in D-0131).
 *
 * Two literal Laravel quirks preserved rather than "fixed": (1) the HTML table's "Device ID" row
 * actually shows `device_unique_identifier` (the EUI), not the numeric device id — the text version
 * has both as separate correctly-labeled rows; ported as-is, not normalized between them. (2) the
 * HTML's two CTA buttons link to `FRONTEND_URL` (correct, user-facing); the text version's
 * "View Dashboard"/"Manage Rules" lines used `config('app.url')` (the *backend* API origin, not a
 * page a browser can render) — that one is NOT a real behavior worth porting (README prime directive
 * #4: an unconditionally safer deviation, no existing working behavior to preserve), so both html and
 * text use `FRONTEND_URL` here.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DEFAULT_LOGO_URL = 'https://example.com/images/logo.png';

function frontendUrl(path: string): string {
  return `${config.FRONTEND_URL.replace(/\/+$/, '')}${path}`;
}

/** `Carbon::now($user->timezone)` — same "unrecognized/absent zone falls back to UTC" convention as `dates.ts`'s `formatDeviceCreatedAt` (D-0119). */
function inUserZone(date: Date, timezone: string | null): DateTime {
  const zoned = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone ?? 'UTC');
  return zoned.isValid ? zoned : DateTime.fromJSDate(date, { zone: 'utc' });
}

type ReadingStatus = 'NORMAL' | 'HIGH' | 'LOW' | 'MEDIUM';

interface ReadingRow {
  label: string;
  formattedValue: string;
  unit: string;
  status: ReadingStatus;
}

/** `ucwords(str_replace(['_', '.', '-'], ' ', $key))` — only the first letter of each space-separated word is uppercased, nothing else touched. */
function toLabel(key: string): string {
  return key.replace(/[_.-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toNumeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))
    return Number(value);
  return undefined;
}

/** `$cleanedPacket` rows for the "Current Readings" table — unit inference + (text-only) status thresholds ported verbatim from both blade templates. */
function buildReadingRows(cleanedPacket: Record<string, unknown>): ReadingRow[] {
  const rows: ReadingRow[] = [];

  for (const [key, value] of Object.entries(cleanedPacket)) {
    if (value === null || value === undefined) continue;

    const numeric = toNumeric(value);
    const formattedValue =
      numeric !== undefined
        ? numeric.toFixed(2)
        : typeof value === 'boolean'
          ? value
            ? 'Yes'
            : 'No'
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);

    let unit = '';
    let status: ReadingStatus = 'NORMAL';
    const keyLower = key.toLowerCase();

    if (keyLower.includes('temp')) {
      unit = '°C';
      if (numeric !== undefined) {
        if (numeric > 35) status = 'HIGH';
        else if (numeric < 15) status = 'LOW';
      }
    } else if (keyLower.includes('humid')) {
      unit = '%';
      if (numeric !== undefined) {
        if (numeric > 70) status = 'HIGH';
        else if (numeric < 30) status = 'LOW';
      }
    } else if (keyLower.includes('pressure')) {
      unit = ' hPa';
    } else if (keyLower.includes('battery')) {
      unit = '%';
      if (numeric !== undefined) {
        if (numeric < 20) status = 'LOW';
        else if (numeric < 50) status = 'MEDIUM';
      }
    } else if (keyLower.includes('co2')) {
      unit = ' ppm';
      if (numeric !== undefined && numeric > 1000) status = 'HIGH';
    }

    rows.push({ label: toLabel(key), formattedValue, unit, status });
  }

  return rows;
}

export interface RuleTriggeredEmailParams {
  ruleName: string;
  ruleId: string;
  conditionsCount: number;
  executionInterval: number;
  allowRetriggering: boolean;
  deviceId: string;
  deviceName: string;
  deviceEui: string;
  userFirstName: string;
  /** Already placeholder-substituted (`{{rule_name}}` etc. — `rules.service.ts` does that before calling in). */
  customMessage: string;
  cleanedPacket: Record<string, unknown>;
  triggeredAt: Date;
  timezone: string | null;
}

/** `RuleTriggeredMail::getNextCheckTime()` — null unless retriggering is allowed. */
function nextCheckTime(params: RuleTriggeredEmailParams): DateTime | null {
  if (!params.allowRetriggering) return null;
  return inUserZone(
    new Date(params.triggeredAt.getTime() + params.executionInterval * 1000),
    params.timezone
  );
}

export function renderRuleTriggeredEmailHtml(params: RuleTriggeredEmailParams): string {
  const ruleName = escapeHtml(params.ruleName || 'Unnamed Rule');
  const firstName = escapeHtml(params.userFirstName);
  const logo = escapeHtml(config.MAIL_LOGO_URL ?? DEFAULT_LOGO_URL);
  const triggeredAt = inUserZone(params.triggeredAt, params.timezone);
  const readings = buildReadingRows(params.cleanedPacket);
  const nextCheck = nextCheckTime(params);

  const customMessageBlock = params.customMessage
    ? `<div style="background-color: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 25px 0;">
    <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Alert Message</h3>
    <p style="margin: 0; color: #78350f; font-size: 15px; line-height: 1.5;">${escapeHtml(params.customMessage).replaceAll('\n', '<br>')}</p>
</div>`
    : '';

  const readingsBlock =
    readings.length > 0
      ? `<div style="margin: 30px 0;">
    <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Current Readings</h3>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <thead>
        <tr style="background-color: #f3f4f6;">
            <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Sensor</th>
            <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Value</th>
        </tr>
        </thead>
        <tbody>
        ${readings
          .map(
            (r, i) =>
              `<tr style="${i % 2 === 1 ? 'background-color:#f9fafb;' : ''}">
            <td style="padding: 12px 16px; color: #374151; border-bottom: 1px solid #e5e7eb;">${escapeHtml(r.label)}</td>
            <td style="padding: 12px 16px; text-align: right; color: #111827; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${escapeHtml(r.formattedValue)}${escapeHtml(r.unit)}</td>
        </tr>`
          )
          .join('\n        ')}
        </tbody>
    </table>
</div>`
      : '';

  const nextCheckBlock = nextCheck
    ? `<div style="background-color: #e3f2fd; border: 1px solid #2096F3; border-radius: 6px; padding: 15px; margin: 25px 0;">
    <p style="margin: 0; color: #1565c0; font-size: 14px;"><strong>Next Check:</strong> ${escapeHtml(nextCheck.toFormat("MMMM d, yyyy 'at' h:mm a"))}</p>
</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rule Alert - ${ruleName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
        <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                <tr>
                    <td style="background: #152635; padding: 25px 40px; text-align: center;">
                        <img src="${logo}" alt="ConvoyAI" style="height: 30px;" />
                    </td>
                </tr>
                <tr>
                    <td style="padding: 40px;">

<p style="margin: 0 0 25px 0; font-size: 16px; color: #374151;">Hello ${firstName},</p>

<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 25px 0; border-radius: 0 6px 6px 0;">
    <h2 style="margin: 0 0 8px 0; color: #dc2626; font-size: 18px; font-weight: 600;">${ruleName}</h2>
    <p style="margin: 0; color: #7f1d1d; font-size: 14px;">triggered at ${escapeHtml(triggeredAt.toFormat('h:mm a'))}</p>
</div>

${customMessageBlock}

<div style="margin: 30px 0;">
    <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Device Information</h3>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tr style="background-color: #f9fafb;">
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; width: 35%;">Device Name</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${escapeHtml(params.deviceName || 'Unknown Device')}</td>
        </tr>
        <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Device ID</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${escapeHtml(params.deviceEui)}</td>
        </tr>
    </table>
</div>

${readingsBlock}

<div style="margin: 30px 0;">
    <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Rule Configuration</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Conditions</p>
                <p style="margin: 0; color: #111827; font-weight: 600;">${String(params.conditionsCount)} condition(s) must be met</p>
            </div>
            <div>
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Execution Interval</p>
                <p style="margin: 0; color: #111827; font-weight: 600;">${String(params.executionInterval)} seconds</p>
            </div>
        </div>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Retriggering</p>
            <p style="margin: 0; color: #111827; font-weight: 600;">${params.allowRetriggering ? 'Allowed' : 'Not allowed'}</p>
        </div>
    </div>
</div>

${nextCheckBlock}

<div style="text-align: center; margin: 35px 0 25px 0;">
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">Take action to address this alert or review your rule settings.</p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
        <tr>
            <td style="padding-right: 10px;">
                <a href="${escapeHtml(frontendUrl('/home'))}" style="display: inline-block; background-color: #2096F3; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View Dashboard</a>
            </td>
            <td style="padding-left: 10px;">
                <a href="${escapeHtml(frontendUrl('/rule-builder'))}" style="display: inline-block; background-color: #f1f1f1; color: #374151; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Manage Rules</a>
            </td>
        </tr>
    </table>
</div>

<div style="border-top: 1px solid #e5e7eb; padding-top: 25px; margin-top: 35px;">
    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">This alert was generated automatically by your ConvoyAI monitoring system. If you believe this is an error, please review your rule configuration.</p>
    <p style="margin: 0; color: #374151; font-size: 14px;">Best regards,<br><strong>Your ConvoyAI Team</strong></p>
</div>

                    </td>
                </tr>
                <tr>
                    <td style="background-color: #152635; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <a href="mailto:support@example.com" style="display: inline-block; padding: 10px 20px; border: 1px solid #2096F3; border-radius: 6px; color: #2096F3; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 15px;">Contact Support</a>
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

export function renderRuleTriggeredEmailText(params: RuleTriggeredEmailParams): string {
  const ruleName = params.ruleName || 'Unnamed Rule';
  const triggeredAt = inUserZone(params.triggeredAt, params.timezone);
  const readings = buildReadingRows(params.cleanedPacket);
  const nextCheck = nextCheckTime(params);
  const lines: string[] = [];

  lines.push('ConvoyAI - RULE ALERT TRIGGERED');
  lines.push('===============================================');
  lines.push('');
  lines.push(`Hello ${params.userFirstName},`);
  lines.push('');
  lines.push(`ALERT: ${ruleName}`);
  lines.push(`Rule ID: #${params.ruleId}`);
  lines.push(`Triggered: ${triggeredAt.toFormat("MMMM d, yyyy 'at' h:mm a")}`);
  lines.push('');

  if (params.customMessage) {
    lines.push('ALERT DETAILS:');
    lines.push(params.customMessage);
    lines.push('');
  }

  lines.push('DEVICE INFORMATION:');
  lines.push('---------------------------------------');
  lines.push(`Device Name: ${params.deviceName || 'Unknown Device'}`);
  lines.push(`Device ID: ${params.deviceId}`);
  lines.push(`Device EUI: ${params.deviceEui || 'N/A'}`);
  lines.push('');

  if (readings.length > 0) {
    lines.push('CURRENT READINGS:');
    lines.push('---------------------------------------');
    for (const r of readings) {
      lines.push(`${r.label}: ${r.formattedValue}${r.unit} (${r.status})`);
    }
    lines.push('');
  }

  lines.push('RULE CONFIGURATION:');
  lines.push('---------------------------------------');
  lines.push(`Conditions: ${String(params.conditionsCount)} condition(s) must be met`);
  lines.push(`Execution Interval: ${String(params.executionInterval)} seconds`);
  lines.push(`Retriggering: ${params.allowRetriggering ? 'Allowed' : 'Not allowed'}`);
  lines.push('');

  if (nextCheck) {
    lines.push(`Next Check: ${nextCheck.toFormat("MMMM d, yyyy 'at' h:mm a")}`);
    lines.push('');
  }

  lines.push('ACTIONS REQUIRED:');
  lines.push('---------------------------------------');
  lines.push('Take action to address this alert or review your rule settings.');
  lines.push('');
  lines.push(`View Dashboard: ${frontendUrl('/home')}`);
  lines.push(`Manage Rules: ${frontendUrl('/rule-builder')}`);
  lines.push('');
  lines.push('This alert was generated automatically by your ConvoyAI monitoring system.');
  lines.push('If you believe this is an error, please review your rule configuration.');
  lines.push('');
  lines.push('Best regards,');
  lines.push('Your ConvoyAI Team');
  lines.push('');
  lines.push('===============================================');
  lines.push('ConvoyAI SUPPORT');
  lines.push('Email: support@example.com');
  lines.push('Phone: +1 320-761-6308');
  lines.push('');
  lines.push('Office 1: 3901 Manayunk Ave, Philadelphia, PA 19128, United States');
  lines.push('© 2025 All rights reserved');
  lines.push('');
  lines.push('To stop receiving these alerts, disable this rule in your dashboard:');
  lines.push(`${frontendUrl('/rule-builder')}/${params.ruleId}`);

  return lines.join('\n');
}
