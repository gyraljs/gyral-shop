# Accounts

- **Register** (`/account/register`): name, email, password + confirm. Same validation with and
  without JS (Gyral `form()` + `formAction()`); duplicate email error does not leak timing.
- **Login/logout**: email + password; "return to" the page that required login; logout is a
  POST. Lockout messaging after rate limit.
- **Profile**: change name and email (re-enter password for email change).
- **Addresses**: list, add, edit, delete, set default shipping address; US states only.
- **Change password** (current + new) and **forgot/reset password** via mailed link
  (mail.md), token single-use, 30 minutes.
- Account pages require login; the header shows the member's first name and an account menu.
