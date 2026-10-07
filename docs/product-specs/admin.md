# Admin (`/admin`, role `admin`, CSR)

- **Dashboard**: sales today/7 days/30 days, orders by status, low-stock alerts, top products,
  page views (consented analytics).
- **Products**: searchable, sortable table; create/edit (name, slug, department, category,
  brand, description, images by URL, sale price, variants with SKU, options and an optional price override); archive. Stock
  changes only through inventory adjustments.
- **Inventory**: adjust stock per SKU with a reason (audit log).
- **Orders**: filter by status/date; detail; transitions (fulfil, mark delivered, cancel,
  refund full/partial) through the domain state machine.
- **Promo codes**: CRUD with the rules from ADR 0003.
- **Users**: list, search, promote/demote admin, disable account.
- **Reviews**: hide/unhide.
- Seed creates `admin@shop.test` (password printed by the seed script).

## Implementation notes (shop-cw6.4 and follow-ups)

- **Promo codes** (`/admin/promos`): status is computed (active, scheduled, expired, used up,
  inactive); a usage limit can't drop below the times a code was used; only never-used codes can
  be deleted, used ones are deactivated. Dates are store-time-zone days (ADR 0003 addendum).
- **Users** (`/admin/users`): every change needs confirmation; admins can't demote or disable
  themselves; the store always keeps an active admin (checked inside the write lock); role changes
  and disabling end that member's sessions.
- **Reviews** (`/admin/reviews`): hide or show; the product rating is recomputed.
- **Departments, categories & brands** (`/admin/taxonomy`): create, rename, archive, restore. Archived ones are
  hidden from shoppers; archiving is refused while live products use them.
- The admin has its own document shell (no storefront header, cart, consent banner or footer).
