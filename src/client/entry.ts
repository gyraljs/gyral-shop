// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports Lit
// (Gyral ADR 0012). Then every component that may appear on a server-rendered page.
import '@gyral/ssr/hydrate';
import '../ui/layout/site-header.js';
import '../ui/catalog/listing.js';
