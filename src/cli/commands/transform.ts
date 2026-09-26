import { theme, sym } from '../ui/theme.js';
import { pageHeader, rule } from '../ui/banner.js';
import { clearScreen, frameProse, frameWidth } from '../ui/terminal.js';
import { promptSelect, promptAnyKey, type Choice } from '../ui/menu.js';
import { promptMultiline } from '../ui/input.js';
import { liveStatus } from '../ui/live.js';
import { scrollablePage } from '../ui/pager.js';
import { fitWidth } from '../ui/screen.js';
import { OperationalError, EXIT_INTERRUPTED, EXIT_OK } from '../../core/errors.js';
import {
  loadRuntimeConfig,
  missingRuntimeConfig,
  runtimeSetupMessage,
  type RuntimeConfig,
} from '../../config/env.js';
import { connectRuntime, preflightContextMcp, type PreflightStep } from '../runtime.js';
import { runTransformation, type TransformationStage } from '../../agent/agent.js';
import type { TransformationResult } from '../../agent/types.js';
import {
  listTypeChoices,
  retrieveKnowledge,
  type TypeChoice,
  type RetrievalResult,
} from '../../knowledge/retrieval.js';
import { detectRuleConflicts } from '../../agent/context.js';
import { wrap, terminalWidth, cellWidth } from '../../utils/text.js';
import { debugLog } from '../../utils/log.js';

/**
 * `unscript humanize` — the interactive transformation flow.
 *
 * Write or paste text, pick a content type, tone, and humanization level
 * (all options fetched live from Sanity through the Context MCP), then
 * transform with Gemini and run deterministic preservation validation.
 * Every option and rule shown is retrieved data — a failure anywhere in
 * the chain surfaces as a real error, never a fabricated result.
 *
 * Live status: the "Connecting…" line and the rework run share one
 * single-line progress display (`liveStatus`, prefix `SANITY`) — real
 * step names at real phase boundaries with a single real elapsed timer.
 * After the menu selections finish, only the result page is shown (the
 * background phases collapse into the live line, which is replaced by
 * the result).
 */

type SelectFlowStep = 'content-type' | 'tone' | 'level';

/** Preflight phase labels — fired only after each real phase completes. */
const CONNECT_STEP_LABELS: Record<PreflightStep, string> = {
  initialize: 'session initialized',
  'initial-context': 'initial context loaded',
  'tools-list': 'tools ready',
};

/** Rework phase labels — each maps to real work inside runTransformation. */
const REWORK_STEP_LABELS: Record<TransformationStage, string> = {
  retrieving: 'Retrieving relevant guidance',
  reworking: 'Reworking your text',
  checking: 'Checking the result',
};

function wizardTop(title: string, subtitle: string): string[] {
  const width = frameWidth();
  const wrapped = frameProse(theme.muted(subtitle)).split('\n');
  return [...pageHeader(title, width), '', ...wrapped];
}

function choicesFrom<T extends TypeChoice>(items: T[]): Choice<string>[] {
  return items.map((item) => ({
    id: item.slug,
    label: item.title,
    // Full description feeds the live detail pane under the list; the
    // item row itself stays a single clean line.
    description: item.description,
  }));
}

async function interruptExit(interrupted: boolean): Promise<number> {
  clearScreen();
  process.stdout.write(`${theme.muted(interrupted ? 'Interrupted.' : 'Cancelled.')}\n`);
  if (interrupted) return EXIT_INTERRUPTED;
  // A returned (non-interrupt) cancel still confirms the read before the
  // landing re-renders the menu over the live screen.
  await promptAnyKey();
  return EXIT_OK;
}

async function selectOne(
  step: SelectFlowStep,
  stepNumber: number,
  items: TypeChoice[],
): Promise<{ slug: string } | { interrupted: boolean }> {
  if (items.length === 0) {
    const label =
      step === 'content-type' ? 'content types' : step === 'tone' ? 'tones' : 'humanization levels';
    throw new OperationalError(`No ${label} found in the knowledge base for this request.`, {
      hint: 'Add the matching Sanity knowledge documents, then re-run.',
    });
  }
  const titles: Record<SelectFlowStep, string> = {
    'content-type': 'CONTENT TYPE',
    tone: 'TONE',
    level: 'HUMANIZATION LEVEL',
  };
  const subtitles: Record<SelectFlowStep, string> = {
    'content-type': 'What kind of content are you transforming?',
    tone: 'Which tone should the result have?',
    level: 'How strongly should the text be reworked?',
  };
  const result = await promptSelect(
    () => wizardTop(titles[step], `${subtitles[step]}  ·  step ${stepNumber} of 3`),
    choicesFrom(items),
  );
  if (result.kind === 'exit') return { interrupted: result.interrupted };
  return { slug: result.id };
}

