// The health check's database probe (GET /healthz): a real read of a migrated table, so an
// unreadable file or a database without its schema counts as down.
import type { Db } from '../client.js';
import { departments } from '../schema.js';

export async function probeDatabase(db: Db): Promise<void> {
  await db.select({ id: departments.id }).from(departments).limit(1);
}
