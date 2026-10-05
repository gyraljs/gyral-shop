// Browser page tests: put real server output into the document the way a page load would
// (Declarative Shadow DOM is parsed), then import components so they hydrate in place.
// Server output comes from golden fixtures that Node route tests write with
// toMatchFileSnapshot, so browser tests always use the current server markup.

import { resetDocumentStores } from '@gyral/core';

export interface MountedPage {
  readonly root: HTMLElement;
  readonly unmount: () => void;
}

/** Mounts a full SSR document's styles and body. Call before importing components. */
export function mountSsrPage(documentHtml: string): MountedPage {
  // Document styles only: <style> elements inside Declarative Shadow DOM templates belong to
  // their shadow roots and must not leak into the page.
  const head = /<head>([\s\S]*?)<\/head>/.exec(documentHtml)?.[1] ?? '';
  const styles = [...head.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  const body = /<body>([\s\S]*)<\/body>/.exec(documentHtml)?.[1] ?? '';
  const style = document.createElement('style');
  style.textContent = styles.join('\n');
  document.head.append(style);
  // The page-level store seed (Gyral ADR 0013): the client restores it before hydrating.
  const seedJson = /<script type="application\/json" data-gyral-stores>([\s\S]*?)<\/script>/.exec(
    head,
  )?.[1];
  const seed = document.createElement('script');
  seed.type = 'application/json';
  seed.setAttribute('data-gyral-stores', '');
  seed.textContent = seedJson ?? '{}';
  resetDocumentStores();
  document.head.append(seed);
  // The CSRF <meta> browser code reads for JSON requests (src/ui/forms/csrf.ts).
  const metas = [...head.matchAll(/<meta name="csrf-token" content="([^"]*)"/g)].map((m) => {
    const meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = m[1] ?? '';
    document.head.append(meta);
    return meta;
  });
  const root = document.createElement('div');
  root.setHTMLUnsafe(body); // parses Declarative Shadow DOM like a page load
  document.body.append(root);
  return {
    root,
    unmount: () => {
      root.remove();
      style.remove();
      seed.remove();
      for (const meta of metas) meta.remove();
      resetDocumentStores();
    },
  };
}

/** Custom elements under `root`, including those inside (nested) shadow roots. */
function customElementsIn(root: ParentNode): Element[] {
  return [...root.querySelectorAll('*')].flatMap((el) => [
    ...(el.localName.includes('-') ? [el] : []),
    ...(el.shadowRoot === null ? [] : customElementsIn(el.shadowRoot)),
  ]);
}

/** Waits until every Gyral/Lit element under `root` (shadow roots too) has finished updating. */
export async function hydrated(root: ParentNode): Promise<void> {
  const elements = customElementsIn(root);
  await Promise.all(
    elements.map(
      (el) =>
        (el as Partial<{ updateComplete: Promise<unknown> }>).updateComplete ?? Promise.resolve(),
    ),
  );
}