function pageWidth(): number {
  return terminalWidth();
}

function section(title: string): string[] {
  const width = pageWidth();
  return ['', theme.bright(title), rule(Math.min(width, 80)), ''];
}

/**
 * The applied-knowledge block on the result page. A compact selection
 * line, then the transformation rules and writing patterns as grouped,
 * source-tagged items — real provenance only, never invented.
 */
function knowledgeAppliedLines(result: TransformationResult): string[] {
  const selection = [
    result.applied.contentTypeTitle,
    result.applied.toneTitle,
    result.applied.levelTitle,
  ].filter((title): title is string => title !== undefined && title !== '');
  const lines: string[] = [
    `  ${theme.muted('Selection')}  ${
      selection.length > 0 ? theme.bright(selection.join(' · ')) : theme.muted('unknown')
    }`,
  ];

  const rules = result.provenance.filter((entry) => entry.kind === 'transformationRule');
  const patterns = result.provenance.filter((entry) => entry.kind === 'writingPattern');
  const group = (label: string, entries: typeof rules): void => {
    if (entries.length === 0) return;
    lines.push(`  ${theme.bright(label)}`);
    for (const entry of entries) {
      const source =
        entry.source !== undefined && entry.source.name !== undefined
          ? `  ${theme.muted(entry.source.name)}`
          : '';
      lines.push(`    ${theme.accent(sym.dot)} ${entry.title}${source}`);
    }
  };

  if (rules.length === 0 && patterns.length === 0) {
    lines.push(`  ${theme.muted('none retrieved — Sanity returned no applicable knowledge')}`);
  } else {
    group('Transformation rules', rules);
    group('Patterns', patterns);
  }

  if (result.applied.preservationRuleIds.length > 0) {
    lines.push(
      `  ${theme.success(sym.check)} ${result.applied.preservationRuleIds.length} preservation rule(s) enforced`,
    );
  }
  return lines;
}

/** Unique source names (real retrieval provenance, never invented). */
function sourceLines(result: TransformationResult): string[] {
  const seen = new Set<string>();
  const entries = result.provenance.flatMap((entry) =>
    entry.source !== undefined ? [entry.source] : [],
  );
  const unique = entries.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
  if (unique.length === 0)
    return [`  ${theme.muted('no source attached to the retrieved knowledge')}`];
  return unique.map((source) => {
    const name = source.name ?? 'unnamed source';
    return `  • ${name}${source.url !== undefined ? ` — ${source.url}` : ''}`;
  });
}

/**
 * Two side-by-side boxes (ORIGINAL | REWORKED).
 *
 * Both boxes share one row count so the divider stays aligned and no
 * line exceeds the terminal width. ORIGINAL is the quiet reference
 * (muted border); REWORKED carries the accent — the rewritten text is
 * the result, so it is the visible emphasis.
 */
function renderColumns(
  headers: [string, string],
  bodies: [string, string],
  width: number,
): string[] {
  // inner content width per box: two boxes (inner+2 each) + 1-cell gap.
  const inner = Math.max(8, Math.floor((width - 5) / 2));
  const edgeLeft = theme.muted;
  const edgeRight = theme.accent;
  const filler = (line: string): string => {
    const cells = cellWidth(line);
    if (cells > inner) return fitWidth(line, inner);
    return `${line}${' '.repeat(inner - cells)}`;
  };
  const split = (text: string): string[] => {
    const wrapped = wrap(text, inner);
    return wrapped === '' ? [] : wrapped.split('\n');
  };
  const left = split(bodies[0]);
  const right = split(bodies[1]);
  const rows = Math.max(left.length, right.length);
  const head = (label: string, edge: (text: string) => string, primary: boolean): string => {
    const fill = Math.max(1, inner - 3 - cellWidth(label));
    const name = primary ? theme.bright(label) : theme.muted(label);
    return `${edge('┌')}${theme.muted('─')} ${name} ${theme.muted('─'.repeat(fill))}${edge('┐')}`;
  };
  const row = (index: number): string =>
    `${edgeLeft('│')}${filler(left[index] ?? '')}${edgeLeft('│')} ` +
    `${edgeRight('│')}${filler(right[index] ?? '')}${edgeRight('│')}`;
  const bottom =
    `${edgeLeft('└')}${theme.muted('─'.repeat(inner))}${edgeLeft('┘')} ` +
    `${edgeRight('└')}${theme.muted('─'.repeat(inner))}${edgeRight('┘')}`;

  const out: string[] = [
    `${head(headers[0], edgeLeft, false)} ${head(headers[1], edgeRight, true)}`,
  ];
  for (let i = 0; i < rows; i++) out.push(row(i));
  out.push(bottom);
  return out;
}

