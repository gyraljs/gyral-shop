import { describe, expect, it } from 'vitest';
import { count, eq, sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/client.js';
import { listDepartments, productCards } from '../../src/db/repos/catalog.js';
import { products, promoCodes, reviews, users, variants } from '../../src/db/schema.js';
import { generateCatalog } from '../../src/db/seed/generate.js';
import { insertSeed } from '../../src/db/seed/insert.js';
import { placeholderSvg } from '../../src/server/placeholder-image.js';

describe('catalog generation', () => {
  const full = generateCatalog();

  it('is deterministic', () => {
    const again = generateCatalog();
    expect(again.products.map((p) => p.slug)).toEqual(full.products.map((p) => p.slug));
    expect(again.reviews.length).toBe(full.reviews.length);
  });

  it('builds a department store of about 600 products', () => {
    expect(full.departments).toHaveLength(8);
    for (const d of full.departments) {
      expect(d.categories.length).toBeGreaterThanOrEqual(3);
      expect(d.categories.length).toBeLessThanOrEqual(6);
    }
    expect(full.products.length).toBeGreaterThan(550);
    expect(full.products.length).toBeLessThan(650);
    expect(new Set(full.products.map((p) => p.slug)).size).toBe(full.products.length);
  });

  it('has sales, sold-out SKUs, multi-variant products and consistent ratings', () => {
    expect(full.products.some((p) => p.salePriceCents !== null)).toBe(true);
    expect(full.products.some((p) => p.variants.some((v) => v.stock === 0))).toBe(true);
    expect(full.products.some((p) => p.variants.length > 4)).toBe(true);
    for (const p of full.products) {
      if (p.salePriceCents !== null) expect(p.salePriceCents).toBeLessThan(p.priceCents);
      const own = full.reviews.filter((r) => r.product === p.slug);
      expect(p.ratingCount).toBe(own.length);
      expect(p.ratingSum).toBe(own.reduce((s, r) => s + r.rating, 0));
      expect(Number.isInteger(p.priceCents)).toBe(true);
    }
  });
});

describe('seeding a database', () => {
  it('writes a small catalog that the repositories can read', async () => {
    const db = await createTestDb();
    const data = generateCatalog({ productsPerCategory: 2, customers: 5 });
    await insertSeed(db, data, new Map(data.users.map((u) => [u.email, 'scrypt$x$y'])));
    expect((await listDepartments(db)).map((d) => d.name)).toContain('Toys & Games');
    const [n] = await db.select({ n: count() }).from(products);
    expect(n?.n).toBe(data.products.length);
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin'));
    expect(admin?.email).toBe('admin@shop.test');
    const [skus] = await db.select({ n: count() }).from(variants);
    expect(skus?.n).toBe(data.products.reduce((s, p) => s + p.variants.length, 0));
    const [reviewCount] = await db.select({ n: count() }).from(reviews);
    expect(reviewCount?.n).toBe(data.reviews.length);
    const cards = await productCards(db, { limit: 5 });
    expect(cards[0]?.imageUrl).toMatch(/^\/img\/p\/.+\/1\.svg$/);
    const codes = await db
      .select({ code: promoCodes.code })
      .from(promoCodes)
      .orderBy(sql`1`);
    expect(codes.map((c) => c.code)).toContain('WELCOME10');
  });
});

describe('placeholder images', () => {
  it('renders a deterministic, escaped SVG', () => {
    const svg = placeholderSvg('voltra-sleek-4k-tv-12', 1);
    expect(svg).toBe(placeholderSvg('voltra-sleek-4k-tv-12', 1));
    expect(svg).toContain('<svg');
    expect(placeholderSvg('a-<script>-x', 1)).not.toContain('<script>');
  });
});
