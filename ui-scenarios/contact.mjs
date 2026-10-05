// Contact form submitted empty so the validation errors render.
export default {
  path: '/contact',
  steps: [{ click: { role: 'button', name: 'Send message' } }, { wait: 500 }],
};
