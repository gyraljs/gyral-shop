// `pnpm db:seed`: fills an empty database with the deterministic department store.
// Refuses to touch a database that already has products (use `pnpm db:reset`).
import { count } from 'drizzle-orm';
import { loadConfig } from '../src/config/env.js';
import { migrateDb, openDb } from '../src/db/client.js';
import { products } from '../src/db/schema.js';
import { generateCatalog } from '../src/db/seed/generate.js';
import { insertSeed } from '../src/db/seed/insert.js';
import { hashPassword } from '../src/services/passwords.js';

const ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'] ?? 'gyral-admin-2026';
const CUSTOMER_PASSWORD = 'gyral-customer-2026';

const { DATABASE_URL } = loadConfig();
const db = await openDb(DATABASE_URL);
await migrateDb(db);
const [existing] = await db.select({ n: count() }).from(products);
if ((existing?.n ?? 0) > 0) {
  console.error(`${DATABASE_URL} already has products. Run \`pnpm db:reset\` to start over.`);
  process.exit(1);
}

const data = generateCatalog();
const adminHash = await hashPassword(ADMIN_PASSWORD);
const customerHash = await hashPassword(CUSTOMER_PASSWORD);
const hashes = new Map(
  data.users.map((u) => [u.email, u.role === 'admin' ? adminHash : customerHash]),
);
await insertSeed(db, data, hashes);

const variantCount = data.products.reduce((n, p) => n + p.variants.length, 0);
console.log(`Seeded ${DATABASE_URL}:
  ${String(data.departments.length)} departments, ${String(data.products.length)} products, ${String(variantCount)} SKUs,
  ${String(data.users.length)} users, ${String(data.reviews.length)} reviews, 5 promo codes.

  Admin:     admin@shop.test / ${ADMIN_PASSWORD}
  Customers: any *@example.com user / ${CUSTOMER_PASSWORD}
  Promo codes: WELCOME10, SAVE5 (min $25), TOYS20 (toys only), SUMMER25 (expired), ONCE (used up)`);
