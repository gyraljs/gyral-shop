// Accessibility assertion for browser tests: axe-core over the given root, open shadow roots
// included. WCAG 2.2 AA rules (docs/product-specs/quality.md).
import axe from 'axe-core';

export async function a11yViolations(root: Element): Promise<string[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.map(
    (v) =>
      `${v.id}: ${v.help} (${v.nodes
        .map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
        .join('; ')})`,
  );
}
