# Content pages

- **Home**: hero, featured departments, deals (on-sale products), new arrivals, best sellers.
- **About**, **FAQ** (`<details>` accordion), **Terms**, **Privacy**: static, prerendered (ssg)
  once Gyral supports it, ssr until then.
- **Contact**: form (name, email, topic, message) → mail outbox + success page; works without JS.
- **404** and **500** pages with search and department links; correct status codes.
