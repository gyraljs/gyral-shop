// The account-settings form elements (light DOM, one per form). See forms/member-form.ts.
import { STATE_OPTIONS } from '../../domain/us-states.js';
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '../../domain/accounts.js';
import { defineMemberForm, type MemberField } from '../forms/member-form.js';
import {
  AddressBookForm,
  EmailForm,
  PasswordForm,
  ProfileForm,
  ResetForm,
  ResetRequestForm,
  SETTINGS_SECRETS,
} from './settings-schemas.js';

const newPasswordFields: readonly MemberField[] = [
  {
    kind: 'password',
    name: 'password',
    label: 'New password',
    autocomplete: 'new-password',
    minlength: MIN_PASSWORD_LENGTH,
    hint: `At least ${String(MIN_PASSWORD_LENGTH)} characters.`,
  },
  { kind: 'password', name: 'confirm', label: 'Repeat new password', autocomplete: 'new-password' },
];

const current: MemberField = {
  kind: 'password',
  name: 'current',
  label: 'Current password',
  autocomplete: 'current-password',
};

export const ProfileFormElement = defineMemberForm({
  tag: 'shop-profile-form',
  action: '/account/profile',
  form: ProfileForm,
  fields: [
    {
      kind: 'text',
      name: 'name',
      label: 'Full name',
      autocomplete: 'name',
      maxlength: MAX_NAME_LENGTH,
    },
  ],
  submitLabel: 'Save name',
  pendingLabel: 'Saving…',
});

export const EmailFormElement = defineMemberForm({
  tag: 'shop-email-form',
  action: '/account/email',
  form: EmailForm,
  fields: [{ kind: 'email', name: 'email', label: 'New email', autocomplete: 'email' }, current],
  submitLabel: 'Change email',
  pendingLabel: 'Saving…',
  secret: SETTINGS_SECRETS,
});

export const PasswordFormElement = defineMemberForm({
  tag: 'shop-password-form',
  action: '/account/password',
  form: PasswordForm,
  fields: [current, ...newPasswordFields],
  submitLabel: 'Change password',
  pendingLabel: 'Saving…',
  secret: SETTINGS_SECRETS,
});

/** The address fields; the action differs between adding and editing. */
const addressFields: readonly MemberField[] = [
  { kind: 'text', name: 'name', label: 'Full name', autocomplete: 'shipping name', maxlength: 120 },
  {
    kind: 'text',
    name: 'line1',
    label: 'Street address',
    autocomplete: 'shipping address-line1',
    maxlength: 120,
  },
  {
    kind: 'text',
    name: 'line2',
    label: 'Apartment, suite, etc.',
    autocomplete: 'shipping address-line2',
    maxlength: 120,
    required: false,
  },
  {
    kind: 'text',
    name: 'city',
    label: 'City',
    autocomplete: 'shipping address-level2',
    maxlength: 80,
  },
  {
    kind: 'select',
    name: 'state',
    label: 'State',
    autocomplete: 'shipping address-level1',
    options: STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name })),
  },
  {
    kind: 'text',
    name: 'postalCode',
    label: 'ZIP code',
    autocomplete: 'shipping postal-code',
    maxlength: 10,
  },
  {
    kind: 'tel',
    name: 'phone',
    label: 'Phone (optional)',
    autocomplete: 'shipping tel',
    maxlength: 30,
    required: false,
  },
  { kind: 'checkbox', name: 'isDefault', label: 'Use as my default shipping address' },
];

export const NewAddressFormElement = defineMemberForm({
  tag: 'shop-address-form',
  action: '/account/addresses',
  form: AddressBookForm,
  fields: addressFields,
  submitLabel: 'Save address',
  pendingLabel: 'Saving…',
});

/** Editing: the page sets `action` to /account/addresses/:id. */
export const EditAddressFormElement = defineMemberForm({
  tag: 'shop-address-edit-form',
  action: '/account/addresses',
  form: AddressBookForm,
  fields: addressFields,
  submitLabel: 'Save changes',
  pendingLabel: 'Saving…',
});

export const ResetRequestFormElement = defineMemberForm({
  tag: 'shop-reset-request-form',
  action: '/account/forgot',
  form: ResetRequestForm,
  fields: [{ kind: 'email', name: 'email', label: 'Email', autocomplete: 'email' }],
  submitLabel: 'Email me a reset link',
  pendingLabel: 'Sending…',
});

export const ResetFormElement = defineMemberForm({
  tag: 'shop-reset-form',
  action: '/account/reset',
  form: ResetForm,
  fields: newPasswordFields,
  submitLabel: 'Set new password',
  pendingLabel: 'Saving…',
  secret: SETTINGS_SECRETS,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-profile-form': InstanceType<typeof ProfileFormElement>;
    'shop-email-form': InstanceType<typeof EmailFormElement>;
    'shop-password-form': InstanceType<typeof PasswordFormElement>;
    'shop-address-form': InstanceType<typeof NewAddressFormElement>;
    'shop-address-edit-form': InstanceType<typeof EditAddressFormElement>;
    'shop-reset-request-form': InstanceType<typeof ResetRequestFormElement>;
    'shop-reset-form': InstanceType<typeof ResetFormElement>;
  }
}
