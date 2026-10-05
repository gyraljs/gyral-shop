// Document styles for <shop-cart-page> (light DOM, ADR 0006 rule 5; tokens only, layered).
export const cartCss = `
@layer components {
shop-cart-page {
  & { display: block; min-inline-size: 0; container: cart / inline-size; }
  h1:focus:not(:focus-visible) { outline: none; }
  h1 { margin-block: var(--space-3) var(--space-2); }
  .notice:empty { display: none; }
  .notice {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--surface-sunken);
    border-inline-start: 4px solid var(--ok);
  }
  .notice.error { border-inline-start-color: var(--danger); }
  .layout {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: minmax(0, 1fr);
  }
  @container cart (min-width: 52rem) {
    .layout { grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; }
  }
  .cart-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
  .cart-line {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    grid-template-areas:
      "thumb details total"
      "thumb quantity remove";
    gap: var(--space-2) var(--space-3);
    padding-block-end: var(--space-3);
    border-block-end: 1px solid var(--line);
  }
  .cart-line.has-issue .thumb { opacity: 0.6; }
  .thumb {
    grid-area: thumb;
    inline-size: 5rem;
    block-size: 5rem;
    object-fit: cover;
    border-radius: var(--radius);
    background: var(--surface-sunken);
  }
  .details { grid-area: details; min-inline-size: 0; }
  .details h3 { font-size: 1rem; margin: 0; }
  .details p { margin-block: var(--space-1) 0; }
  .options, .each { color: var(--ink-muted); font-size: 0.9rem; }
  .unit ins { text-decoration: none; color: var(--sale); font-weight: 600; }
  .unit del { color: var(--ink-muted); }
  .issue { color: var(--danger); font-weight: 600; }
  .quantity { grid-area: quantity; display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }
  .quantity form { display: flex; gap: var(--space-1); }
  .quantity input { inline-size: 4.5rem; padding: var(--space-1); }
  .line-total { grid-area: total; margin: 0; font-weight: 700; text-align: end; font-variant-numeric: tabular-nums; }
  .remove { grid-area: remove; justify-self: end; align-self: center; }
  button, .button {
    font: inherit;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--ink);
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
  }
  .step button { inline-size: 2.25rem; padding-inline: 0; font-weight: 700; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .button.primary { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); font-weight: 600; }
  button.link { border: 0; background: none; padding: 0; text-decoration: underline; color: inherit; }
  .summary {
    padding: var(--space-3);
    background: var(--surface-sunken);
    border-radius: var(--radius);
    display: grid;
    /* One column no wider than the box: an auto column grows to the promo row's content. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }
  .summary h2 { font-size: 1.15rem; margin: 0; }
  .summary dl { margin: 0; display: grid; gap: var(--space-1); }
  .summary dl div { display: flex; justify-content: space-between; gap: var(--space-2); }
  .summary dd { margin: 0; font-variant-numeric: tabular-nums; }
  .summary .total { border-block-start: 1px solid var(--line-strong); padding-block-start: var(--space-2); font-weight: 700; }
  .summary .discount dd, .savings { color: var(--sale); }
  .summary[aria-busy="true"] dl { opacity: 0.6; }
  .summary .button.primary { text-align: center; }
  .updating, .blocked { color: var(--ink-muted); font-size: 0.9rem; margin: 0; }
  .promo label { display: block; font-weight: 600; margin-block-end: var(--space-1); }
  .promo .row { display: flex; gap: var(--space-1); }
  .promo input { flex: 1; min-inline-size: 0; inline-size: 100%; padding: var(--space-1) var(--space-2); text-transform: uppercase; }
  .promo .error { color: var(--danger); margin-block: var(--space-1) 0; }
  .promo.applied p { margin: 0; }
  .empty { padding-block: var(--space-4); }
  .visually-hidden {
    position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap;
  }
}
}
`;
