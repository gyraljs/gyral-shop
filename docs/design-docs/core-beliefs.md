# Core beliefs

1. **A realistic showcase.** Every feature works end to end with real persistence; only
   payments and email are mocked, and the mocks behave like real providers (test cards,
   an outbox you can read).
2. **Works without JavaScript first.** Catalog, search, product pages, cart, checkout and
   account forms work as plain HTML forms and links; Gyral enhances them.
3. **Pure domain.** Prices, tax, promos, inventory and order transitions are pure functions
   in `src/domain`, tested exhaustively, used by both server and UI.
4. **Parse at every boundary.** Forms, JSON, env and seed data are parsed with valibot once.
5. **Semantic, accessible, fast.** Semantic HTML, WCAG 2.2 AA (axe in tests), modern CSS,
   Core Web Vitals budgets for key pages.
6. **The repo is the system of record.** Decisions live in design docs, requirements in
   product specs, work in beads.
7. **Dogfood Gyral honestly.** When Gyral gets in the way, file a Gyral bead instead of
   working around it silently.
