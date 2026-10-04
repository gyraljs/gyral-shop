# ADR 0003 — Money, pricing, inventory

Status: **accepted** (2026-10-04)

- **Money** is `{ cents: number; currency: 'USD' }` with integer cents; arithmetic and
  formatting live in `src/domain/money.ts` (`Intl.NumberFormat`). No floats for money.
- **Price pipeline** (pure, `src/domain/pricing.ts`): line subtotal = unit price × qty →
  item-level promos → order-level promo code → shipping (by method and subtotal threshold)
  → tax (by destination state rate table, on taxable items and shipping) → total. Every step
  returns an itemized breakdown so the cart, checkout and order history show the same lines.
- **Promo codes:** percentage or fixed amount, optional minimum subtotal, department
  restriction, start/end dates, usage limit. One code per order.
- **Inventory:** stock per variant (SKU). Adding to cart does not reserve; placing an order
  reserves atomically in a transaction and fails cleanly when stock is short. Cancelling
  releases it.
- **Order state machine:** `pending_payment → paid → fulfilled → delivered`, with
  `cancelled` and `refunded` branches. Transitions are pure functions that reject invalid moves.

## Addendum: decisions made while implementing `src/domain` (2026-10-04)

- Free shipping is judged on the **discounted** merchandise subtotal.
- Tax is rounded **once** on the total taxable amount, not per line. Promo discounts are
  allocated to lines (largest remainder) before tax, so exempt items don't absorb discounts.
- State rates are base rates only and marked illustrative. Grocery is taxed in AL, HI, ID, MS
  and SD; clothing is exempt in MN, NJ, PA and VT.
- Cancelling a paid order moves straight to `cancelled`, with a full refund as an effect.
- An invalid promo code never fails pricing: the breakdown carries `promoError` instead.
- The mock provider charges any Luhn-valid card except the documented failure cards.
