// Table pieces shared by the admin lists: sortable column headers (aria-sort on the <th>, a
// button inside naming the sort) and a pager of plain links the admin router captures.
import { html, nothing } from '@gyral/core';

export interface Sorted<S extends string> {
  readonly sort: S;
  readonly dir: 'asc' | 'desc';
}

export function sortHeader<S extends string>(
  label: string,
  sort: S,
  current: Sorted<S>,
  cls?: string,
) {
  const active = current.sort === sort;
  const state = active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const next = active && current.dir === 'asc' ? 'descending' : 'ascending';
  return html`<th scope="col" class=${cls ?? nothing} aria-sort=${state}>
    <button type="button" data-intent="Sort" value=${sort} aria-label=${`${label}, sort ${next}`}>
      ${label}
    </button>
  </th>`;
}

export function pager(page: number, pages: number, href: (page: number) => string) {
  if (pages <= 1) return nothing;
  const link = (target: number, label: string, rel: string) =>
    target < 1 || target > pages
      ? html`<a aria-disabled="true">${label}</a>`
      : html`<a href=${href(target)} rel=${rel}>${label}</a>`;
  return html`<nav class="pager" aria-label="Pages" data-component="pager">
    ${link(page - 1, 'Previous', 'prev')}
    <span>Page ${page} of ${pages}</span>
    ${link(page + 1, 'Next', 'next')}
  </nav>`;
}
