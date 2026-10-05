// Sign in as a seeded customer, then the profile settings page.
export default {
  path: '/account/login',
  steps: [
    { fill: { label: 'Email' }, value: '{customer}' },
    { fill: { label: 'Password', exact: true }, value: '{password}' },
    { click: { role: 'button', name: 'Sign in' } },
    { wait: 800 },
    { goto: '/account/profile' },
  ],
};