function renderResult(result: TransformationResult): string[] {
  const width = pageWidth();
  const lines: string[] = ['', ...pageHeader('Reworked', width), ''];

  lines.push(
    ...renderColumns(['ORIGINAL', 'REWORKED'], [result.requestText, result.transformedText], width),
  );

  lines.push(
    '',
    `  ${theme.success(sym.check)} DONE  ${result.applied.ruleIds.length} rule(s) · ` +
      `${result.applied.patternIds.length} pattern(s) · ` +
      `${result.applied.sourceCount} source(s) · ${result.elapsedMs}ms real time`,
  );

  lines.push(...section('KNOWLEDGE APPLIED'));
  lines.push(...knowledgeAppliedLines(result));

  lines.push(...section('SOURCES'));
  lines.push(...sourceLines(result));

  const fixes = result.preservation.changedProtectedItems;
  lines.push(...section('CHECK'));
  if (result.preservation.passed) {
    lines.push(
      `  ${theme.success(sym.check)} PASS  Preservation checks passed (${result.preservation.checked} item(s) verified)`,
    );
  } else {
    lines.push(
      `  ${theme.error(sym.fail)} FAIL  ${fixes.length} protected item(s) appear to have changed:`,
    );
    for (const item of fixes) {
      lines.push(`    - ${item.value}  (${item.kind})`);
    }
  }
  for (const warning of result.preservation.warnings) {
    lines.push(`  ${theme.warning(sym.warn)} ${theme.muted(warning)}`);
  }

  if (result.conflicts.length > 0) {
    lines.push(...section('CONFLICTS'));
    for (const conflict of result.conflicts) {
      lines.push(`  ${theme.warning(sym.warn)} ${conflict.detail}`);
    }
  }

  if (result.notes.length > 0) {
    lines.push(...section('NOTES'));
    for (const note of result.notes) {
      lines.push(`  ${theme.muted(note)}`);
    }
  }

  lines.push(
    '',
    theme.muted('Inspect the retrieved knowledge in depth with `unscript knowledge`.'),
    '',
  );
  return lines;
}

async function runWizard(debug: boolean, config: RuntimeConfig): Promise<number> {
  // Input first: cancel or empty input must not touch Sanity or Gemini.
  const textResult = await promptMultiline({
    title: 'Humanize',
    instruction: 'Write or paste the text you want to rework.',
  });
  if (textResult.kind === 'exit') return interruptExit(textResult.interrupted);
  const originalText = textResult.value.trim();
  if (originalText === '') {
    throw new OperationalError('No text was entered.', {
      hint: 'Provide text to transform, then re-run.',
    });
  }

  const connection = connectRuntime(config);

  // Live preflight: one line that names each real phase as it completes.
  clearScreen();
  const connect = liveStatus(1);
  connect.setStep('connecting to the Context MCP');
  const connectedAt = Date.now();
  await preflightContextMcp(connection.mcp, (step) => connect.setStep(CONNECT_STEP_LABELS[step]));
  if (debug) debugLog(`context mcp preflight (initial_context) in ${Date.now() - connectedAt}ms`);

  connect.setStep('fetching content types, tones and levels');
  try {
    const [contentTypes, tones, levels] = await Promise.all([
      listTypeChoices(connection.mcp, 'contentType'),
      listTypeChoices(connection.mcp, 'toneRule'),
      listTypeChoices(connection.mcp, 'humanizationLevel'),
    ]);

    connect.done('options loaded');
    connect.stop();

    const contentType = await selectOne('content-type', 1, contentTypes);
    if ('interrupted' in contentType) return interruptExit(contentType.interrupted);

    const tone = await selectOne('tone', 2, tones);
    if ('interrupted' in tone) return interruptExit(tone.interrupted);

    const level = await selectOne('level', 3, levels);
    if ('interrupted' in level) return interruptExit(level.interrupted);

    // After the selections finish, the rework collapses to one live line
    // and then only the result page remains — no background screen dump.
    clearScreen();
    const rework = liveStatus(1);
    rework.setStep(REWORK_STEP_LABELS.retrieving);
    const startedAt = Date.now();
    let result: TransformationResult;
    try {
      result = await runTransformation(
        connection,
        {
          text: originalText,
          contentTypeSlug: contentType.slug,
          toneSlug: tone.slug,
          levelSlug: level.slug,
        },
        (stage) => rework.setStep(REWORK_STEP_LABELS[stage]),
      );
    } catch (error) {
      // Leave a clean screen for the error page — no stale status line above it.
      rework.stop();
      clearScreen();
      throw error;
    }
    const elapsed = Date.now() - startedAt;
    debugLog(`transformation finished in ${elapsed}ms`);

    rework.done(
      `DONE in ${elapsed}ms · ${result.applied.ruleIds.length} rule(s) · ` +
        `${result.applied.patternIds.length} pattern(s)`,
    );
    rework.stop();

    const page = await scrollablePage(renderResult(result));
    return page.interrupted ? EXIT_INTERRUPTED : EXIT_OK;
  } finally {
    connect.stop();
  }
}

