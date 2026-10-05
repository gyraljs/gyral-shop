# Orders

- `/account/orders`: paginated history (number, date, status, total, item count).
- Order detail: lines, itemized totals as charged, shipping address, payment (brand + last 4),
  status timeline.
- Members can **cancel** while `paid` and not fulfilled (releases stock, refunds payment).
- Guests can look up an order by number + email.
- Order confirmation page after checkout.

## Implementation notes (shop-935.4)

- `/account/orders` (10 per page, `?page=n`; past the end is 404), `/account/orders/:number`
  (member or admin), `POST /account/orders/:number/cancel` (Post/Redirect/Get with a flash).
- Cancelling claims the order with a conditional update (`paid` → `cancelled`), restocks and
  logs the inventory in the same transaction, then refunds through the payment provider. A
  failed refund keeps the order cancelled, adds a "refund pending" timeline entry and tells the
  customer a person will refund them.
- The timeline comes from `order_events` (placed, paid, cancelled, refunds).
- Guest lookup: `/order/lookup` (number + email, case-insensitive, 10 tries per IP and 5 per
  order number per 15 minutes) grants the signed `orders` cookie and opens `/order/:number`.
  Anyone without access to an order — unknown, foreign, or a guest on another device — is sent
  to the lookup form, the same way for every number, so the confirmation email's link works for
  guests and numbers can't be probed. Guests can't cancel online.
