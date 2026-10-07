# Content pages

- **Home**: hero, featured departments, deals (on-sale products), top rated, best sellers, new
  arrivals.
- **About**, **FAQ** (`<details>` accordion), **Terms**, **Privacy**: static, prerendered at build
  time (ssg: `pnpm build` runs `src/server/prerender.ts`); the dev server renders them per request.
- **Contact**: form (name, email, topic, message) → mail outbox + success page; works without JS.
- **404** and **500** pages with search and department links; correct status codes.
