// Templates for <shop-admin-product> (product-edit.ts): the product form, archive control,
// variants with per-variant edit and stock forms, and the inventory log.
import { html, nothing, type IntentNames } from '@gyral/core';
import {
  dollarsText,
  imagesText,
  optionsLabel,
  optionsText,
  type ProductEdit,
  type Taxonomy,
} from '../../domain/admin.js';
import { formError, formKey, selectField, textArea, textField, type Errors } from './fields.js';
import { dateTime } from './format.js';
import type { ProductEditMsg, ProductEditState } from './product-edit.js';

type I = IntentNames<ProductEditMsg>;
const NO_ERRORS: Errors = {};

const errorsOf = (s: ProductEditState, key: string): Errors => s.errors[key] ?? NO_ERRORS;

function productForm(s: ProductEditState, i: I, taxonomy: Taxonomy) {
  const p = s.edit?.product;
  const errors = errorsOf(s, formKey('SaveProduct'));
  const draft = s.drafts[formKey('SaveProduct')];
  const f = 'product';
  const departments = taxonomy.departments.map((d) => ({ value: String(d.id), label: d.name }));
  const deptName = new Map(taxonomy.departments.map((d) => [d.id, d.name]));
  const categories = taxonomy.categories.map((c) => ({
    value: String(c.id),
    label: c.name,
    group: deptName.get(c.departmentId) ?? 'Other',
  }));
  const brands = taxonomy.brands.map((b) => ({ value: String(b.id), label: b.name }));
  const busy = s.pending === formKey('SaveProduct');
  return html`<form class="admin-form" data-intent=${i.SaveProduct} data-component="product-form">
    ${formError(errors)}
    <fieldset>
      <legend>Details</legend>
      ${textField({ form: f, name: 'name', label: 'Name', errors, draft, value: p?.name ?? '', required: true })}
      ${textField({
        form: f,
        name: 'slug',
        label: 'URL slug',
        hint: 'Lowercase words joined by hyphens; the product page is /p/<slug>.',
        errors,
        draft,
        value: p?.slug ?? '',
        required: true,
      })}
      ${textArea({ form: f, name: 'description', label: 'Description', errors, draft, value: p?.description ?? '', rows: 5, required: true })}
    </fieldset>
    <fieldset>
      <legend>Placement</legend>
      <div class="admin-row">
        ${selectField({ form: f, name: 'departmentId', label: 'Department', errors, draft, value: p === undefined ? '' : String(p.departmentId), choices: departments, required: true })}
        ${selectField({ form: f, name: 'categoryId', label: 'Category', errors, draft, value: p === undefined ? '' : String(p.categoryId), choices: categories, required: true })}
        ${selectField({ form: f, name: 'brandId', label: 'Brand', errors, draft, value: p === undefined ? '' : String(p.brandId), choices: brands, required: true })}
      </div>
    </fieldset>
    <fieldset>
      <legend>Pricing</legend>
      <div class="admin-row">
        ${textField({ form: f, name: 'price', label: 'Price (USD)', errors, draft, value: p === undefined ? '' : dollarsText(p.priceCents), inputmode: 'decimal', required: true })}
        ${textField({
          form: f,
          name: 'salePrice',
          label: 'Sale price (USD)',
          hint: 'Leave empty when not on sale.',
          errors,
          draft,
          value: p === undefined || p.salePriceCents === null ? '' : dollarsText(p.salePriceCents),
          inputmode: 'decimal',
        })}
      </div>
    </fieldset>
    <fieldset>
      <legend>Images</legend>
      ${textArea({
        form: f,
        name: 'images',
        label: 'Image URLs',
        hint: 'One per line: a URL, then optionally | alt text.',
        errors,
        draft,
        value: imagesText(s.edit?.images ?? []),
        rows: 3,
      })}
    </fieldset>
    <div class="admin-actions">
      <button type="submit" ?disabled=${busy}>
        ${s.id === 0 ? 'Create product' : 'Save product'}
      </button>
    </div>
  </form>`;
}

function archiveForm(s: ProductEditState, i: I, archived: boolean) {
  return html`<form class="admin-actions" data-intent=${i.Archive} data-component="archive-form">
    <input type="hidden" name="archived" value=${archived ? 'no' : 'yes'} />
    <p>
      ${archived ? 'This product is archived: shoppers can’t see it.' : 'This product is live.'}
    </p>
    <button
      type="submit"
      data-variant=${archived ? 'quiet' : 'danger'}
      ?disabled=${s.pending === formKey('Archive')}
    >
      ${archived ? 'Restore product' : 'Archive product'}
    </button>
  </form>`;
}

