// Element-level base rules repeated inside shadow roots: document styles don't cross the
// shadow boundary (tokens do, as inherited custom properties). Page-level content should use
// light DOM instead (Gyral ADR 0014); this is for components that stay in shadow DOM.
export const shadowBaseCss = `
@layer reset, base, components;
@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  img, svg { display: block; max-inline-size: 100%; }
}
@layer base {
  :host { display: block; min-inline-size: 0; }
  a { color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  h1, h2 { line-height: 1.2; text-wrap: balance; }
  h1:focus { outline: none; }
  h1:focus-visible { outline: 2px solid var(--focus); }
  p { text-wrap: pretty; }
  button, input, select { font: inherit; }
}
`;
