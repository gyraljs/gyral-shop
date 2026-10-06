// Labelled form controls for admin forms: errors linked with aria-describedby and mirrored to
// native validity with Gyral's invalid() (ADR 0008). Ids are prefixed per form so several
// forms can sit on one page (one per variant, for example).
import { formDataToObject, formFields, html, invalid, nothing, type FormFields } from '@gyral/core';

export type Errors = Readonly<Record<string, readonly string[]>>;

/**
 * What each form last sent (or the browser rejected), keyed like errors. Form state is live in
 * Gyral 0.3 (view/02-bindings.md): every render writes the model's value into the control, so
 * until the server's answer reloads the record, the model keeps the admin's own input.
 */
export type Drafts = Readonly<Record<string, FormFields>>;

/** A form submission's text fields, for `Drafts`. */
export const draftOf = (data: FormData): FormFields => formFields(formDataToObject(data));

/** The drafted value of `name`, else the record's. */
export const drafted = (draft: FormFields | undefined, name: string, value: string): string => {
  const sent = draft?.[name];
  return typeof sent === 'string' ? sent : value;
};

/** The key a form's errors live under: its intent, plus a record id for per-row forms. */
export const formKey = (intent: string, id: number | string = ''): string =>
  `${intent}${String(id)}`;

interface Common {
  readonly form: string;
  readonly name: string;
  readonly label: string;
  readonly errors: Errors;
  /** The form's draft (`Drafts`): it wins over `value` until the record reloads. */
  readonly draft?: FormFields | undefined;
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
        value=${drafted(c.draft, c.name, c.value)}
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
${drafted(c.draft, c.name, c.value)}</textarea>`,
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
  const value = drafted(c.draft, c.name, c.value);
  const option = (o: Choice) =>
    html`<option value=${o.value} ?selected=${o.value === value}>${o.label}</option>`;
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
            : html`<option value="" ?selected=${value === ''}>${c.emptyLabel ?? 'Choose…'}</option>`
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
