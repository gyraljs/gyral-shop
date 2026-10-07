// <shop-admin-product>: create or edit a product, its variants and stock
// (docs/product-specs/admin.md, "Products" and "Inventory"). Each form validates in the browser
// with the shared schema (form()), then posts with submitForm; the API answers with JSON or a
// 422 IntentRejected that lands in the same error state as a browser-side rejection.
import { define, fieldErrors, form, prop, type IntentRejected, type Next } from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import {
  AdjustedSchema,
  ProductEditSchema,
  SavedSchema,
  TaxonomySchema,
  type ProductEdit,
  type Taxonomy,
} from '../../domain/admin.js';
import { adminDrivers } from './drivers.js';
import { formKey, savedOnce, type Errors, type Saves } from './fields.js';
import { loadError } from './format.js';
import { productEditView } from './product-views.js';
import { AdjustForm, ArchiveForm, ProductForm, VariantForm } from './schemas.js';

export interface ProductEditProps {
  /** The product to edit; 0 for a new product. */
  readonly productId: number;
}

export interface ProductEditState {
  readonly id: number;
  readonly edit: ProductEdit | null;
  readonly taxonomy: Taxonomy | null;
  readonly error: string | null;
  readonly notice: string | null;
  /** Errors per form, keyed by intent (plus the variant id for per-variant forms). */
  readonly errors: Readonly<Record<string, Errors>>;
  /** The form whose request is in flight (its key), for disabling buttons and server 422s. */
  readonly pending: string | null;
  /** Successes per form, keyed like `errors`: one-shot forms start empty after one. */
  readonly saves: Saves;
}

type Submit<T extends string> = {
  readonly _tag: T;
  readonly form: FormData;
  readonly variantId: number;
};

export type ProductEditMsg =
  | Submit<'SaveProduct'>
  | Submit<'Archive'>
  | Submit<'AddVariant'>
  | Submit<'SaveVariant'>
  | Submit<'Adjust'>
  | { readonly _tag: 'Loaded'; readonly edit: ProductEdit }
  | { readonly _tag: 'TaxonomyLoaded'; readonly taxonomy: Taxonomy }
  | { readonly _tag: 'Saved'; readonly id: number; readonly notice: string }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const loadProduct = (id: number) =>
  get(`/api/admin/products/${String(id)}`, {
    schema: ProductEditSchema,
    onSuccess: (edit): ProductEditMsg => ({ _tag: 'Loaded', edit }),
    onFailure: (error): ProductEditMsg => ({ _tag: 'Failed', error }),
    key: 'admin-product',
    concurrency: 'switch',
  });

const loadTaxonomy = () =>
  get('/api/admin/taxonomy', {
    schema: TaxonomySchema,
    onSuccess: (taxonomy): ProductEditMsg => ({ _tag: 'TaxonomyLoaded', taxonomy }),
    onFailure: (error): ProductEditMsg => ({ _tag: 'Failed', error }),
    key: 'admin-product',
  });

const variantOf = (data: FormData): number => Number(data.get('variantId') ?? 0);

const submitted =
  <T extends Submit<string>['_tag']>(tag: T) =>
  (_data: unknown, raw: FormData) => ({ _tag: tag, form: raw, variantId: variantOf(raw) });

const NOTICES = {
  SaveProduct: 'Product saved.',
  Archive: 'Archive status saved.',
  AddVariant: 'Variant added. Adjust its stock below.',
  SaveVariant: 'Variant saved.',
  Adjust: 'Stock adjusted.',
} as const;

function urlOf(s: ProductEditState, m: Submit<keyof typeof NOTICES>): string {
  const product = `/api/admin/products/${String(s.id)}`;
  switch (m._tag) {
    case 'SaveProduct':
      return s.id === 0 ? '/api/admin/products' : product;
    case 'Archive':
      return `${product}/archive`;
    case 'AddVariant':
      return `${product}/variants`;
    case 'SaveVariant':
      return `/api/admin/variants/${String(m.variantId)}`;
    case 'Adjust':
      return `/api/admin/variants/${String(m.variantId)}/adjust`;
  }
}

function submit(
  s: ProductEditState,
  m: Submit<keyof typeof NOTICES>,
): Next<ProductEditState, ProductEditMsg> {
  const key = formKey(m._tag, m._tag === 'SaveVariant' || m._tag === 'Adjust' ? m.variantId : '');
  const errors = Object.fromEntries(Object.entries(s.errors).filter(([k]) => k !== key));
  return [
    { ...s, pending: key, errors, notice: null },
    [
      submitForm(urlOf(s, m), m.form, {
        onSuccess: (body): ProductEditMsg | undefined => {
          const saved = v.safeParse(v.union([SavedSchema, AdjustedSchema]), body);
          if (!saved.success) return undefined;
          return {
            _tag: 'Saved',
            id: saved.output._tag === 'Saved' ? saved.output.id : s.id,
            notice: NOTICES[m._tag],
          };
        },
        onFailure: (error): ProductEditMsg => ({ _tag: 'Failed', error }),
        key: `admin-form:${key}`,
      }),
    ],
  ];
}

function rejected(s: ProductEditState, m: IntentRejected): ProductEditState {
  const fromBrowser = m.values?.['variantId'];
  const key =
    typeof fromBrowser === 'string'
      ? formKey(m.intent, fromBrowser)
      : (s.pending ?? formKey(m.intent));
  return { ...s, pending: null, errors: { ...s.errors, [key]: fieldErrors(m.issues) } };
}

export const AdminProductEdit = define<ProductEditState, ProductEditMsg, ProductEditProps>(
  'shop-admin-product',
  {
    shadow: false,
    props: { productId: prop.number({ default: 0 }) },
    init: (props) => [
      {
        id: props.productId,
        edit: null,
        taxonomy: null,
        error: null,
        notice: null,
        errors: {},
        pending: null,
        saves: {},
      },
      [props.productId === 0 ? loadTaxonomy() : loadProduct(props.productId)],
    ],
    intent: {
      SaveProduct: form(ProductForm, submitted('SaveProduct')),
      Archive: form(ArchiveForm, submitted('Archive')),
      AddVariant: form(VariantForm, submitted('AddVariant')),
      SaveVariant: form(VariantForm, submitted('SaveVariant')),
      Adjust: form(AdjustForm, submitted('Adjust')),
    },
    update: {
      SaveProduct: submit,
      Archive: submit,
      AddVariant: submit,
      SaveVariant: submit,
      Adjust: submit,
      Loaded: (s, m) => ({ ...s, edit: m.edit, taxonomy: m.edit.taxonomy, error: null }),
      TaxonomyLoaded: (s, m) => ({ ...s, taxonomy: m.taxonomy, error: null }),
      // A new product moves to its own edit page; anything else reloads the current one.
      Saved: (s, m) =>
        s.id === 0
          ? [s, [navigate(`/admin/products/${String(m.id)}`)]]
          : [
              { ...s, pending: null, notice: m.notice, saves: savedOnce(s.saves, s.pending) },
              [loadProduct(s.id)],
            ],
      Failed: (s, m) => ({ ...s, pending: null, error: loadError(m.error) }),
      IntentRejected: rejected,
    },
    drivers: adminDrivers,
    view: (s, i) => productEditView(s, i),
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-product': InstanceType<typeof AdminProductEdit>;
  }
}
