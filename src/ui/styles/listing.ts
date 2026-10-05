// Styles for department and category pages: breadcrumbs, category tiles, listing layout,
// pager. Light DOM inside <main>, so plain document CSS (modern-css skill: layers, logical
// properties, container-friendly grids).
export const listingCss = `
@layer components {
  .breadcrumbs ol {
    list-style: none; padding: 0; margin-block: 0 var(--space-3);
    display: flex; flex-wrap: wrap; gap: var(--space-1); font-size: 0.9rem;
  }
  .breadcrumbs li:not(:last-child)::after {
    content: "›"; margin-inline-start: var(--space-1); color: var(--ink-muted);
  }
  .breadcrumbs [aria-current="page"] { color: var(--ink-muted); }
  .page-intro h1 { margin-block: 0 var(--space-2); }
  .page-intro p { max-inline-size: 65ch; color: var(--ink-muted); margin-block: 0; }
  .category-grid {
    list-style: none; padding: 0; margin: 0;
    display: grid; gap: var(--space-3);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr));
  }
  .category-grid a {
    display: grid; gap: var(--space-1); padding: var(--space-3);
    background: var(--surface-raised); border: 1px solid var(--line);
    border-radius: var(--radius); text-decoration: none;
  }
  .category-grid a:hover { border-color: var(--brand); }
  [data-component="category-tile"] img {
    inline-size: 100%; block-size: auto; aspect-ratio: 1; object-fit: cover;
    border-radius: var(--radius); margin-block-end: var(--space-2);
  }
  .category-grid .name { font-weight: 600; }
  .category-grid .count { color: var(--ink-muted); font-size: 0.9rem; }
  .listing {
    display: grid; gap: var(--space-5); align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }
  @media (width >= 48rem) {
    .listing { grid-template-columns: 14rem minmax(0, 1fr); }
  }
  .listing-nav h2 { font-size: 1.1rem; margin-block: 0 var(--space-2); }
  .listing-nav ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-1); }
  .listing-nav a { text-decoration: none; }
  .listing-nav a:hover { text-decoration: underline; }
  .listing-nav [aria-current="page"] { font-weight: 700; text-decoration: underline; }
  .listing-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); }
  .listing-header h1 { margin-block: 0; }
  .result-count { color: var(--ink-muted); margin-block: 0; }
  .listing-results .card-grid { margin-block-start: var(--space-4); }
  .empty { padding: var(--space-4); background: var(--surface-sunken); border-radius: var(--radius); }
  .pager ul {
    list-style: none; padding: 0; margin-block: var(--space-5) 0;
    display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-1);
  }
  .pager a, .pager .gap {
    display: inline-grid; place-items: center;
    min-inline-size: 2.75rem; min-block-size: 2.75rem; padding-inline: var(--space-2);
    border-radius: var(--radius);
  }
  .pager a { border: 1px solid var(--line); text-decoration: none; }
  .pager a:hover { border-color: var(--brand); }
  .pager a[aria-current="page"] {
    background: var(--brand); border-color: var(--brand); color: var(--brand-ink); font-weight: 700;
  }
}
`;