function variantForms(s: ProductEditState, i: I, variant: ProductEdit['variants'][number]) {
  const id = String(variant.id);
  const editErrors = errorsOf(s, formKey('SaveVariant', variant.id));
  const stockErrors = errorsOf(s, formKey('Adjust', variant.id));
  const label = optionsLabel(variant.options);
  return html`<article
    class="admin-variant"
    data-component="variant"
    aria-labelledby=${`v${id}-title`}
  >
    <h3 id=${`v${id}-title`}>
      <code>${variant.sku}</code>${label === '' ? nothing : html` · ${label}`}
      <span
        data-component="stock"
        data-stock=${variant.stock === 0 ? 'out' : variant.stock <= 5 ? 'low' : nothing}
      >
        ${variant.stock} in stock
      </span>
    </h3>
    <form class="admin-form" data-intent=${i.SaveVariant} data-component="variant-form">
      <input type="hidden" name="variantId" value=${id} />
      ${formError(editErrors)}
      <div class="admin-row">
        ${textField({ form: `v${id}`, name: 'sku', label: 'SKU', errors: editErrors, draft: s.drafts[formKey('SaveVariant', variant.id)], value: variant.sku, required: true })}
        ${textField({ form: `v${id}`, name: 'options', label: 'Options', hint: 'e.g. Size=M; Color=Navy', errors: editErrors, draft: s.drafts[formKey('SaveVariant', variant.id)], value: optionsText(variant.options) })}
        ${textField({ form: `v${id}`, name: 'price', label: 'Price override (USD)', errors: editErrors, draft: s.drafts[formKey('SaveVariant', variant.id)], value: variant.priceCents === null ? '' : dollarsText(variant.priceCents), inputmode: 'decimal' })}
      </div>
      <div class="admin-actions">
        <button
          type="submit"
          data-variant="quiet"
          ?disabled=${s.pending === formKey('SaveVariant', variant.id)}
        >
          Save variant
        </button>
      </div>
    </form>
    <form class="admin-form" data-intent=${i.Adjust} data-component="stock-form">
      <input type="hidden" name="variantId" value=${id} />
      ${formError(stockErrors)}
      <div class="admin-row">
        ${textField({ form: `s${id}`, name: 'delta', label: 'Add or remove units', hint: 'Negative numbers remove stock.', errors: stockErrors, draft: s.drafts[formKey('Adjust', variant.id)], value: '', inputmode: 'numeric', required: true })}
        ${textField({ form: `s${id}`, name: 'reason', label: 'Reason', hint: 'e.g. Delivery, Damaged, Stock count', errors: stockErrors, draft: s.drafts[formKey('Adjust', variant.id)], value: '', required: true })}
      </div>
      <div class="admin-actions">
        <button type="submit" ?disabled=${s.pending === formKey('Adjust', variant.id)}>
          Adjust stock
        </button>
      </div>
    </form>
  </article>`;
}

function addVariantForm(s: ProductEditState, i: I) {
  const errors = errorsOf(s, formKey('AddVariant'));
  const draft = s.drafts[formKey('AddVariant')];
  return html`<form
    class="admin-form"
    data-intent=${i.AddVariant}
    data-component="add-variant-form"
  >
    <h3>Add a variant</h3>
    ${formError(errors)}
    <div class="admin-row">
      ${textField({ form: 'new-variant', name: 'sku', label: 'SKU', errors, draft, value: '', required: true })}
      ${textField({ form: 'new-variant', name: 'options', label: 'Options', hint: 'e.g. Size=M; Color=Navy', errors, draft, value: '' })}
      ${textField({ form: 'new-variant', name: 'price', label: 'Price override (USD)', errors, draft, value: '', inputmode: 'decimal' })}
    </div>
    <div class="admin-actions">
      <button type="submit" data-variant="quiet" ?disabled=${s.pending === formKey('AddVariant')}>
        Add variant
      </button>
    </div>
  </form>`;
}

function inventoryLog(log: ProductEdit['log']) {
  return html`<section aria-labelledby="log-heading" data-region="admin-inventory-log">
    <h2 id="log-heading">Recent stock changes</h2>
    ${
      log.length === 0
        ? html`<p data-component="empty">No stock changes yet.</p>`
        : html`<div
            class="admin-table-wrap"
            tabindex="0"
            role="region"
            aria-label="Recent stock changes"
          >
            <table class="admin-table" data-component="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">SKU</th>
                  <th scope="col" class="num">Change</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                ${log.map(
                  (e) =>
                    html`<tr>
                      <td><time datetime=${e.at}>${dateTime.format(new Date(e.at))}</time></td>
                      <td><code>${e.sku}</code></td>
                      <td class="num">${e.delta > 0 ? `+${String(e.delta)}` : e.delta}</td>
                      <td>${e.reason}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
    }
  </section>`;
}

export function productEditView(s: ProductEditState, i: I) {
  const p = s.edit?.product;
  const title = s.id === 0 ? 'New product' : p === undefined ? 'Edit product' : `Edit ${p.name}`;
  return html`<section class="admin-page" data-region="admin-product">
    <p class="crumbs"><a href="/admin/products">All products</a></p>
    <h1 tabindex="-1">${title}</h1>
    ${p === undefined ? nothing : html`<p><a href=${`/p/${p.slug}`}>View in the store</a></p>`}
    ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
    <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
      ${s.notice}
    </p>
    ${
      s.taxonomy === null || (s.id !== 0 && s.edit === null)
        ? s.error === null
          ? html`<p role="status" data-component="loading">Loading…</p>`
          : nothing
        : html`<section aria-label="Product details">${productForm(s, i, s.taxonomy)}</section>
            ${
              s.edit === null
                ? nothing
                : html`<section aria-labelledby="variants-heading" data-region="admin-variants">
                      <h2 id="variants-heading">Variants and stock</h2>
                      ${s.edit.variants.map((variant) => variantForms(s, i, variant))}
                      ${addVariantForm(s, i)}
                    </section>
                    ${inventoryLog(s.edit.log)}
                    <section aria-label="Archive" data-region="admin-archive">
                      ${archiveForm(s, i, s.edit.product.archived)}
                    </section>`
            }`
    }
  </section>`;
}
