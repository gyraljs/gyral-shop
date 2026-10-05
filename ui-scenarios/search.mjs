// Search from the header box (the suggestions combobox) and land on the results page.
export default {
  path: '/',
  steps: [
    { fill: { label: 'Search products', exact: true }, value: 'kitchen' },
    { press: 'Enter' },
    { waitFor: { role: 'heading', name: 'kitchen' } },
  ],
};
