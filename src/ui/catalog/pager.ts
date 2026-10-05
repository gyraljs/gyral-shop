import { html, nothing } from '@gyral/core';
import { pageWindow } from '../../domain/listing.js';

export interface PagerView {
  readonly page: number;
  readonly pageCount: number;
  /** The URL of a page of this listing. */
  readonly href: (page: number) => string;
  /** A Gyral intent name for the page links, so a component can page without a reload. */
  readonly intent?: string;
}

/** Pagination links. Renders nothing for a single page. */
export function pager({ page, pageCount, href, intent }: PagerView) {
  const di = intent ?? nothing;
  if (pageCount <= 1) return nothing;
  return html`
    <nav class="pager" aria-label="Pagination">
      <ul>
        ${page > 1 ? html`<li><a href=${href(page - 1)} rel="prev" data-intent=${di}>Previous</a></li>` : nothing}
        ${pageWindow(page, pageCount).map((link) =>
          link === 'gap'
            ? html`<li class="gap" aria-hidden="true">…</li>`
            : html`<li>
                <a
                  href=${href(link)}
                  data-intent=${di}
                  aria-label="Page ${link}"
                  aria-current=${link === page ? 'page' : nothing}
                  >${link}</a
                >
              </li>`,
        )}
        ${page < pageCount ? html`<li><a href=${href(page + 1)} rel="next" data-intent=${di}>Next</a></li>` : nothing}
      </ul>
    </nav>
  `;
}
