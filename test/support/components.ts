// Browser tests load a page the way production does: the client entry (shell components and
// the page-wide http driver), then Gyral's components loader, which defines every component
// the mounted page rendered (vite.components.ts). Both load on demand, so a test can check the
// server markup before any component code runs.
import { componentsReady } from '@gyral/core';

/** Loads the entry and the mounted page's components, then waits until they're defined. */
export async function loadPage(): Promise<void> {
  await import('../../src/client/entry.js');
  await import('virtual:gyral/components');
  await componentsReady();
}
