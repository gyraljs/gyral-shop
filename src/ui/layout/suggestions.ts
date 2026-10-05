// The header search suggestions' wire format, shared by the server endpoint and <shop-search>.
import * as v from 'valibot';

export const SuggestionsSchema = v.object({
  query: v.string(),
  products: v.array(
    v.object({ name: v.string(), brand: v.string(), href: v.string(), price: v.string() }),
  ),
  categories: v.array(v.object({ name: v.string(), department: v.string(), href: v.string() })),
});

export type Suggestions = v.InferOutput<typeof SuggestionsSchema>;

export const SUGGEST_API = '/api/search/suggest';

export const suggestHref = (q: string): string =>
  `${SUGGEST_API}?${new URLSearchParams({ q }).toString()}`;
