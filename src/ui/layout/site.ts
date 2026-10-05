/** The store's name: in titles, the header and the footer. */
export const SITE_NAME = 'Gyral Goods';

/** The document title for a page title (the home page is just the site name). */
export const documentTitle = (title: string): string =>
  title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`;
