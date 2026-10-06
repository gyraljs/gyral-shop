// <shop-admin-taxonomy>: create, rename, archive and restore departments, categories and brands
// (docs/product-specs/admin.md). Archived ones are hidden from shoppers; the server refuses to
// archive one that live products still use. Renames update the search index (shop-eyl).
import {
  define,
  fieldErrors,
  form,
  html,
  invalid,
  nothing,
  type IntentRejected,
  type Next,
} from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import * as v from 'valibot';
import { RenameForm } from './schemas.js';
import {
  TAXON_KINDS,
  TaxonomyAdminSchema,
  type TaxonKindName,
  type TaxonomyAdmin,
} from '../../domain/admin-manage.js';
import { adminDrivers } from './drivers.js';
import {
  drafted,
  draftOf,
  formError,
  formKey,
  selectField,
  textField,
  type Drafts,
  type Errors,
} from './fields.js';
import { loadError } from './format.js';
import { TaxonArchiveForm, TaxonCreateForm } from './manage-schemas.js';

export interface TaxonomyState {
  readonly tree: TaxonomyAdmin | null;
  readonly error: string | null;
  readonly notice: string | null;
  /** Errors per form: `Create`, or `Rename`/`Archive` plus kind and id. */
  readonly errors: Readonly<Record<string, Errors>>;
  readonly pending: string | null;
  /** What each form last sent, keyed like `errors`, until the tree reloads. */
  readonly drafts: Drafts;
}

type Submit<T extends string> = { readonly _tag: T; readonly form: FormData; readonly key: string };

export type TaxonomyMsg =
  | Submit<'CreateTaxon'>
  | Submit<'Rename'>
  | Submit<'ArchiveTaxon'>
  | { readonly _tag: 'Done'; readonly notice: string }
  | { readonly _tag: 'Loaded'; readonly tree: TaxonomyAdmin }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

type Taxon = TaxonomyAdmin['brands'][number];

const load = () =>
  get('/api/admin/taxonomy/manage', {
    schema: TaxonomyAdminSchema,
    onSuccess: (tree): TaxonomyMsg => ({ _tag: 'Loaded', tree }),
    onFailure: (error): TaxonomyMsg => ({ _tag: 'Failed', error }),
    key: 'admin-taxonomy',
    concurrency: 'switch',
  });

const target = (raw: FormData) => {
  const id = raw.get('id');
  return {
    kind: TAXON_KINDS.find((k) => k === raw.get('kind')) ?? 'brand',
    id: typeof id === 'string' ? id : '',
  };
};

const keyOf = (intent: string, raw: FormData) => {
  const t = target(raw);
  return formKey(intent, `${t.kind}${t.id}`);
};

function urlOf(m: Submit<string>): string {
  const t = target(m.form);
  if (m._tag === 'CreateTaxon') return '/api/admin/taxonomy';
  if (m._tag === 'Rename') return `/api/admin/taxonomy/${t.kind}/${t.id}`;
  return `/api/admin/taxonomy/${t.kind}/${t.id}/archive`;
}

const DONE: Readonly<Record<string, string>> = {
  CreateTaxon: 'Added.',
  Rename: 'Renamed. Search results and menus show the new name.',
  ArchiveTaxon: 'Saved.',
};

function send(s: TaxonomyState, m: Submit<string>): Next<TaxonomyState, TaxonomyMsg> {
  const errors = Object.fromEntries(Object.entries(s.errors).filter(([k]) => k !== m.key));
  return [
    {
      ...s,
      pending: m.key,
      errors,
      notice: null,
      drafts: { ...s.drafts, [m.key]: draftOf(m.form) },
    },
    [
      submitForm(urlOf(m), m.form, {
        onSuccess: (body): TaxonomyMsg | undefined =>
          v.is(v.object({ _tag: v.literal('Saved') }), body)
            ? { _tag: 'Done', notice: DONE[m._tag] ?? 'Saved.' }
            : undefined,
        onFailure: (error): TaxonomyMsg => ({ _tag: 'Failed', error }),
        key: `admin-taxonomy-form:${m.key}`,
      }),
    ],
  ];
}

function rejected(s: TaxonomyState, m: IntentRejected): TaxonomyState {
  const { kind, id } = m.values ?? {};
  const key =
    s.pending ??
    (typeof kind === 'string' && typeof id === 'string' && m.intent !== 'CreateTaxon'
      ? formKey(m.intent, `${kind}${id}`)
      : formKey(m.intent));
  const drafts = m.values === undefined ? s.drafts : { ...s.drafts, [key]: m.values };
  return { ...s, pending: null, errors: { ...s.errors, [key]: fieldErrors(m.issues) }, drafts };
}

type I = { Rename: string; ArchiveTaxon: string; CreateTaxon: string };

