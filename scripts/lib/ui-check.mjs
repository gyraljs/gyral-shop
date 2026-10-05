// Pure parts of `pnpm ui:check` (scripts/ui-check.mjs), ported from Gyral's tool: argument
// parsing, scenario validation and placeholders, console filtering, overflow and axe
// summaries, and the Markdown report. Tested in scripts/test/ui-check.test.mjs.

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];
export const SCHEMES = ['light', 'dark'];

/** The combination where a scenario marked `once` runs its steps. */
export const PRIMARY = { viewport: 'desktop', scheme: 'light' };

/** Console messages that are expected in development and never fail a run. */
export const IGNORED_CONSOLE = [/Lit is in dev mode/, /^\[vite\]/];

const USAGE = `Usage: pnpm ui:check [page…] [--baseline] [--compare] [--threshold=0.1] [--max-diff=0.001] [--port=5800] [--theme=<name>]
  --baseline     save this run's screenshots as the baseline (.ui-check/baseline/)
  --compare      pixel-diff screenshots against the baseline; fail above --max-diff
  --threshold    per-pixel colour threshold for the diff, 0..1 (default 0.1)
  --max-diff     allowed ratio of differing pixels per screenshot (default 0.001)
  --port         port for the shop dev server (default 5800, or UI_CHECK_PORT); HMR uses port+1
  --theme        visit every page with this theme cookie (or UI_CHECK_THEME); baselines are per theme`;

export function parseArgs(argv, env = {}) {
  const options = {
    pages: [],
    baseline: false,
    compare: false,
    threshold: 0.1,
    maxDiff: 0.001,
    port: Number(env['UI_CHECK_PORT'] ?? 5800),
    theme: env['UI_CHECK_THEME'] ?? undefined,
  };
  const errors = [];
  for (const arg of argv) {
    const [flag, value] = arg.split('=', 2);
    if (!arg.startsWith('--')) options.pages.push(arg);
    else if (flag === '--baseline') options.baseline = true;
    else if (flag === '--compare') options.compare = true;
    else if (flag === '--help') errors.push('help');
    else if (flag === '--theme') {
      if (value === undefined || !/^[a-z][a-z0-9-]*$/.test(value))
        errors.push(`${arg}: expects a theme name`);
      else options.theme = value;
    } else if (['--threshold', '--max-diff', '--port'].includes(flag ?? '')) {
      const n = Number(value);
      if (value === undefined || !Number.isFinite(n) || n < 0)
        errors.push(`${arg}: expects a number`);
      else if (flag === '--threshold') options.threshold = n;
      else if (flag === '--max-diff') options.maxDiff = n;
      else options.port = n;
    } else errors.push(`unknown option ${arg}`);
  }
  if (options.threshold > 1) errors.push('--threshold must be between 0 and 1');
  if (options.baseline && options.compare) errors.push('use --baseline or --compare, not both');
  return { options, errors, usage: USAGE };
}

const TARGET_KEYS = ['role', 'text', 'label', 'css'];
const ACTIONS = ['goto', 'click', 'fill', 'check', 'select', 'press', 'waitFor', 'wait'];

const isTarget = (t) =>
  typeof t === 'object' && t !== null && TARGET_KEYS.filter((k) => k in t).length === 1;

/** Problems with a scenario module's default export, or [] when it is valid. */
export function validateScenario(name, scenario) {
  const where = `ui-scenarios/${name}.mjs`;
  if (typeof scenario !== 'object' || scenario === null)
    return [`${where}: export default an object`];
  if (!Array.isArray(scenario.steps)) return [`${where}: "steps" must be an array`];
  const errors = [];
  if (typeof scenario.path !== 'string' || !/^[/{]/.test(scenario.path))
    errors.push(`${where}: "path" must start with "/" or a placeholder such as {category}`);
  scenario.steps.forEach((step, i) => {
    const at = `${where} step ${String(i + 1)}`;
    const actions = ACTIONS.filter((a) => a in step);
    if (actions.length !== 1) {
      errors.push(`${at}: needs exactly one of ${ACTIONS.join(', ')}`);
      return;
    }
    const action = actions[0];
    const arg = step[action];
    if (action === 'goto' && (typeof arg !== 'string' || !arg.startsWith('/')))
      errors.push(`${at}: goto takes a path starting with "/"`);
    if (action === 'wait' && (typeof arg !== 'number' || arg < 0 || arg > 10000))
      errors.push(`${at}: wait takes milliseconds (0..10000)`);
    if (action === 'press' && typeof arg !== 'string') errors.push(`${at}: press takes a key name`);
    if (['click', 'fill', 'check', 'select', 'waitFor'].includes(action) && !isTarget(arg))
      errors.push(`${at}: ${action} takes a target with one of ${TARGET_KEYS.join(', ')}`);
    if (step.viewport !== undefined && !VIEWPORTS.some((v) => v.name === step.viewport))
      errors.push(`${at}: viewport must be one of ${VIEWPORTS.map((v) => v.name).join(', ')}`);
    if (['fill', 'select'].includes(action) && typeof step.value !== 'string')
      errors.push(`${at}: ${action} needs a string "value"`);
  });
  if (scenario.allowConsole !== undefined && !Array.isArray(scenario.allowConsole))
    errors.push(`${where}: "allowConsole" must be an array of RegExps`);
  return errors;
}

/** Console entries that should fail the run. */
export function significantConsole(entries, allow = []) {
  return entries.filter(
    (e) =>
      (e.type === 'error' || e.type === 'warning' || e.type === 'pageerror') &&
      ![...IGNORED_CONSOLE, ...allow].some((re) => re.test(e.text)),
  );
}

/** Horizontal overflow, from an in-page measurement. */
export function overflowFinding(measure, tolerance = 1) {
  const extra = measure.scrollWidth - measure.clientWidth;
  if (extra <= tolerance) return undefined;
  return { extra, offenders: measure.offenders.slice(0, 5) };
}

/** Compact axe violations: one entry per rule. */
export function axeSummary(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes,
    targets: v.targets ?? [],
  }));
}

