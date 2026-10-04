# Admin (`/admin`, role `admin`, CSR)

- **Dashboard**: sales today/7 days/30 days, orders by status, low-stock alerts, top products,
  page views (consented analytics).
- **Products**: searchable, sortable table; create/edit (name, slug, department, category,
  brand, description, images by URL, variants with SKU, price, sale price, stock); archive.
- **Inventory**: adjust stock per SKU with a reason (audit log).
- **Orders**: filter by status/date; detail; transitions (fulfil, mark delivered, cancel,
  refund full/partial) through the domain state machine.
- **Promo codes**: CRUD with the rules from ADR 0003.
- **Users**: list, search, promote/demote admin, disable account.
- **Reviews**: hide/unhide.
- Seed creates `admin@shop.test` (password printed by the seed script).
