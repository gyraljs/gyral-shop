export { createMailer, type Mailer, type StoredMail } from './mail/outbox.js';
export {
  contactFormMail,
  escapeHtml,
  orderCancelledMail,
  orderConfirmationMail,
  orderRefundedMail,
  orderShippedMail,
  passwordResetMail,
  SUPPORT_ADDRESS,
  type ContactFormInput,
  type MailMessage,
  type OrderCancelledInput,
  type OrderConfirmationInput,
  type OrderConfirmationLine,
  type OrderUpdateInput,
  type PasswordResetInput,
} from './mail/templates.js';
