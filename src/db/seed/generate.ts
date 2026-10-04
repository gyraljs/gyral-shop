// Deterministic catalog generation: same seed, same store. Pure (no I/O), so tests can
// generate a small catalog and the CLI a full one (catalog spec: ~600 products).
import { Faker, en } from '@faker-js/faker';
import { DEPARTMENTS, type CategorySpec, type DepartmentSpec } from './departments.js';

export interface SeedVariant {
  readonly sku: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: number | null;
  readonly stock: number;
}

export interface SeedProduct {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly department: string;
  readonly category: string;
  readonly brand: string;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly taxable: boolean;
  readonly specs: readonly (readonly [string, string])[];
  readonly createdAt: Date;
  readonly variants: readonly SeedVariant[];
  readonly images: readonly { readonly url: string; readonly alt: string }[];
  readonly ratingSum: number;
  readonly ratingCount: number;
}

export interface SeedUser {
  readonly email: string;
  readonly name: string;
  readonly role: 'customer' | 'admin';
}

export interface SeedReview {
  readonly product: string;
  readonly user: string;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface SeedData {
  readonly departments: readonly DepartmentSpec[];
  readonly brands: readonly string[];
  readonly products: readonly SeedProduct[];
  readonly users: readonly SeedUser[];
  readonly reviews: readonly SeedReview[];
}

export interface GenerateOptions {
  readonly seed?: number;
  readonly productsPerCategory?: number;
  readonly customers?: number;
}

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');

const COLORS = ['Black', 'White', 'Navy', 'Red', 'Sage', 'Charcoal', 'Sky Blue', 'Sand'];
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['7', '8', '9', '10', '11', '12'];
const CAPACITIES = ['Small', 'Medium', 'Large'];
const REVIEW_TITLES: Record<number, readonly string[]> = {
  1: ['Disappointed', 'Did not work for me', 'Would not buy again'],
  2: ['Not great', 'Expected more', 'Just okay'],
  3: ['Decent', 'Fine for the price', 'Does the job'],
  4: ['Really good', 'Happy with it', 'Solid choice'],
  5: ['Love it!', 'Excellent', 'Exactly what I wanted', 'Five stars'],
};

function variantsFor(
  f: Faker,
  spec: CategorySpec,
  skuBase: string,
  priceCents: number,
): SeedVariant[] {
  const stock = () => (f.number.float() < 0.06 ? 0 : f.number.int({ min: 1, max: 60 }));
  const one = (options: Record<string, string>, i: number, price: number | null = null) => ({
    sku: `${skuBase}-${String(i + 1).padStart(2, '0')}`,
    options,
    priceCents: price,
    stock: stock(),
  });
  switch (spec.options) {
    case 'apparel': {
      const colors = f.helpers.arrayElements(COLORS, { min: 1, max: 3 });
      const sizes = APPAREL_SIZES.slice(f.number.int({ min: 0, max: 1 }));
      return colors.flatMap((color, ci) =>
        sizes.map((size, si) => one({ Color: color, Size: size }, ci * sizes.length + si)),
      );
    }
    case 'shoes':
      return SHOE_SIZES.map((size, i) => one({ Size: size }, i));
    case 'color':
      return f.helpers
        .arrayElements(COLORS, { min: 2, max: 4 })
        .map((color, i) => one({ Color: color }, i));
    case 'capacity':
      return CAPACITIES.map((size, i) =>
        one({ Size: size }, i, Math.round((priceCents * (1 + i * 0.3)) / 100) * 100 - 1),
      );
    case 'none':
      return [one({}, 0)];
  }
}

function specsFor(
  f: Faker,
  department: DepartmentSpec,
  brand: string,
): (readonly [string, string])[] {
  const model = `${brand.slice(0, 3).toUpperCase()}-${String(f.number.int({ min: 100, max: 9999 }))}`;
  const common: (readonly [string, string])[] = [
    ['Brand', brand],
    ['Model', model],
  ];
  if (department.slug === 'grocery') return [...common, ['Storage', 'Keep in a cool, dry place']];
  if (department.slug === 'books') {
    return [
      ...common,
      ['Pages', String(f.number.int({ min: 96, max: 640 }))],
      ['Format', 'Paperback'],
    ];
  }
  return [
    ...common,
    ['Weight', `${String(f.number.float({ min: 0.2, max: 25, fractionDigits: 1 }))} lb`],
    ['Warranty', f.helpers.arrayElement(['90 days', '1 year', '2 years'])],
  ];
}

export function generateCatalog(options: GenerateOptions = {}): SeedData {
  const f = new Faker({ locale: [en] });
  f.seed(options.seed ?? 2026);
  f.setDefaultRefDate(new Date('2026-10-01T00:00:00Z'));
  const perCategory = options.productsPerCategory ?? 16;

  const users: SeedUser[] = [{ email: 'admin@shop.test', name: 'Store Admin', role: 'admin' }];
  for (let i = 1; i <= (options.customers ?? 40); i += 1) {
    const first = f.person.firstName();
    const last = f.person.lastName();
    users.push({
      email: `${slugify(first)}.${slugify(last)}${String(i)}@example.com`,
      name: `${first} ${last}`,
      role: 'customer',
    });
  }
  const customers = users.filter((u) => u.role === 'customer').map((u) => u.email);

  const products: SeedProduct[] = [];
  const reviews: SeedReview[] = [];
  for (const department of DEPARTMENTS) {
    for (const category of department.categories) {
      for (let n = 0; n < perCategory; n += 1) {
        const brand = f.helpers.arrayElement(department.brands);
        const noun = f.helpers.arrayElement(category.nouns);
        const name = `${brand} ${f.commerce.productAdjective()} ${noun}`;
        const slug = `${slugify(name)}-${String(products.length + 1)}`;
        const [min, max] = category.price;
        const priceCents = f.number.int({ min, max }) * 100 - 1;
        const onSale = f.number.float() < 0.25;
        const salePriceCents = onSale
          ? Math.round((priceCents * f.number.float({ min: 0.65, max: 0.9 })) / 100) * 100 - 1
          : null;
        const productReviews: SeedReview[] = [];
        if (f.number.float() < 0.6) {
          for (const user of f.helpers.arrayElements(customers, { min: 1, max: 8 })) {
            const rating = f.helpers.weightedArrayElement([
              { weight: 1, value: 1 },
              { weight: 1, value: 2 },
              { weight: 3, value: 3 },
              { weight: 6, value: 4 },
              { weight: 7, value: 5 },
            ]);
            productReviews.push({
              product: slug,
              user,
              rating,
              title: f.helpers.arrayElement(REVIEW_TITLES[rating] ?? ['Review']),
              body: f.lorem.sentences({ min: 1, max: 4 }),
              createdAt: f.date.recent({ days: 300 }),
            });
          }
        }
        reviews.push(...productReviews);
        const imageCount = f.number.int({ min: 2, max: 4 });
        products.push({
          slug,
          name,
          description: `${f.commerce.productDescription()} ${f.lorem.sentences(2)}`,
          department: department.slug,
          category: category.slug,
          brand,
          priceCents,
          salePriceCents:
            salePriceCents !== null && salePriceCents < priceCents ? salePriceCents : null,
          taxable: department.taxable,
          specs: specsFor(f, department, brand),
          createdAt: f.date.past({ years: 1 }),
          variants: variantsFor(
            f,
            category,
            `${department.slug.slice(0, 3).toUpperCase()}${String(products.length + 1).padStart(4, '0')}`,
            priceCents,
          ),
          images: Array.from({ length: imageCount }, (_, i) => ({
            url: `/img/p/${slug}/${String(i + 1)}.svg`,
            alt: i === 0 ? name : `${name}, view ${String(i + 1)}`,
          })),
          ratingSum: productReviews.reduce((sum, r) => sum + r.rating, 0),
          ratingCount: productReviews.length,
        });
      }
    }
  }
  const brands = [...new Set(DEPARTMENTS.flatMap((d) => d.brands))];
  return { departments: DEPARTMENTS, brands, products, users, reviews };
}
