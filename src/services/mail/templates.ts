// Typed mail templates (docs/product-specs/mail.md). Each returns plain text and HTML bodies;
// every interpolated value is escaped. Pure: no I/O.
import { format, usd, type Money } from '../../domain/money.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Only http(s) links are rendered as links, so a template can never emit `javascript:`. */
const safeUrl = (url: string): string => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to put a ${parsed.protocol} link in an email`);
  }
  return parsed.href;
};

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2328;">
<main style="max-width: 36rem; margin: 0 auto; padding: 1rem;">
${body}
<p style="color: #59636e; font-size: 0.875rem;">Gyral Goods — a demo store. This message was not really sent.</p>
</main></body></html>`;

const button = (href: string, label: string): string =>
  `<p><a href="${escapeHtml(safeUrl(href))}" style="display: inline-block; padding: 0.5rem 1rem; background: #c8102e; color: #fff; border-radius: 0.375rem; text-decoration: none;">${escapeHtml(label)}</a></p>`;

export interface PasswordResetInput {
  readonly to: string;
  readonly name: string;
  readonly resetUrl: string;
  readonly expiresInMinutes: number;
}

export function passwordResetMail(input: PasswordResetInput): MailMessage {
  const minutes = String(input.expiresInMinutes);
  const subject = 'Reset your Gyral Goods password';
  return {
    to: input.to,
    subject,
    text: [
      `Hi ${input.name},`,
      '',
      'Someone asked to reset the password for your account. If it was you, open this link:',
      safeUrl(input.resetUrl),
      '',
      `The link works once and expires in ${minutes} minutes. If you didn't ask, ignore this email.`,
    ].join('\n'),
    html: layout(
      subject,
      `<h1>Reset your password</h1>
<p>Hi ${escapeHtml(input.name)},</p>
<p>Someone asked to reset the password for your account. If it was you, use this button:</p>
${button(input.resetUrl, 'Choose a new password')}
<p>The link works once and expires in ${minutes} minutes. If you didn't ask, ignore this email.</p>`,
    ),
  };
}

export interface OrderConfirmationLine {
  readonly name: string;
  readonly variant?: string;
  readonly quantity: number;
  readonly lineTotal: Money;
}

export interface OrderConfirmationInput {
  readonly to: string;
  readonly name: string;
  readonly orderNumber: string;
  readonly orderUrl: string;
  readonly lines: readonly OrderConfirmationLine[];
  readonly totals: {
    readonly subtotal: Money;
    readonly discount: Money;
    readonly shipping: Money;
    readonly tax: Money;
    readonly total: Money;
  };
}

const lineLabel = (line: OrderConfirmationLine): string =>
  line.variant === undefined ? line.name : `${line.name} (${line.variant})`;

export function orderConfirmationMail(input: OrderConfirmationInput): MailMessage {
  const subject = `Order ${input.orderNumber} confirmed`;
  const { totals } = input;
  const summary: readonly (readonly [string, Money])[] = [
    ['Subtotal', totals.subtotal],
    // Breakdown discounts are positive amounts taken off; show them as negative.
    ...(totals.discount.cents === 0 ? [] : [['Discount', usd(-totals.discount.cents)] as const]),
    ['Shipping', totals.shipping],
    ['Tax', totals.tax],
    ['Total', totals.total],
  ];
  const textLines = input.lines.map(
    (l) => `- ${String(l.quantity)} × ${lineLabel(l)}: ${format(l.lineTotal)}`,
  );
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(lineLabel(l))}</td><td style="text-align: right;">${String(l.quantity)}</td><td style="text-align: right;">${escapeHtml(format(l.lineTotal))}</td></tr>`,
    )
    .join('\n');
  const totalRows = summary
    .map(
      ([label, amount]) =>
        `<tr><th scope="row" colspan="2" style="text-align: right;">${label}</th><td style="text-align: right;">${escapeHtml(format(amount))}</td></tr>`,
    )
    .join('\n');
  return {
    to: input.to,
    subject,
    text: [
      `Hi ${input.name},`,
      '',
      `Thanks for your order. Order number: ${input.orderNumber}`,
      '',
      ...textLines,
      '',
      ...summary.map(([label, amount]) => `${label}: ${format(amount)}`),
      '',
      `View your order: ${safeUrl(input.orderUrl)}`,
    ].join('\n'),
    html: layout(
      subject,
      `<h1>Thanks for your order</h1>
<p>Hi ${escapeHtml(input.name)}, we've received order <strong>${escapeHtml(input.orderNumber)}</strong>.</p>
<table style="width: 100%; border-collapse: collapse;">
<caption style="text-align: left; font-weight: 600;">Order summary</caption>
<thead><tr><th scope="col" style="text-align: left;">Item</th><th scope="col" style="text-align: right;">Qty</th><th scope="col" style="text-align: right;">Price</th></tr></thead>
<tbody>
${rows}
</tbody>
<tfoot>
${totalRows}
</tfoot>
</table>
${button(input.orderUrl, 'View your order')}`,
    ),
  };
}

export interface ContactFormInput {
  readonly fromName: string;
  readonly fromEmail: string;
  readonly topic: string;
  readonly message: string;
}

/** Where contact-form messages go. */
export const SUPPORT_ADDRESS = 'support@shop.test';

export function contactFormMail(input: ContactFormInput): MailMessage {
  const subject = `Contact form: ${input.topic}`;
  const paragraphs = input.message
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return {
    to: SUPPORT_ADDRESS,
    subject,
    text: [
      `From: ${input.fromName} <${input.fromEmail}>`,
      `Topic: ${input.topic}`,
      '',
      input.message,
    ].join('\n'),
    html: layout(
      subject,
      `<h1>New contact form message</h1>
<dl>
<dt>From</dt><dd>${escapeHtml(input.fromName)} &lt;${escapeHtml(input.fromEmail)}&gt;</dd>
<dt>Topic</dt><dd>${escapeHtml(input.topic)}</dd>
</dl>
${paragraphs}`,
    ),
  };
}
