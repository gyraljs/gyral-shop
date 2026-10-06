/* global document, window -- markServerNodes and lostNodes run in the browser */
// Pure checks for `pnpm smoke:prod` (scripts/smoke-prod.mjs): compare what the server sent with
// what the production build shows after hydration. Ported from Gyral's scripts/lib/smoke.mjs
// and extended with region counts and stuck `defer-hydration`. Tested in
// scripts/test/smoke.test.mjs.

/**
 * Summarizes a document, looking inside open shadow roots: the <h1> count, the count of each
 * `data-region` value, elements still marked `defer-hydration` (split into lazy-hydration
 * islands, which wait by design, and everything else, which must not wait), and per custom
 * element (by tag and order) the number of non-<style> element children of its view (its shadow
 * root, or the host itself for light-DOM components).
 * Runs in the browser (passed to page.evaluate as source), so it must be self-contained.
 */
export function summarize(root) {
  let h1 = 0;
  let deferred = 0;
  let islands = 0;
  const regions = {};
  const hosts = [];
  const walk = (node) => {
    for (const el of node.querySelectorAll('*')) {
      if (el.localName === 'h1') h1 += 1;
      const region = el.getAttribute('data-region');
      if (region !== null) regions[region] = (regions[region] ?? 0) + 1;
      if (el.hasAttribute('defer-hydration')) {
        if (el.hasAttribute('data-gyral-hydrate')) islands += 1;
        else deferred += 1;
      }
      if (!el.localName.includes('-')) continue;
      const view = el.shadowRoot ?? el;
      const children = [...view.children].filter((c) => c.localName !== 'style');
      hosts.push({ tag: el.localName, shadow: el.shadowRoot !== null, children: children.length });
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return { h1, deferred, islands, regions, hosts };
}

/**
 * Problems on one page. `allow.regions` and `allow.hosts` list regions and component tags the
 * client may legitimately add, remove or fill after hydration (for example the deferred consent
 * banner that opens on prerendered pages for visitors who haven't chosen; consent.md).
 */
export function compareSummaries(path, server, live, errors, allow = {}) {
  const allowed = new Set(allow.regions ?? []);
  const allowedHosts = new Set(allow.hosts ?? []);
  const problems = errors.map((e) => `${path}: ${e}`);
  if (live.h1 !== 1) problems.push(`${path}: ${String(live.h1)} <h1> after hydration (want 1)`);
  if (live.h1 !== server.h1) {
    problems.push(`${path}: server sent ${String(server.h1)} <h1>, page shows ${String(live.h1)}`);
  }
  if (live.deferred > 0) {
    problems.push(`${path}: ${String(live.deferred)} element(s) still have defer-hydration`);
  }
  const names = new Set([...Object.keys(server.regions), ...Object.keys(live.regions)]);
  for (const name of [...names].sort()) {
    const s = server.regions[name] ?? 0;
    const l = live.regions[name] ?? 0;
    if (s !== l && !allowed.has(name)) {
      problems.push(
        `${path}: data-region="${name}" appears ${String(l)}× after hydration, ` +
          `server sent ${String(s)}× (duplicated or lost view)`,
      );
    }
  }
  const count = Math.min(server.hosts.length, live.hosts.length);
  for (let i = 0; i < count; i += 1) {
    const s = server.hosts[i];
    const l = live.hosts[i];
    if (s === undefined || l === undefined || s.tag !== l.tag || allowedHosts.has(s.tag)) continue;
    if (s.children !== l.children) {
      problems.push(
        `${path}: <${s.tag}> has ${String(l.children)} top-level elements after hydration, ` +
          `server rendered ${String(s.children)} (duplicated or lost view)`,
      );
    }
  }
  return problems;
}

/**
 * Console messages that are not problems in a production build (none known yet). Errors and
 * warnings both count: a production hydration mismatch is a warning (Gyral view/07).
 */
export const ignoredConsole = (text) => text.startsWith('[vite]');

/**
 * Init script (page.addInitScript): when parsing finishes, before deferred/module scripts run
 * (readyState "interactive"), tag every element the server sent, inside declarative shadow
 * roots too. Hydrating in place keeps these nodes; a fresh client render replaces them. Each
 * one is also listed (`window.__smokeServerNodes`) with the custom elements around it, so
 * `lostNodes` can tell which ones left the page.
 */
export function markServerNodes() {
  document.addEventListener('readystatechange', () => {
    if (document.readyState !== 'interactive') return;
    const nodes = [];
    const mark = (node, hosts) => {
      for (const el of node.querySelectorAll('*')) {
        el.__smokeServerNode = true;
        const around = [];
        for (let n = el.parentNode; n !== null; n = n.parentNode ?? n.host ?? null) {
          if (n.nodeType === 1 && n.localName.includes('-')) around.push(n.localName);
        }
        // A declarative shadow root's <style> is replaced by the shared sheet on hydration.
        const dsdStyle = el.localName === 'style' && el.parentNode === node && node !== document;
        if (!dsdStyle) nodes.push({ el, hosts: [...around, ...hosts] });
        if (el.shadowRoot) mark(el.shadowRoot, [el.localName, ...around, ...hosts]);
      }
    };
    mark(document, []);
    window.__smokeServerNodes = nodes;
  });
}

/**
 * After hydration: server elements that are no longer in the page, as `tag` names (Gyral 0.3
 * hydration adopts every node the parser built; only a shadow root's server <style> goes, for
 * the shared sheet). Elements inside `allow.hosts` (components that re-render on purpose once
 * hydrated) are skipped. Runs in the browser, so it is self-contained.
 */
export function lostNodes(allow) {
  const hosts = new Set(allow?.hosts ?? []);
  return (window.__smokeServerNodes ?? [])
    .filter(({ el, hosts: around }) => !el.isConnected && !around.some((h) => hosts.has(h)))
    .map(({ el }) => el.localName);
}

/**
 * After hydration: headings, data-region elements and each component's top-level view elements
 * that are NOT the nodes the server sent, i.e. replaced by a client render instead of hydrated.
 * Elements inside `allow.regions` / `allow.hosts` (content the client creates on purpose) are
 * skipped. Runs in the browser (passed as source with its argument), so it is self-contained.
 */
export function replacedNodes(root, allow) {
  const regions = new Set(allow?.regions ?? []);
  const hosts = new Set(allow?.hosts ?? []);
  const allowed = (el) => {
    for (let node = el; node !== null && node !== undefined;) {
      if (node.nodeType === 1) {
        if (hosts.has(node.localName)) return true;
        const region = node.getAttribute('data-region');
        if (region !== null && regions.has(region)) return true;
      }
      node = node.parentNode ?? node.host; // climb out of shadow roots
    }
    return false;
  };
  const replaced = [];
  const walk = (node) => {
    for (const el of node.querySelectorAll('*')) {
      const viewTop = el.parentNode?.host !== undefined && el.localName !== 'style';
      const watched = el.localName === 'h1' || el.hasAttribute('data-region') || viewTop;
      if (watched && el.__smokeServerNode !== true && !allowed(el)) {
        const region = el.getAttribute('data-region');
        replaced.push(region !== null ? `[data-region="${region}"]` : el.localName);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  return replaced;
}
