# Mail (mock)

- A mail service writes messages (to, subject, text + HTML) to an `outbox` table instead of
  sending.
- `/dev/mail` (only in development) lists and renders outbox messages, so reset links and
  order confirmations can be followed by hand and in tests.
