import { describe, expect, it } from 'vitest';
import { usd } from '../../domain/money.js';
import {
  contactFormMail,
  escapeHtml,
  orderConfirmationMail,
  passwordResetMail,
  SUPPORT_ADDRESS,
} from './templates.js';

describe('mail templates', () => {
  it('escapes every interpolated value in HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    const mail = contactFormMail({
      fromName: '<script>alert(1)</script>',
      fromEmail: 'evil@example.com',
      topic: 'Orders & returns',
      message: 'line one\nline two\n\n<b>para two</b>',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('Orders &amp; returns');
    expect(mail.html).toContain('<p>line one<br>line two</p>');
    expect(mail.html).toContain('<p>&lt;b&gt;para two&lt;/b&gt;</p>');
    expect(mail.to).toBe(SUPPORT_ADDRESS);
    expect(mail.text).toContain('<script>alert(1)</script>'); // plain text stays verbatim
  });

  it('builds a password reset with the link in both bodies', () => {
    const mail = passwordResetMail({
      to: 'ada@example.com',
      name: 'Ada',
      resetUrl: 'http://localhost:5200/account/reset?token=abc&x=1',
      expiresInMinutes: 30,
    });
    expect(mail.subject).toBe('Reset your Gyral Goods password');
    expect(mail.text).toContain('http://localhost:5200/account/reset?token=abc&x=1');
    expect(mail.html).toContain('href="http://localhost:5200/account/reset?token=abc&amp;x=1"');
    expect(mail.text).toContain('expires in 30 minutes');
  });

  it('refuses non-http links', () => {
    expect(() =>
      passwordResetMail({
        to: 'a@b.c',
        name: 'A',
        resetUrl: 'javascript:alert(1)',
        expiresInMinutes: 30,
      }),
    ).toThrow(/javascript:/);
  });

  it('itemizes an order confirmation and omits a zero discount', () => {
    const base = {
      to: 'ada@example.com',
      name: 'Ada',
      orderNumber: 'GG-1001',
      orderUrl: 'http://localhost:5200/account/orders/GG-1001',
      lines: [
        { name: 'Desk lamp', variant: 'Black', quantity: 2, lineTotal: usd(5998) },
        { name: 'Notebook', quantity: 1, lineTotal: usd(499) },
      ],
      totals: {
        subtotal: usd(6497),
        discount: usd(0),
        shipping: usd(0),
        tax: usd(455),
        total: usd(6952),
      },
    };
    const mail = orderConfirmationMail(base);
    expect(mail.subject).toBe('Order GG-1001 confirmed');
    expect(mail.text).toContain('- 2 × Desk lamp (Black): $59.98');
    expect(mail.text).toContain('Total: $69.52');
    expect(mail.text).not.toContain('Discount');
    expect(mail.html).toContain('<caption');
    expect(mail.html).toContain('$69.52');

    const discounted = orderConfirmationMail({
      ...base,
      totals: { ...base.totals, discount: usd(650) },
    });
    expect(discounted.text).toContain('Discount: -$6.50');
  });
});
