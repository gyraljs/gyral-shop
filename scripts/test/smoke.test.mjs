import { describe, expect, it } from 'vitest';
import { compareSummaries } from '../lib/smoke.mjs';

const summary = (over = {}) => ({
  h1: 1,
  deferred: 0,
  islands: 0,
  regions: { header: 1, listing: 1 },
  hosts: [
    { tag: 'shop-header', shadow: false, children: 1 },
    { tag: 'shop-listing', shadow: false, children: 3 },
  ],
  ...over,
});

describe('compareSummaries', () => {
  it('accepts a page that hydrated in place', () => {
    expect(compareSummaries('/', summary(), summary(), [])).toEqual([]);
  });

  it('reports a duplicated or lost region', () => {
    const live = summary({ regions: { header: 2 } });
    const problems = compareSummaries('/', summary(), live, []);
    expect(problems).toEqual([
      '/: data-region="header" appears 2× after hydration, server sent 1× (duplicated or lost view)',
      '/: data-region="listing" appears 0× after hydration, server sent 1× (duplicated or lost view)',
    ]);
  });

  it('requires exactly one <h1> and the same count as the server', () => {
    expect(compareSummaries('/', summary(), summary({ h1: 2 }), [])).toEqual([
      '/: 2 <h1> after hydration (want 1)',
      '/: server sent 1 <h1>, page shows 2',
    ]);
  });

  it('reports elements stuck in defer-hydration, but not waiting islands', () => {
    expect(compareSummaries('/', summary(), summary({ deferred: 1 }), [])).toEqual([
      '/: 1 element(s) still have defer-hydration',
    ]);
    expect(compareSummaries('/', summary(), summary({ islands: 2 }), [])).toEqual([]);
  });

  it('reports a component view that doubled', () => {
    const live = summary({
      hosts: [
        { tag: 'shop-header', shadow: false, children: 2 },
        { tag: 'shop-listing', shadow: false, children: 3 },
      ],
    });
    expect(compareSummaries('/', summary(), live, [])).toEqual([
      '/: <shop-header> has 2 top-level elements after hydration, server rendered 1 (duplicated or lost view)',
    ]);
  });

  it('skips regions and hosts the client fills on purpose', () => {
    const server = summary({
      regions: { header: 1 },
      hosts: [{ tag: 'shop-consent', shadow: false, children: 0 }],
    });
    const live = summary({
      regions: { header: 1, consent: 1 },
      hosts: [{ tag: 'shop-consent', shadow: false, children: 1 }],
    });
    expect(compareSummaries('/about', server, live, [])).toHaveLength(2);
    expect(
      compareSummaries('/about', server, live, [], {
        regions: ['consent'],
        hosts: ['shop-consent'],
      }),
    ).toEqual([]);
  });

  it('prefixes page and console errors with the path', () => {
    expect(compareSummaries('/cart', summary(), summary(), ['page error: boom'])).toEqual([
      '/cart: page error: boom',
    ]);
  });
});
