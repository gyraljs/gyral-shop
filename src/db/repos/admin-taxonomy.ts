// Renaming departments, categories and brands (admin). The search index copies these names
// into every product's row; triggers (drizzle/0006_taxonomy_reindex.sql) keep it in sync.
import { eq } from 'drizzle-orm';
import { brands, categories, departments } from '../schema.js';
import type { Tx } from '../tx.js';

export type TaxonKind = 'department' | 'category' | 'brand';

const TABLES = { department: departments, category: categories, brand: brands } as const;

export async function renameTaxon(
  tx: Tx,
  kind: TaxonKind,
  id: number,
  name: string,
): Promise<boolean> {
  const table = TABLES[kind];
  const updated = await tx
    .update(table)
    .set({ name })
    .where(eq(table.id, id))
    .returning({ id: table.id });
  return updated.length > 0;
}
