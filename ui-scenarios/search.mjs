// Search from the header box, then sort the results.
export default {
  path: '/',
  steps: [
    { fill: { role: 'searchbox' }, value: 'kitchen' },
    { press: 'Enter' },
    { waitFor: { role: 'heading', name: 'kitchen' } },
  ],
};