/** `unscript humanize` — real interactive transformation (TTY required). */
export async function runTransform(debug: boolean, config?: RuntimeConfig): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new OperationalError('the interactive transformation flow needs a terminal', {
      hint: 'Run `unscript humanize` from a terminal, or use `unscript doctor` to check the environment.',
    });
  }
  const resolved = config ?? loadRuntimeConfig();
  const missing = missingRuntimeConfig(resolved);
  if (missing.length > 0) {
    throw new OperationalError(`Cannot transform text: ${missing.join(' and ')} not configured.`, {
      hint: runtimeSetupMessage(missing),
    });
  }
  return runWizard(debug, resolved);
}

/**
 * `unscript knowledge` — inspect real retrieved knowledge (TTY required).
 *
 * Unlike humanize, this flow has no selection menus: it goes straight to
 * the page (like version/help/doctor). It fetches the option lists from
 * Sanity and inspects the first content type, tone, and level — real
 * retrieved data, no hidden interaction steps.
 */
export async function runKnowledge(debug: boolean, config?: RuntimeConfig): Promise<number> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new OperationalError('the knowledge inspector needs a terminal', {
      hint: 'Run `unscript doctor` to check the environment before using `unscript knowledge`.',
    });
  }
  const resolved = config ?? loadRuntimeConfig();
  if (!resolved.contextMcp.configured) {
    throw new OperationalError('Cannot inspect knowledge: Context MCP not configured.', {
      hint: runtimeSetupMessage(missingRuntimeConfig(resolved)),
    });
  }
  const connection = connectRuntime(resolved);

  clearScreen();
  const progress = liveStatus(1);
  progress.setStep('connecting to the Context MCP');
  await preflightContextMcp(connection.mcp, (step) => progress.setStep(CONNECT_STEP_LABELS[step]));
  if (debug) debugLog('knowledge: context mcp preflight ok');

  progress.setStep('fetching content types, tones and levels');
  let contentTypes: TypeChoice[];
  let tones: TypeChoice[];
  let levels: TypeChoice[];
  try {
    [contentTypes, tones, levels] = await Promise.all([
      listTypeChoices(connection.mcp, 'contentType'),
      listTypeChoices(connection.mcp, 'toneRule'),
      listTypeChoices(connection.mcp, 'humanizationLevel'),
    ]);
  } catch (error) {
    progress.stop();
    throw error;
  }
  if (contentTypes.length === 0 || tones.length === 0 || levels.length === 0) {
    progress.stop();
    throw new OperationalError(
      'The knowledge base returned no content types, tones, or humanization levels.',
      { hint: 'Add the matching Sanity knowledge documents, then re-run.' },
    );
  }

  // Direct inspection: first option of each list (deterministic, real).
  const contentType = contentTypes[0]!;
  const tone = tones[0]!;
  const level = levels[0]!;

  progress.setStep('Retrieving knowledge from Sanity');
  let retrieval: RetrievalResult;
  try {
    retrieval = await retrieveKnowledge(connection.mcp, {
      contentTypeSlug: contentType.slug,
      toneSlug: tone.slug,
      levelSlug: level.slug,
    });
  } catch (error) {
    progress.stop();
    throw error;
  }
  progress.done(`inspecting ${contentType.title} · ${tone.title} · ${level.title}`);
  progress.stop();
  if (debug) debugLog(`knowledge: inspects ${contentType.slug}/${tone.slug}/${level.slug}`);

  clearScreen();
  const page = await scrollablePage(renderKnowledge(retrieval));
  return page.interrupted ? EXIT_INTERRUPTED : EXIT_OK;
}

