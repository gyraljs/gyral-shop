// Labelled form controls for admin forms: errors linked with aria-describedby and mirrored to
// native validity with Gyral's invalid() (ADR 0008). Ids are prefixed per form so several
// forms can sit on one page (one per variant, for example).
import { each, html, invalid, nothing, type ChildValue } from '@gyral/core';

export type Errors = Readonly<Record<string, readonly string[]>>;

/** The key a form's errors live under: its intent, plus a record id for per-row forms. */
export const formKey = (intent: string, id: number | string = ''): string =>
  `${intent}${String(id)}`;

/** How many times each form (by `formKey`) has been saved. */
export type Saves = Readonly<Record<string, number>>;

/** `saves` with one more success for the form `key` (none when no form was pending). */
export const savedOnce = (saves: Saves, key: string | null): Saves =>
  key === null ? saves : { ...saves, [key]: (saves[key] ?? 0) + 1 };

/**
 * A form whose fields start empty again after each success (a stock adjustment, a new variant
 * or taxon). Gyral writes a control only when the model's value for it changes, and these
 * fields have no model value, so a success re-creates the form instead: a one-row keyed list
 * whose key counts the form's successes (Gyral view/02-bindings.md "Putting a control back").
 * Until then, what the admin typed stays, through rejections and failures alike.
 */
export const freshAfterSave = (key: string, saves: Saves, form: () => ChildValue) =>
  each(
    [`${key}#${String(saves[key] ?? 0)}`],
    (k) => k,
    (_k, render: () => ChildValue) => render(),
    () => form,
  );

interface Common {
  readonly form: string;
  readonly name: string;
  readonly label: string;
  readonly errors: Errors;
  readonly hint?: string;
  readonly required?: boolean;
}

const ids = (c: Common) => {
  const id = `${c.form}-${c.name}`;
  const described = [c.hint === undefined ? '' : `${id}-hint`, `${id}-error`]
    .filter((x) => x !== '')
    .join(' ');
  return { id, described };
};

function frame(c: Common, control: unknown) {
  const { id } = ids(c);
  const errors = c.errors[c.name];
  return html`<label for=${id}>
      ${c.label}
      ${c.hint === undefined ? nothing : html`<span class="hint" id=${`${id}-hint`}>${c.hint}</span>`}
    </label>
    ${control}
    <p class="field-error" id=${`${id}-error`}>
      ${errors === undefined ? nothing : errors.join(' ')}
    </p>`;
}

export function textField(
  c: Common & {
    readonly value: string;
    readonly type?: 'text' | 'url' | 'number' | 'date';
    readonly inputmode?: 'decimal' | 'numeric';
    readonly autocomplete?: string;
  },
) {
  const { id, described } = ids(c);
  const errors = c.errors[c.name];
  return html`<div class="admin-field" data-component="field">
    ${frame(
      c,
      html`<input
        id=${id}
        name=${c.name}
        type=${c.type ?? 'text'}
        inputmode=${c.inputmode}
        autocomplete=${c.autocomplete ?? 'off'}
        value=${c.value}
        ?required=${c.required ?? false}
        aria-describedby=${described}
        ${invalid(errors)}
      />`,
    )}
  </div>`;
}

export function textArea(c: Common & { readonly value: string; readonly rows?: number }) {
  const { id, described } = ids(c);
  const errors = c.errors[c.name];
  return html`<div class="admin-field" data-component="field">
    ${frame(
      c,
      html`<textarea
        id=${id}
        name=${c.name}
        rows=${c.rows ?? 4}
        ?required=${c.required ?? false}
        aria-describedby=${described}
        ${invalid(errors)}
      >
${c.value}</textarea>`,
    )}
  </div>`;
}

export interface Choice {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

export function selectField(
  c: Common & {
    readonly value: string;
    readonly choices: readonly Choice[];
    /** The label of the empty choice; omit it to leave no empty choice. Default "Choose…". */
    readonly emptyLabel?: string | null;
  },
) {
  const { id, described } = ids(c);
  const errors = c.errors[c.name];
  const option = (o: Choice) =>
    html`<option value=${o.value} ?selected=${o.value === c.value}>${o.label}</option>`;
  const groups = [...new Set(c.choices.map((o) => o.group))];
  return html`<div class="admin-field" data-component="field">
    ${frame(
      c,
      html`<select
        id=${id}
        name=${c.name}
        ?required=${c.required ?? false}
        aria-describedby=${described}
        ${invalid(errors)}
      >
        ${
          c.emptyLabel === null
            ? nothing
            : html`<option value="" ?selected=${c.value === ''}>
                ${c.emptyLabel ?? 'Choose…'}
              </option>`
        }
        ${groups.map((group) =>
          group === undefined
            ? c.choices.filter((o) => o.group === undefined).map(option)
            : html`<optgroup label=${group}>
                ${c.choices.filter((o) => o.group === group).map(option)}
              </optgroup>`,
        )}
      </select>`,
    )}
  </div>`;
}

/** A form-level message (path ''), e.g. a server rejection that isn't about one field. */
export const formError = (errors: Errors) => {
  const message = errors[''];
  return message === undefined
    ? nothing
    : html`<p role="alert" data-component="notice" data-kind="error">${message.join(' ')}</p>`;
};
