// `pnpm db:purge`: deletes expired sessions and orphaned guest carts once (the dev and
// production servers also do this hourly: src/services/maintenance.ts).
import { loadConfig } from '../src/config/env.js';
import { openDb } from '../src/db/client.js';
import { purgeStale } from '../src/services/maintenance.js';

const { DATABASE_URL } = loadConfig();
const result = await purgeStale(await openDb(DATABASE_URL));
console.log(`purged ${String(result.sessions)} sessions, ${String(result.carts)} guest carts`);