function item(s: TaxonomyState, i: I, kind: TaxonKindName, t: Taxon, extra: unknown = nothing) {
  const tag = `${kind}${String(t.id)}`;
  const renameErrors = s.errors[formKey('Rename', tag)] ?? {};
  const archiveErrors = s.errors[formKey('ArchiveTaxon', tag)] ?? {};
  return html`<li
    data-component="taxon"
    data-kind=${kind}
    data-archived=${t.archived ? 'yes' : 'no'}
  >
    <p>
      <strong>${t.name}</strong> <code>${t.slug}</code> · ${t.products} live
      ${t.products === 1 ? 'product' : 'products'}${t.archived ? ' · Archived' : ''}
    </p>
    <div class="admin-actions">
      <form class="inline" data-intent=${i.Rename} data-component="taxon-rename">
        <input type="hidden" name="kind" value=${kind} />
        <input type="hidden" name="id" value=${String(t.id)} />
        <label>
          <span class="visually-hidden">New name for ${t.name}</span>
          <input
            name="name"
            value=${drafted(s.drafts[formKey('Rename', tag)], 'name', t.name)}
            required
            ${invalid(renameErrors['name'])}
          />
        </label>
        <button
          type="submit"
          data-variant="quiet"
          ?disabled=${s.pending === formKey('Rename', tag)}
        >
          Rename<span class="visually-hidden"> ${t.name}</span>
        </button>
      </form>
      <form class="inline" data-intent=${i.ArchiveTaxon} data-component="taxon-archive">
        <input type="hidden" name="kind" value=${kind} />
        <input type="hidden" name="id" value=${String(t.id)} />
        <input type="hidden" name="archived" value=${t.archived ? 'no' : 'yes'} />
        <button
          type="submit"
          data-variant=${t.archived ? 'quiet' : 'danger'}
          ?disabled=${s.pending === formKey('ArchiveTaxon', tag)}
        >
          ${t.archived ? 'Restore' : 'Archive'}<span class="visually-hidden"> ${t.name}</span>
        </button>
      </form>
    </div>
    ${renameErrors['name'] === undefined ? nothing : html`<p class="field-error">${renameErrors['name'].join(' ')}</p>`}
    ${formError(archiveErrors)} ${formError(renameErrors)} ${extra}
  </li>`;
}

function createForm(s: TaxonomyState, i: I, tree: TaxonomyAdmin) {
  const errors = s.errors[formKey('CreateTaxon')] ?? {};
  const draft = s.drafts[formKey('CreateTaxon')];
  const f = 'taxon';
  return html`<form class="admin-form" data-intent=${i.CreateTaxon} data-component="taxon-create">
    <h2>Add a department, category or brand</h2>
    ${formError(errors)}
    <div class="admin-row">
      ${selectField({
        form: f,
        name: 'kind',
        label: 'Add a',
        errors,
        draft,
        value: 'brand',
        emptyLabel: null,
        choices: [
          { value: 'department', label: 'Department' },
          { value: 'category', label: 'Category' },
          { value: 'brand', label: 'Brand' },
        ],
        required: true,
      })}
      ${textField({ form: f, name: 'name', label: 'Name', errors, draft, value: '', required: true })}
      ${textField({ form: f, name: 'slug', label: 'URL slug', hint: 'Optional; made from the name.', errors, draft, value: '' })}
      ${selectField({
        form: f,
        name: 'departmentId',
        label: 'Department (for a category)',
        errors,
        draft,
        value: '',
        emptyLabel: 'Not a category',
        choices: tree.departments
          .filter((d) => !d.archived)
          .map((d) => ({ value: String(d.id), label: d.name })),
      })}
    </div>
    <div class="admin-actions">
      <button type="submit" ?disabled=${s.pending === formKey('CreateTaxon')}>Add</button>
    </div>
  </form>`;
}

const submitted =
  <T extends 'CreateTaxon' | 'Rename' | 'ArchiveTaxon'>(tag: T) =>
  (_data: unknown, raw: FormData) => ({
    _tag: tag,
    form: raw,
    key: tag === 'CreateTaxon' ? formKey(tag) : keyOf(tag, raw),
  });

export const AdminTaxonomy = define<TaxonomyState, TaxonomyMsg>('shop-admin-taxonomy', {
  shadow: false,
  init: () => [
    { tree: null, error: null, notice: null, errors: {}, pending: null, drafts: {} },
    [load()],
  ],
  intent: {
    CreateTaxon: form(TaxonCreateForm, submitted('CreateTaxon')),
    Rename: form(RenameForm, submitted('Rename')),
    ArchiveTaxon: form(TaxonArchiveForm, submitted('ArchiveTaxon')),
  },
  update: {
    CreateTaxon: send,
    Rename: send,
    ArchiveTaxon: send,
    Done: (s, m) => [{ ...s, pending: null, notice: m.notice }, [load()]],
    Loaded: (s, m) => ({ ...s, tree: m.tree, error: null, drafts: {} }),
    Failed: (s, m) => ({ ...s, pending: null, error: loadError(m.error) }),
    IntentRejected: rejected,
  },
  drivers: adminDrivers,
  view: (s, i) =>
    html`<section class="admin-page" data-region="admin-taxonomy">
      <h1 tabindex="-1">Departments &amp; brands</h1>
      ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
      <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
        ${s.notice ?? nothing}
      </p>
      ${
        s.tree === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : html`<section aria-label="Add">${createForm(s, i, s.tree)}</section>
              <section aria-labelledby="departments-heading" data-region="admin-departments">
                <h2 id="departments-heading">Departments and categories</h2>
                <ul class="admin-taxa">
                  ${s.tree.departments.map((d) =>
                    item(
                      s,
                      i,
                      'department',
                      d,
                      html`<ul class="admin-taxa" aria-label=${`Categories in ${d.name}`}>
                        ${d.categories.map((c) => item(s, i, 'category', c))}
                      </ul>`,
                    ),
                  )}
                </ul>
              </section>
              <section aria-labelledby="brands-heading" data-region="admin-brands">
                <h2 id="brands-heading">Brands</h2>
                <ul class="admin-taxa">
                  ${s.tree.brands.map((b) => item(s, i, 'brand', b))}
                </ul>
              </section>`
      }
    </section>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-taxonomy': InstanceType<typeof AdminTaxonomy>;
  }
}
