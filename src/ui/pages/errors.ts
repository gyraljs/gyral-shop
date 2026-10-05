import { html, nothing } from '@gyral/core';
import type { DepartmentLink } from '../layout/site-header.js';

const departmentList = (departments: readonly DepartmentLink[]) => html`
  <ul>
    ${departments.map((d) => html`<li><a href="/d/${d.slug}">${d.name}</a></li>`)}
  </ul>
`;

/** 404 content: search plus department links, so a dead end is never a dead end. */
export const notFoundPage = (path: string, departments: readonly DepartmentLink[]) => html`
  <section data-region="error" aria-labelledby="title">
    <h1 id="title">We couldn't find that page</h1>
    <p>Nothing lives at <code>${path}</code>. Try searching, or browse a department:</p>
    ${searchForm('nf-q')} ${departmentList(departments)}
  </section>
`;

const searchForm = (id: string) => html`
  <form action="/search" method="get" role="search" aria-label="Search the catalog">
    <label for=${id}>Search products</label>
    <input id=${id} name="q" type="search" />
    <button type="submit">Search</button>
  </form>
`;

/** 500 content: never shows error details, but still offers a way on (search, departments). */
export const serverErrorPage = (departments: readonly DepartmentLink[] = []) => html`
  <section data-region="error" aria-labelledby="title">
    <h1 id="title">Something went wrong</h1>
    <p>
      Sorry, that's our fault. Please try again in a moment, go back to the
      <a href="/">home page</a>, search, or browse a department.
    </p>
    ${searchForm('err-q')} ${departments.length === 0 ? nothing : departmentList(departments)}
  </section>
`;
