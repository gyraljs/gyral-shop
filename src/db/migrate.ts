// `pnpm db:migrate`: applies drizzle/ migrations to DATABASE_URL.
import { loadConfig } from '../config/env.js';
import { migrateDb, openDb } from './client.js';

const { DATABASE_URL } = loadConfig();
await migrateDb(openDb(DATABASE_URL));
console.log(`migrated ${DATABASE_URL}`);
