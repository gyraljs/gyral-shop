export { createMailer, type Mailer, type StoredMail } from './mail/outbox.js';
export {
  contactFormMail,
  escapeHtml,
  orderConfirmationMail,
  passwordResetMail,
  SUPPORT_ADDRESS,
  type ContactFormInput,
  type MailMessage,
  type OrderConfirmationInput,
  type OrderConfirmationLine,
  type PasswordResetInput,
} from './mail/templates.js';
