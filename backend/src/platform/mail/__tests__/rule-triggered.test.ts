import { describe, expect, it } from 'vitest';
import {
  renderRuleTriggeredEmailHtml,
  renderRuleTriggeredEmailText,
  type RuleTriggeredEmailParams,
} from '../templates/rule-triggered.js';

function baseParams(overrides: Partial<RuleTriggeredEmailParams> = {}): RuleTriggeredEmailParams {
  return {
    ruleName: 'High Temp Alert',
    ruleId: '42',
    conditionsCount: 2,
    executionInterval: 300,
    allowRetriggering: true,
    deviceId: '7',
    deviceName: 'Warehouse Sensor',
    deviceEui: 'f7c4',
    userFirstName: 'Alice',
    customMessage: 'Temperature exceeded the safe threshold.',
    cleanedPacket: { temperature: 40, humidity: 20, battery: 15, is_online: true },
    triggeredAt: new Date('2026-09-23T14:05:00Z'),
    timezone: 'Asia/Karachi',
    ...overrides,
  };
}

describe("rule-triggered email (port of Laravel's RuleTriggeredMail, rule-triggered.blade.php + -text.blade.php)", () => {
  it('HTML: greeting, alert box and custom message render', () => {
    const html = renderRuleTriggeredEmailHtml(baseParams());
    expect(html).toContain('Hello Alice,');
    expect(html).toContain('High Temp Alert');
    expect(html).toContain('Temperature exceeded the safe threshold.');
  });

  it("HTML: the 'Device ID' row shows the EUI, not the numeric id (Laravel's literal mislabel, ported as-is)", () => {
    const html = renderRuleTriggeredEmailHtml(baseParams());
    expect(html).toContain('>Device ID</td>');
    expect(html).toContain('>f7c4</td>');
    expect(html).not.toContain('>7</td>');
  });

  it('text: has both a correctly-labeled Device ID (numeric) and Device EUI line', () => {
    const text = renderRuleTriggeredEmailText(baseParams());
    expect(text).toContain('Device ID: 7');
    expect(text).toContain('Device EUI: f7c4');
  });

  it('readings: unit inference + text-only status thresholds match the blade templates', () => {
    const text = renderRuleTriggeredEmailText(baseParams());
    expect(text).toContain('Temperature: 40.00°C (HIGH)');
    expect(text).toContain('Humidity: 20.00% (LOW)');
    expect(text).toContain('Battery: 15.00% (LOW)');
    expect(text).toContain('Is Online: Yes');
  });

  it("HTML readings table has no status column (Laravel's HTML never renders one either)", () => {
    const html = renderRuleTriggeredEmailHtml(baseParams());
    expect(html).toContain('40.00°C');
    expect(html).not.toContain('(HIGH)');
  });

  it('null/undefined packet values are skipped, matching `if ($value === null) continue;`', () => {
    const text = renderRuleTriggeredEmailText(
      baseParams({ cleanedPacket: { temperature: 25, dropped: null } })
    );
    expect(text).not.toContain('Dropped');
  });

  it('next-check block only appears when allowRetriggering is true', () => {
    const withRetrigger = renderRuleTriggeredEmailText(baseParams({ allowRetriggering: true }));
    const without = renderRuleTriggeredEmailText(baseParams({ allowRetriggering: false }));
    expect(withRetrigger).toContain('Next Check:');
    expect(without).not.toContain('Next Check:');
  });

  it("both html and text CTAs point at FRONTEND_URL (not the backend APP_URL Laravel's text template used)", () => {
    const html = renderRuleTriggeredEmailHtml(baseParams());
    const text = renderRuleTriggeredEmailText(baseParams());
    expect(html).toMatch(/href="[^"]*\/home"/);
    expect(html).toMatch(/href="[^"]*\/rule-builder"/);
    expect(text).toMatch(/View Dashboard: \S*\/home/);
    expect(text).toMatch(/Manage Rules: \S*\/rule-builder/);
  });

  it('HTML-escapes rule name, first name and custom message', () => {
    const html = renderRuleTriggeredEmailHtml(
      baseParams({
        ruleName: '<b>Rule</b>',
        userFirstName: '<i>Al</i>',
        customMessage: '<script>x</script>',
      })
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('empty custom message renders no alert-message block', () => {
    const html = renderRuleTriggeredEmailHtml(baseParams({ customMessage: '' }));
    expect(html).not.toContain('Alert Message');
  });
});
