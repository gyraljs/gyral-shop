// Writes generated seed data in one transaction. Password hashes are computed by the caller
// (services/passwords), so this module stays a pure db concern.
import type { Db } from '../client.js';
import {
  brands,
  categories,
  departments,
  productImages,
  products,
  promoCodes,
  reviews,
  users,
  variants,
} from '../schema.js';
import { slugify, type SeedData } from './generate.js';

/** Inserts in chunks to stay well under SQLite's bound-parameter limit. */
async function chunked<T>(
  rows: readonly T[],
  size: number,
  write: (part: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

const need = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`seed: unknown ${what}`);
  return value;
};

export async function insertSeed(
  db: Db,
  data: SeedData,
  passwordHashes: ReadonlyMap<string, string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const departmentIds = new Map<string, number>();
    const categoryIds = new Map<string, number>();
    for (const [position, d] of data.departments.entries()) {
      const [row] = await tx
        .insert(departments)
        .values({ slug: d.slug, name: d.name, description: d.description, position })
        .returning({ id: departments.id });
      const departmentId = need(row, 'department').id;
      departmentIds.set(d.slug, departmentId);
      const inserted = await tx
        .insert(categories)
        .values(
          d.categories.map((c, i) => ({ departmentId, slug: c.slug, name: c.name, position: i })),
        )
        .returning({ id: categories.id, slug: categories.slug });
      for (const c of inserted) categoryIds.set(`${d.slug}/${c.slug}`, c.id);
    }

    const brandRows = await tx
      .insert(brands)
      .values(data.brands.map((name) => ({ slug: slugify(name), name })))
      .returning({ id: brands.id, name: brands.name });
    const brandIds = new Map(brandRows.map((b) => [b.name, b.id]));

    const productIds = new Map<string, number>();
    await chunked(data.products, 100, async (part) => {
      const rows = await tx
        .insert(products)
        .values(
          part.map((p) => ({
            slug: p.slug,
            name: p.name,
            description: p.description,
            departmentId: need(departmentIds.get(p.department), p.department),
            categoryId: need(categoryIds.get(`${p.department}/${p.category}`), p.category),
            brandId: need(brandIds.get(p.brand), p.brand),
            priceCents: p.priceCents,
            salePriceCents: p.salePriceCents,
            ratingSum: p.ratingSum,
            ratingCount: p.ratingCount,
            taxable: p.taxable,
            specs: p.specs,
            createdAt: p.createdAt,
          })),
        )
        .returning({ id: products.id, slug: products.slug });
      for (const r of rows) productIds.set(r.slug, r.id);
    });

    const variantRows = data.products.flatMap((p) =>
      p.variants.map((v, position) => ({
        ...v,
        productId: need(productIds.get(p.slug), p.slug),
        position,
      })),
    );
    await chunked(variantRows, 200, (part) => tx.insert(variants).values(part));
    const imageRows = data.products.flatMap((p) =>
      p.images.map((img, position) => ({
        ...img,
        productId: need(productIds.get(p.slug), p.slug),
        position,
      })),
    );
    await chunked(imageRows, 200, (part) => tx.insert(productImages).values(part));

    const userRows = await tx
      .insert(users)
      .values(
        data.users.map((u) => ({
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: need(passwordHashes.get(u.email), `password for ${u.email}`),
        })),
      )
      .returning({ id: users.id, email: users.email });
    const userIds = new Map(userRows.map((u) => [u.email, u.id]));
    const reviewRows = data.reviews.map((r) => ({
      productId: need(productIds.get(r.product), r.product),
      userId: need(userIds.get(r.user), r.user),
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
    }));
    await chunked(reviewRows, 200, (part) => tx.insert(reviews).values(part));

    const now = Date.UTC(2026, 9, 1);
    await tx.insert(promoCodes).values([
      { code: 'WELCOME10', kind: 'percent', amount: 1000 },
      { code: 'SAVE5', kind: 'fixed', amount: 500, minSubtotalCents: 2500 },
      {
        code: 'TOYS20',
        kind: 'percent',
        amount: 2000,
        departmentId: departmentIds.get('toys-games') ?? null,
      },
      { code: 'SUMMER25', kind: 'percent', amount: 2500, endsAt: new Date(now - 30 * 864e5) },
      { code: 'ONCE', kind: 'fixed', amount: 1000, usageLimit: 1, usedCount: 1 },
    ]);
  });
}