/** A shot fails on console problems, overflow, axe violations or a diff above the limit. */
export function shotFailures(shot) {
  const failures = [];
  if (shot.console.length > 0) failures.push(`${String(shot.console.length)} console`);
  if (shot.overflow) failures.push(`overflow +${String(shot.overflow.extra)}px`);
  if (shot.axe.length > 0) failures.push(`${String(shot.axe.length)} axe`);
  if (shot.diff?.failed) failures.push(`diff ${shot.diff.reason}`);
  if (shot.error) failures.push('error');
  return failures;
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The Markdown report for one run. Screenshot paths are relative to the report. */
export function renderReport(run) {
  const examples = run.pages;
  const failed = examples.filter(
    (ex) => ex.shots.some((s) => shotFailures(s).length > 0) || ex.error,
  );
  const lines = [
    `# Shop UI check — ${run.startedAt}`,
    '',
    `${String(examples.length)} pages, ${String(examples.length - failed.length)} passed, ` +
      `${String(failed.length)} failed.${run.mode ? ` Mode: ${run.mode}.` : ''}`,
    '',
    '| Page | Result | Problems |',
    '| --- | --- | --- |',
  ];
  for (const ex of examples) {
    const problems = [
      ...(ex.error ? [`error: ${ex.error}`] : []),
      ...ex.shots.flatMap((s) => shotFailures(s).map((f) => `${s.viewport}/${s.scheme}: ${f}`)),
    ];
    lines.push(
      `| [${ex.name}](#${ex.name}) | ${problems.length === 0 ? 'pass' : '**FAIL**'} | ${cell(problems.join('; ') || '—')} |`,
    );
  }
  for (const ex of examples) {
    lines.push('', `## ${ex.name}`, '');
    if (ex.error) lines.push(`Error: \`${cell(ex.error)}\``, '');
    if (ex.note) lines.push(ex.note, '');
    for (const shot of ex.shots) {
      lines.push(
        `### ${shot.viewport} · ${shot.scheme}`,
        '',
        `![${ex.name} ${shot.viewport} ${shot.scheme}](${shot.file})`,
        '',
      );
      if (shot.error) lines.push(`- Error: \`${cell(shot.error)}\``);
      for (const c of shot.console) lines.push(`- Console ${c.type}: \`${cell(c.text)}\``);
      if (shot.overflow) {
        lines.push(`- Horizontal overflow: +${String(shot.overflow.extra)}px`);
        for (const o of shot.overflow.offenders)
          lines.push(`  - \`${cell(o.selector)}\` ends at ${String(o.right)}px`);
      }
      for (const a of shot.axe)
        lines.push(
          `- axe ${a.impact} \`${a.id}\` (${String(a.nodes)} nodes): ${cell(a.help)} ${a.targets.map((t) => `\`${cell(t)}\``).join(', ')}`,
        );
      if (shot.diff) {
        lines.push(
          `- Diff vs baseline: ${shot.diff.reason}${shot.diff.diffFile ? ` — [diff image](${shot.diff.diffFile})` : ''}`,
        );
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Values a scenario can refer to as `{name}` in paths and fill values (from the seeded DB). */
export function fillPlaceholders(text, values) {
  return text.replace(/\{(\w+)\}/g, (whole, key) => {
    if (!(key in values)) throw new Error(`unknown placeholder ${whole}`);
    return String(values[key]);
  });
}

/** A scenario with every placeholder resolved. */
export function resolveScenario(scenario, values) {
  const fill = (v) => (typeof v === 'string' ? fillPlaceholders(v, values) : v);
  return {
    ...scenario,
    path: fill(scenario.path),
    steps: scenario.steps.map((step) =>
      Object.fromEntries(
        Object.entries(step).map(([k, v]) => [k, k === 'goto' || k === 'value' ? fill(v) : v]),
      ),
    ),
  };
}
