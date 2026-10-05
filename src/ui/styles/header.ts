// Document styles for <shop-header> (light DOM; theme contract ADR 0006). Structure only, in
// semantic tokens (--header-*, --nav-*), so a theme can re-colour or re-lay out the header
// without touching the component. Search and the mini-cart style themselves (search.ts,
// mini-cart's ::parts).
export const headerCss = `
@layer components {
  shop-header {
    display: block;
    container: header / inline-size;
    background: var(--header-bg);
    color: var(--header-ink);
  }
  shop-header :is(.bar, .departments ul) {
    inline-size: min(100% - 2 * var(--space-3), var(--page-max));
    margin-inline: auto;
  }
  shop-header .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-2);
  }
  shop-header .brand {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: var(--brand-size);
    text-decoration: none;
    color: inherit;
    letter-spacing: -0.02em;
  }
  shop-header .brand span { font-weight: 400; }
  shop-header .utility { display: flex; gap: var(--space-3); }
  shop-header .departments { background: var(--nav-bg); color: var(--nav-ink); }
  shop-header .departments ul {
    list-style: none;
    display: flex;
    gap: var(--space-3);
    overflow-x: auto;
    padding-block: var(--space-2);
    padding-inline: 0;
    margin-block: 0;
    scrollbar-width: thin;
  }
  shop-header .departments a { white-space: nowrap; text-decoration: none; font-weight: 500; }
  shop-header .departments a:is(:hover, [aria-current]) { text-decoration: underline; }
  shop-header .departments a[aria-current] { font-weight: 700; text-underline-offset: 0.3em; }
  shop-header .account-menu { position: relative; }
  shop-header .account-menu summary { cursor: pointer; list-style-position: inside; }
  shop-header .account-menu ul {
    position: absolute;
    inset-inline-end: 0;
    inset-block-start: calc(100% + var(--space-1));
    z-index: 10;
    min-inline-size: 12rem;
    margin: 0;
    padding: var(--space-2);
    list-style: none;
    display: grid;
    gap: var(--space-1);
    background: var(--surface-raised);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-popover);
  }
  shop-header .account-menu ul :is(a, button) {
    display: block;
    inline-size: 100%;
    padding: var(--space-1) var(--space-2);
    text-align: start;
    color: inherit;
    border-radius: calc(var(--radius) / 2);
  }
  shop-header .account-menu ul button { font: inherit; background: none; border: 0; cursor: pointer; }
  shop-header .account-menu ul :is(a, button):hover { background: var(--surface-sunken); }
  /* Focus rings on the header colour; the open menu sits on a surface, so it keeps --focus. */
  shop-header :is(.brand, .utility > a, .account-menu > summary, .departments a):focus-visible {
    outline: 2px solid var(--header-ink);
    outline-offset: 2px;
  }
}
`;
