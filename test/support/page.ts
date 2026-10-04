// Browser page tests: put real server output into the document the way a page load would
// (Declarative Shadow DOM is parsed), then import components so they hydrate in place.
// Server output comes from golden fixtures that Node route tests write with
// toMatchFileSnapshot, so browser tests always use the current server markup.

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
  const root = document.createElement('div');
  root.setHTMLUnsafe(body); // parses Declarative Shadow DOM like a page load
  document.body.append(root);
  return {
    root,
    unmount: () => {
      root.remove();
      style.remove();
    },
  };
}

/** Waits until every Gyral/Lit element under `root` has finished its first update. */
export async function hydrated(root: ParentNode): Promise<void> {
  const elements = [...root.querySelectorAll('*')].filter((el) => el.localName.includes('-'));
  await Promise.all(
    elements.map(
      (el) =>
        (el as Partial<{ updateComplete: Promise<unknown> }>).updateComplete ?? Promise.resolve(),
    ),
  );
}
