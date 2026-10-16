import { describe, expect, it } from 'vitest';
import {
  renderVerifyUserEmail,
  verifyUrlFor,
  VERIFY_USER_SUBJECT,
} from '../templates/verify-user.js';

describe("verify-user email (port of Laravel's VerifyUser mailable, D-0131)", () => {
  it("uses Laravel's subject", () => {
    expect(VERIFY_USER_SUBJECT).toBe('Please Verify Your Email Address');
  });

  it('builds the frontend link as FRONTEND_URL/verify-token/<token> with no double slash', () => {
    const url = verifyUrlFor('abc.def.ghi');
    expect(url).toMatch(/\/verify-token\/abc\.def\.ghi$/);
    expect(url.replace(/^https?:\/\//, '')).not.toContain('//');
  });

  it('renders the branded body: greeting, button and plain link both point at the verify URL', () => {
    const html = renderVerifyUserEmail({
      firstName: 'Alice',
      verifyUrl: 'https://app.example.com/verify-token/T',
    });

    expect(html).toContain('Welcome to ConvoyAI, Alice');
    expect(html).toContain('Verify Email Address');
    expect(html.match(/href="https:\/\/app\.example\.com\/verify-token\/T"/g)).toHaveLength(2);
    expect(html).toContain('valid for 24 hours');
  });

  it("HTML-escapes the user's name and the URL", () => {
    const html = renderVerifyUserEmail({
      firstName: '<script>x</script>',
      verifyUrl: 'https://a/b?x="1"&y=2',
    });

    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;1&quot;&amp;y=2');
  });
});
