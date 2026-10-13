// `pnpm db:seed`: fills an empty database with the deterministic department store
// (src/services/demo.ts, the same seed the demo server writes and resets to).
// Refuses to touch a database that already has products (use `pnpm db:reset`), and refuses
// the public default admin password under NODE_ENV=production (set SEED_ADMIN_PASSWORD).
import { loadConfig, seedAdminPassword } from '../src/config/env.js';
import { migrateDb, openDb } from '../src/db/client.js';
import { insertSeed } from '../src/db/seed/insert.js';
import { CUSTOMER_PASSWORD, demoSeed, isEmpty } from '../src/services/demo.js';

const config = loadConfig();
const adminPassword = seedAdminPassword(config);
const { DATABASE_URL } = config;
const db = await openDb(DATABASE_URL);
await migrateDb(db);
if (!(await isEmpty(db))) {
  console.error(`${DATABASE_URL} already has products. Run \`pnpm db:reset\` to start over.`);
  process.exit(1);
}

const { data, passwordHashes } = await demoSeed(adminPassword);
await insertSeed(db, data, passwordHashes);

const variantCount = data.products.reduce((n, p) => n + p.variants.length, 0);
const shownAdmin =
  config.SEED_ADMIN_PASSWORD === undefined ? adminPassword : '(SEED_ADMIN_PASSWORD)';
console.log(`Seeded ${DATABASE_URL}:
  ${String(data.departments.length)} departments, ${String(data.products.length)} products, ${String(variantCount)} SKUs,
  ${String(data.users.length)} users, ${String(data.reviews.length)} reviews, 5 promo codes.

  Admin:     admin@shop.test / ${shownAdmin}
  Customers: any *@example.com user / ${CUSTOMER_PASSWORD}
  Promo codes: WELCOME10, SAVE5 (min $25), TOYS20 (toys only), SUMMER25 (expired), ONCE (used up)`);
