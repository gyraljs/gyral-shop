# ADR 0006 — Theming: a Zen Garden contract

Status: **accepted** (2026-10-04). Binding on all UI work from now on. Epic: "Themes (Zen Garden)".

## Context

The shop should be able to switch its whole look between themes: today's default plus three
themes _inspired by_ big-box retailers. **Marketplace** is dense, navy and orange. **Supercenter**
is blue and yellow, rounded and friendly. **Boutique** is red and white, airy and minimal. Each
theme uses our own names, with no third-party logos or brand assets.

A theme changes layout as well as colour, exactly as the CSS Zen Garden did. That only works if
markup stays semantic and stable and every visual decision lives in CSS that a theme can override.

## Decision: the contract

1. **Markup is semantic and theme-neutral.** Use landmarks (`header`, `nav`, `search`, `main`,
   `aside`, `footer`), headings, lists, `article`, `figure`, `dl`, `table`, `form`, `fieldset`.
   Never choose an element for its look. Add no wrapper divs just for styling.
2. **Stable hooks.** A theme may target exactly these:
   - Landmarks and semantic elements.
   - `data-region="…"` on page regions: `header`, `nav`, `search`, `account`, `cart`,
     `breadcrumbs`, `listing`, `filters`, `results`, `product`, `gallery`, `buy-box`, `reviews`,
     `footer`, …
   - `data-component="…"` on repeated units: `product-card`, `price`, `rating`, `pager`, …
   - Container names (`container-name`) on regions and cards.

   New UI must add a hook for anything a theme might reasonably restyle, and must document new
   hooks in the "Hooks" table below. Renaming or removing a hook is a breaking change.

3. **Layers.** Every stylesheet sits in one layer, in this order:
   `@layer reset, tokens, base, components, theme;`. Themes write only to `@layer theme` and
   win by layer order, never by specificity.
4. **Tokens.** Every colour, font, radius, shadow, spacing, density and motion value comes from
   a custom property defined in `@layer tokens` (`src/ui/styles/base.ts`) or in a theme file.
   - **No literals elsewhere.** No hex, `rgb()`, `hsl()` or literal `oklch()` values, and no
     literal `font-family`.
   - **No literal fallbacks** in `var(--x, …)`; a fallback that is another `var()` is allowed.
   - Relative colour from a token (`oklch(from var(--brand) …)`) is fine.
   - Enforced by `scripts/check-styles.mjs` in `pnpm check`.
5. **Light DOM for page structure.** Page-level components (header, listing, product page
   sections, account pages) render in light DOM once Gyral's light-DOM option lands (Gyral
   ADR 0014). That way themes can re-lay them out, and raw-HTML crawlers see the content.
6. **Widgets stay in shadow DOM** (gallery, buy box, form controls). They are styled only
   through tokens and documented `::part()` names. Each widget exposes parts for its visually
   meaningful pieces and lists them in the "Parts" table below.
7. **Themes are stylesheets**, in `src/ui/themes/<name>.css.ts`.
   - Each sets every required token for light and dark (`light-dark()`).
   - Each may restructure layout with grid template areas, container queries, `@scope`,
     `:has()`, subgrid and anchor positioning, following the `modern-css` skill.
   - Each must pass WCAG AA contrast on every page template (axe in tests).
8. **Switching** (epic task):
   - The choice is stored in a `theme` cookie, changed through a no-JS form POST.
   - The server renders the chosen theme's `<link>`, so the wrong theme never flashes.
   - With JS, a Gyral component swaps the link inside a View Transition, respecting
     `prefers-reduced-motion`.
   - The default theme is the current look.

## Hooks (keep current)

| Hook                                                                                                                                                                                                                                                                   | Where                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-region="header" / "nav" / "search" / "account" / "cart"`                                                                                                                                                                                                         | site header (to be added by the epic's light-DOM task)                                                                                                                  |
| `data-component="product-card" / "price" / "rating"`                                                                                                                                                                                                                   | product cards (`src/ui/catalog/product-card.ts`)                                                                                                                        |
| `data-region="listing" / "filters" / "results"`, `data-component="pager"`                                                                                                                                                                                              | `<shop-listing>`, light DOM (`src/ui/catalog/listing.ts`, `filters.ts`, `pager.ts`); state hook `shop-listing:state(loading)`                                           |
| `data-region="cart"`                                                                                                                                                                                                                                                   | `<shop-mini-cart>` (header cart slot, `src/server/document.ts`) and `<shop-cart-page>` (`src/server/routes/cart-page.ts`)                                               |
| `data-region="cart-lines" / "cart-summary"`                                                                                                                                                                                                                            | cart page sections (`src/ui/cart/cart-page.ts`, `cart-summary.ts`)                                                                                                      |
| `data-component="cart-line" / "price" / "quantity" / "promo-code"`                                                                                                                                                                                                     | cart lines and summary (`src/ui/cart/cart-lines.ts`, `cart-summary.ts`, `mini-cart.ts`)                                                                                 |
| `data-component="cart-notice"`                                                                                                                                                                                                                                         | buy box add-to-cart status (`src/ui/product/buy-box.ts`)                                                                                                                |
| `data-region="checkout"`                                                                                                                                                                                                                                               | `<shop-checkout>` (light DOM; `src/server/routes/checkout.ts`)                                                                                                          |
| `data-component="checkout-step" / "step-summary" / "step-edit" / "address-form" / "shipping-option" / "card-form" / "place-order" / "order-summary" / "summary-line" / "price"`                                                                                        | checkout steps and summary (`src/ui/checkout/steps.ts`, `summary.ts`)                                                                                                   |
| `data-region="order-confirmation" / "delivery" / "order-lines" / "order-totals"`, `data-component="order-number" / "order-line" / "price"`                                                                                                                             | order confirmation, light DOM (`src/ui/pages/order-confirmation.ts`); container `confirmation`                                                                          |
| `data-region="order-history" / "order-detail" / "order-timeline" / "order-cancel" / "order-lookup"`, `data-component="order-table" / "order-row" / "order-status" (with `data-status`) / "order-event" / "cancel-form" / "lookup-form" / "notice" / "pager" / "empty"` | order history, detail and guest lookup, light DOM (`src/ui/pages/order-{history,detail,lookup}.ts`, shared parts in `src/ui/orders/parts.ts`); container `confirmation` |

## Parts (keep current)

| Widget                                             | Parts                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `shop-mini-cart`                                   | `link` (no cart known), `disclosure`, `summary`, `badge`, `panel`, `line`, `subtotal`, `actions` |
| `shop-cart-page`                                   | `notice`, `empty`, `lines`, `line`, `quantity`, `line-total`, `summary`, `promo`, `checkout`     |
| `shop-buy-box`                                     | `added` (add-to-cart status)                                                                     |
| _(more to be added by the light-DOM / parts task)_ |                                                                                                  |

## Consequences

- Every UI change is reviewed against this contract. The style check catches literal values;
  the hook and part tables are kept up to date by the change that introduces the hook or part.
- Themes can be added without touching components.
- Until the light-DOM task lands, themes can re-skin but not fully re-lay out
  shadow-rendered regions.
