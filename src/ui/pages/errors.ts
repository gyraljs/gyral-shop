import { html } from '@gyral/core';
import type { DepartmentLink } from '../layout/site-header.js';

const departmentList = (departments: readonly DepartmentLink[]) => html`
  <ul>
    ${departments.map((d) => html`<li><a href="/d/${d.slug}">${d.name}</a></li>`)}
  </ul>
`;

/** 404 content: search plus department links, so a dead end is never a dead end. */
export const notFoundPage = (path: string, departments: readonly DepartmentLink[]) => html`
  <h1>We couldn't find that page</h1>
  <p>Nothing lives at <code>${path}</code>. Try searching, or browse a department:</p>
  <form action="/search" method="get" role="search">
    <label for="nf-q">Search products</label>
    <input id="nf-q" name="q" type="search" />
    <button type="submit">Search</button>
  </form>
  ${departmentList(departments)}
`;

/** 500 content. Never shows error details to shoppers. */
export const serverErrorPage = () => html`
  <h1>Something went wrong</h1>
  <p>
    Sorry, that's our fault. Please try again in a moment, or go back to the
    <a href="/">home page</a>.
  </p>
`;
