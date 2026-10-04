// Department and category pages (catalog spec). Plain data, so it can seed components.
import type { Db } from '../db/client.js';
import {
  categoryCounts,
  countProducts,
  findCategory,
  findDepartment,
  productCards,
} from '../db/repos/catalog.js';
import { pageCount, pageOffset, PAGE_SIZE, type ListingState } from '../domain/listing.js';
import { toCard, type Card } from './catalog.js';

export interface CategoryLink {
  readonly slug: string;
  readonly name: string;
  /** Number of listed (non-archived) products. */
  readonly count: number;
}

export interface DepartmentSummary {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface DepartmentPageData {
  readonly department: DepartmentSummary;
  readonly categories: readonly CategoryLink[];
  readonly topRated: readonly Card[];
  readonly deals: readonly Card[];
}

async function departmentWithCategories(db: Db, slug: string) {
  const department = await findDepartment(db, slug);
  if (department === undefined) return undefined;
  const counts = await categoryCounts(db, department.id);
  const categories = department.categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    count: counts.get(c.id) ?? 0,
  }));
  return { department, categories };
}

/** The department landing page, or undefined for an unknown slug. */
export async function departmentPage(
  db: Db,
  slug: string,
): Promise<DepartmentPageData | undefined> {
  const found = await departmentWithCategories(db, slug);
  if (found === undefined) return undefined;
  const { department, categories } = found;
  const [topRated, deals] = await Promise.all([
    productCards(db, { departmentId: department.id, order: 'rating', limit: 8 }),
    productCards(db, { departmentId: department.id, onSale: true, order: 'rating', limit: 4 }),
  ]);
  return {
    department: {
      slug: department.slug,
      name: department.name,
      description: department.description,
    },
    categories,
    topRated: topRated.map(toCard),
    deals: deals.map(toCard),
  };
}

export interface CategoryPageData {
  readonly department: DepartmentSummary;
  readonly category: { readonly slug: string; readonly name: string };
  /** All categories of the department, for side navigation. */
  readonly categories: readonly CategoryLink[];
  readonly cards: readonly Card[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export type CategoryPageResult =
  | { readonly _tag: 'Found'; readonly data: CategoryPageData }
  | { readonly _tag: 'NotFound' }
  /** The page number is past the last page (catalog spec: answered with 404). */
  | { readonly _tag: 'OutOfRange'; readonly lastPage: number };

/** One page of a category listing. */
export async function categoryPage(
  db: Db,
  departmentSlug: string,
  categorySlug: string,
  state: ListingState,
): Promise<CategoryPageResult> {
  const found = await findCategory(db, departmentSlug, categorySlug);
  if (found === undefined) return { _tag: 'NotFound' };
  const filter = { categoryId: found.category.id };
  const total = await countProducts(db, filter);
  const pages = pageCount(total);
  if (state.page > pages) return { _tag: 'OutOfRange', lastPage: pages };
  const [rows, siblings] = await Promise.all([
    productCards(db, {
      ...filter,
      order: 'rating',
      limit: PAGE_SIZE,
      offset: pageOffset(state.page),
    }),
    departmentWithCategories(db, departmentSlug),
  ]);
  const { department, category } = found;
  return {
    _tag: 'Found',
    data: {
      department: {
        slug: department.slug,
        name: department.name,
        description: department.description,
      },
      category: { slug: category.slug, name: category.name },
      categories: siblings?.categories ?? [],
      cards: rows.map(toCard),
      page: state.page,
      pageCount: pages,
      total,
    },
  };
}