function renderKnowledge(retrieval: RetrievalResult): string[] {
  const width = pageWidth();
  const lines: string[] = ['', ...pageHeader('Knowledge', width), ''];
  const conflicts = detectRuleConflicts(retrieval.transformationRules);

  // Compact, real summary of what is being inspected — no bulky dumps.
  const selection = [
    retrieval.contentType?.title,
    retrieval.tone?.title,
    retrieval.humanizationLevel?.title,
  ].filter((title): title is string => title !== undefined && title !== '');
  lines.push(
    `  ${theme.muted('Inspecting')}  ${
      selection.length > 0 ? theme.bright(selection.join(' · ')) : theme.muted('no selection')
    }`,
    '',
  );

  const items = (lines_: string[]): void => {
    for (const entry of lines_) lines.push(`${entry}`);
  };

  if (retrieval.patterns.length > 0) {
    lines.push(theme.bright('WRITING PATTERNS'), rule(Math.min(width, 80)), '');
    for (const pattern of retrieval.patterns) {
      const severity = pattern.severity !== undefined ? `  ${theme.muted(pattern.severity)}` : '';
      lines.push(`  ${theme.accent(sym.pointer)} ${theme.bright(pattern.title)}${severity}`);
      if (pattern.pattern !== undefined && pattern.pattern !== '') {
        items(wrapInline(`    ${pattern.pattern}`, width - 2));
      }
      if (pattern.whenToChange !== undefined && pattern.whenToChange !== '') {
        items(
          wrapInline(`    ${theme.muted('When to change:')} ${pattern.whenToChange}`, width - 2),
        );
      }
      lines.push('');
    }
  }

  lines.push(theme.bright('TRANSFORMATION RULES'), rule(Math.min(width, 80)), '');
  for (const rule_ of retrieval.transformationRules) {
    const priority =
      rule_.priority !== undefined ? `  ${theme.muted(`priority ${rule_.priority}`)}` : '';
    lines.push(`  ${theme.accent(sym.pointer)} ${theme.bright(rule_.title)}${priority}`);
    if (rule_.instruction !== undefined && rule_.instruction !== '') {
      items(wrapInline(`    ${rule_.instruction}`, width - 2));
    }
    if (rule_.trigger !== undefined && rule_.trigger !== '') {
      items(wrapInline(`    ${theme.muted('Trigger:')} ${rule_.trigger}`, width - 2));
    }
    lines.push('');
  }

  if (retrieval.preservationRules.length > 0) {
    lines.push(theme.bright('PRESERVATION RULES'), rule(Math.min(width, 80)), '');
    for (const rule_ of retrieval.preservationRules) {
      const weight =
        rule_.priority !== undefined ? `  ${theme.muted(`weight ${rule_.priority}`)}` : '';
      lines.push(`  ${theme.accent(sym.pointer)} ${theme.bright(rule_.title)}${weight}`);
      if (rule_.whatToPreserve !== undefined && rule_.whatToPreserve !== '') {
        items(wrapInline(`    ${rule_.whatToPreserve}`, width - 2));
      }
      if (rule_.whatMustNotChange !== undefined && rule_.whatMustNotChange !== '') {
        items(
          wrapInline(
            `    ${theme.muted('Must not change:')} ${rule_.whatMustNotChange}`,
            width - 2,
          ),
        );
      }
      lines.push('');
    }
  }

  if (conflicts.length > 0) {
    lines.push(theme.bright('CONFLICTS'), rule(Math.min(width, 80)), '');
    for (const conflict of conflicts) {
      lines.push(`  ${theme.warning(sym.warn)} ${conflict.detail}`);
    }
    lines.push('');
  }

  if (retrieval.sources.length > 0) {
    lines.push(theme.bright('SOURCES'), rule(Math.min(width, 80)), '');
    for (const source of retrieval.sources) {
      const name = source.name ?? source.title;
      lines.push(`  ${theme.accent(sym.pointer)} ${theme.bright(name)}`);
      if (source.url !== undefined && source.url !== '') {
        lines.push(`    ${theme.muted(source.url)}`);
      }
    }
    lines.push('');
  }

  lines.push('');
  return lines;
}

/** Wrap a line to the page width, returning the split rows (never empty). */
function wrapInline(text: string, width: number): string[] {
  const wrapped = wrap(text, width);
  return wrapped === '' ? [] : wrapped.split('\n');
}
