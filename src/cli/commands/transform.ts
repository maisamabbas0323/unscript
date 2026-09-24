import { theme, sym } from '../ui/theme.js';
import { pageHeader, rule } from '../ui/banner.js';
import { clearScreen, frameProse, frameWidth } from '../ui/terminal.js';
import { promptSelect, promptAnyKey, type Choice } from '../ui/menu.js';
import { promptMultiline } from '../ui/input.js';
import { fitWidth } from '../ui/screen.js';
import { OperationalError, EXIT_INTERRUPTED, EXIT_OK } from '../../core/errors.js';
import {
  loadRuntimeConfig,
  missingRuntimeConfig,
  runtimeSetupMessage,
  type RuntimeConfig,
} from '../../config/env.js';
import { connectRuntime, preflightContextMcp } from '../runtime.js';
import { runTransformation } from '../../agent/agent.js';
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
import { GEMINI_MODEL } from '../../gemini/types.js';

/**
 * `unscript humanize` — the interactive transformation flow.
 *
 * Write or paste text, pick a content type, tone, and humanization level
 * (all options fetched live from Sanity through the Context MCP), then
 * transform with Gemini and run deterministic preservation validation.
 * Every option and rule shown is retrieved data — a failure anywhere in
 * the chain surfaces as a real error, never a fabricated result.
 */

type SelectFlowStep = 'content-type' | 'tone' | 'level';

function wizardTop(title: string, subtitle: string): string[] {
  const width = frameWidth();
  const wrapped = frameProse(theme.muted(subtitle)).split('\n');
  return [...pageHeader(title, width), '', ...wrapped];
}

function choicesFrom<T extends TypeChoice>(items: T[]): Choice<string>[] {
  return items.map((item) => ({
    id: item.slug,
    label: item.title,
    note: item.description !== undefined ? item.description.slice(0, 64) : undefined,
  }));
}

function interruptExit(interrupted: boolean): number {
  clearScreen();
  process.stdout.write(`${theme.muted(interrupted ? 'Interrupted.' : 'Cancelled.')}\n`);
  return interrupted ? EXIT_INTERRUPTED : EXIT_OK;
}

async function selectOne(
  step: SelectFlowStep,
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
    () => wizardTop(titles[step], subtitles[step]),
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

/** Real provenance of the rules and patterns that shaped the result. */
function appliedRuleLines(result: TransformationResult): string[] {
  const rules = result.provenance.filter(
    (entry) => entry.kind === 'transformationRule' || entry.kind === 'writingPattern',
  );
  if (rules.length === 0)
    return [`  ${theme.muted('none retrieved — Sanity returned no applicable knowledge')}`];
  return rules.map((entry) => {
    const label = entry.kind === 'writingPattern' ? 'pattern' : 'rule';
    const source =
      entry.source !== undefined && entry.source.name !== undefined
        ? ` — ${entry.source.name}`
        : '';
    return `  • ${entry.title}  ${theme.muted(`(${label})${source}`)}`;
  });
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
 * Two side-by-side rectangle boxes (ORIGINAL | REWORKED).
 *
 * Each box is drawn with the same border grammar as the interactive
 * menus (┌─┐│└┘); both boxes share one row count, so the divider stays
 * aligned and no line exceeds the terminal width. This is the whole
 * result screen: the original text and its rework — nothing ghosted
 * behind them.
 */
function renderColumns(
  headers: [string, string],
  bodies: [string, string],
  width: number,
): string[] {
  // inner content width per box: two boxes (inner+2 each) + 1-cell gap.
  const inner = Math.max(8, Math.floor((width - 5) / 2));
  const edge = theme.accent;
  const filler = (line: string): string => {
    const cells = cellWidth(line);
    if (cells > inner) return fitWidth(line, inner);
    return `${line}${' '.repeat(inner - cells)}`;
  };
  const split = (text: string): string[] =>
    wrap(text, inner) === '' ? [] : wrap(text, inner).split('\n');
  const left = split(bodies[0]);
  const right = split(bodies[1]);
  const rows = Math.max(left.length, right.length);
  const head = (label: string): string => {
    const fill = Math.max(1, inner - 3 - cellWidth(label));
    return `${edge('┌')}${theme.muted('─')} ${theme.bright(label)} ${theme.muted('─'.repeat(fill))}${edge('┐')}`;
  };
  const row = (index: number): string =>
    `${edge('│')}${filler(left[index] ?? '')}${edge('│')} ` +
    `${edge('│')}${filler(right[index] ?? '')}${edge('│')}`;
  const bottom =
    `${edge('└')}${theme.muted('─'.repeat(inner))}${edge('┘')} ` +
    `${edge('└')}${theme.muted('─'.repeat(inner))}${edge('┘')}`;

  const out: string[] = [`${head(headers[0])} ${head(headers[1])}`];
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

  lines.push(...section('KNOWLEDGE APPLIED'));
  lines.push(`  Content type:  ${result.applied.contentTypeTitle ?? 'unknown'}`);
  lines.push(`  Tone:          ${result.applied.toneTitle ?? 'unknown'}`);
  lines.push(`  Level:         ${result.applied.levelTitle ?? 'unknown'}`);
  lines.push(...appliedRuleLines(result));
  if (result.applied.preservationRuleIds.length > 0) {
    lines.push(
      `  ${theme.muted(`${result.applied.preservationRuleIds.length} preservation rule(s) enforced`)}`,
    );
  }

  lines.push(...section('SOURCES'));
  lines.push(...sourceLines(result));

  const fixes = result.preservation.changedProtectedItems;
  lines.push(...section('VALIDATION'));
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
    theme.muted(
      `Knowledge used: ${result.applied.ruleIds.length} transformation rule(s) · ` +
        `${result.applied.patternIds.length} pattern(s) · ` +
        `${result.applied.sourceCount} source(s) · ${result.elapsedMs}ms real time`,
    ),
    theme.muted('Inspect the retrieved knowledge in depth with `unscript knowledge`.'),
    '',
  );
  return lines;
}

async function runWizard(debug: boolean, config: RuntimeConfig): Promise<number> {
  // Input first: cancel or empty input must not touch Sanity or Gemini.
  const textResult = await promptMultiline({
    title: 'Humanize',
    instruction:
      'Paste or type the text to transform, then finish with Shift+Enter or a lone `.` on its own line. Esc cancels. Blank lines inside the pasted text are kept.',
  });
  if (textResult.kind === 'exit') return interruptExit(textResult.interrupted);
  const originalText = textResult.value.trim();
  if (originalText === '') {
    throw new OperationalError('No text was entered.', {
      hint: 'Provide text to transform, then re-run.',
    });
  }

  const connection = connectRuntime(config);

  clearScreen();
  process.stdout.write(`${theme.muted('Connecting to the Context MCP…')}\n`);
  const connectedAt = Date.now();
  await preflightContextMcp(connection.mcp);
  process.stdout.write('\u001b[1A\u001b[K');
  if (debug) debugLog(`context mcp preflight (initial_context) in ${Date.now() - connectedAt}ms`);

  const [contentTypes, tones, levels] = await Promise.all([
    listTypeChoices(connection.mcp, 'contentType'),
    listTypeChoices(connection.mcp, 'toneRule'),
    listTypeChoices(connection.mcp, 'humanizationLevel'),
  ]);

  const contentType = await selectOne('content-type', contentTypes);
  if ('interrupted' in contentType) return interruptExit(contentType.interrupted);

  const tone = await selectOne('tone', tones);
  if ('interrupted' in tone) return interruptExit(tone.interrupted);

  const level = await selectOne('level', levels);
  if ('interrupted' in level) return interruptExit(level.interrupted);

  clearScreen();
  process.stdout.write(`${theme.muted('Retrieving knowledge from Sanity…')}\n`);
  process.stdout.write(`${theme.muted(`Transforming with ${GEMINI_MODEL}…`)}\n`);
  const startedAt = Date.now();
  const result = await runTransformation(connection, {
    text: originalText,
    contentTypeSlug: contentType.slug,
    toneSlug: tone.slug,
    levelSlug: level.slug,
  });
  process.stdout.write('\u001b[2A\u001b[J');
  debugLog(`transformation finished in ${Date.now() - startedAt}ms`);

  clearScreen();
  const lines = renderResult(result);
  for (const line of lines) process.stdout.write(`${line}\n`);
  return EXIT_OK;
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

/** `unscript knowledge` — inspect real retrieved knowledge (TTY required). */
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
  process.stdout.write(`${theme.muted('Connecting to the Context MCP…')}\n`);
  await preflightContextMcp(connection.mcp);
  process.stdout.write('\u001b[1A\u001b[K');
  if (debug) debugLog('knowledge: context mcp preflight ok');

  const [contentTypes, tones, levels] = await Promise.all([
    listTypeChoices(connection.mcp, 'contentType'),
    listTypeChoices(connection.mcp, 'toneRule'),
    listTypeChoices(connection.mcp, 'humanizationLevel'),
  ]);

  const contentType = await selectOne('content-type', contentTypes);
  if ('interrupted' in contentType) return interruptExit(contentType.interrupted);
  const tone = await selectOne('tone', tones);
  if ('interrupted' in tone) return interruptExit(tone.interrupted);
  const level = await selectOne('level', levels);
  if ('interrupted' in level) return interruptExit(level.interrupted);

  clearScreen();
  process.stdout.write(`${theme.muted('Retrieving knowledge from Sanity…')}\n`);
  const retrieval = await retrieveKnowledge(connection.mcp, {
    contentTypeSlug: contentType.slug,
    toneSlug: tone.slug,
    levelSlug: level.slug,
  });
  process.stdout.write('\u001b[1A\u001b[K');

  clearScreen();
  const lines = renderKnowledge(retrieval);
  for (const line of lines) process.stdout.write(`${line}\n`);
  await promptAnyKey();
  clearScreen();
  return EXIT_OK;
}

function renderKnowledge(retrieval: RetrievalResult): string[] {
  const width = pageWidth();
  const lines: string[] = ['', ...pageHeader('Knowledge', width), ''];
  const conflicts = detectRuleConflicts(retrieval.transformationRules);

  const push = (label: string, value?: string): void => {
    if (value !== undefined && value !== '')
      lines.push(`  ${theme.bright(label)}${wrap(value, width - 4)}`);
  };

  if (retrieval.contentType !== null) {
    lines.push(theme.bright('CONTENT TYPE'), rule(Math.min(width, 80)));
    push('', retrieval.contentType.title);
    push('', retrieval.contentType.description);
    push(
      '',
      retrieval.contentType.audience ? `Audience: ${retrieval.contentType.audience}` : undefined,
    );
    push(
      '',
      retrieval.contentType.preservationConsiderations
        ? `Preservation considerations: ${retrieval.contentType.preservationConsiderations}`
        : undefined,
    );
  }
  if (retrieval.humanizationLevel !== null) {
    lines.push('', theme.bright('HUMANIZATION LEVEL'), rule(Math.min(width, 80)));
    push('', retrieval.humanizationLevel.title);
    push('', retrieval.humanizationLevel.description);
    push(
      '',
      retrieval.humanizationLevel.sentenceChange
        ? `Sentences: ${retrieval.humanizationLevel.sentenceChange}`
        : undefined,
    );
    push(
      '',
      retrieval.humanizationLevel.vocabularyChange
        ? `Vocabulary: ${retrieval.humanizationLevel.vocabularyChange}`
        : undefined,
    );
  }
  if (retrieval.tone !== null) {
    lines.push('', theme.bright('TONE'), rule(Math.min(width, 80)));
    push('', retrieval.tone.title);
    push(
      '',
      retrieval.tone.toneCharacteristics
        ? `Characteristics: ${retrieval.tone.toneCharacteristics}`
        : undefined,
    );
    push(
      '',
      retrieval.tone.preferredLanguage
        ? `Preferred language: ${retrieval.tone.preferredLanguage}`
        : undefined,
    );
    push(
      '',
      retrieval.tone.avoidLanguage ? `Avoid language: ${retrieval.tone.avoidLanguage}` : undefined,
    );
  }

  if (retrieval.patterns.length > 0) {
    lines.push('', theme.bright('WRITING PATTERNS'), rule(Math.min(width, 80)));
    for (const pattern of retrieval.patterns) {
      lines.push(`  • ${theme.bright(pattern.title)} (${pattern.severity ?? 'severity unknown'})`);
      if (pattern.pattern !== undefined) lines.push(`    ${wrap(pattern.pattern, width - 4)}`);
      if (pattern.whenToChange !== undefined) {
        lines.push(`    When to change: ${wrap(pattern.whenToChange, width - 4)}`);
      }
    }
  }

  lines.push('', theme.bright('TRANSFORMATION RULES'), rule(Math.min(width, 80)));
  for (const rule of retrieval.transformationRules) {
    const priority = rule.priority !== undefined ? ` · priority ${rule.priority}` : '';
    lines.push(`  ${theme.bright(rule.title)} (${rule.slug ?? rule._id})${priority}`);
    if (rule.instruction !== undefined) lines.push(`    ${wrap(rule.instruction, width - 4)}`);
    if (rule.trigger !== undefined && rule.trigger !== '') {
      lines.push(`    Trigger: ${wrap(rule.trigger, width - 4)}`);
    }
  }

  lines.push('', theme.bright('PRESERVATION RULES'), rule(Math.min(width, 80)));
  for (const rule of retrieval.preservationRules) {
    const weight = rule.priority !== undefined ? ` · weight ${rule.priority}` : '';
    lines.push(`  ${theme.bright(rule.title)} (${rule.slug ?? rule._id})${weight}`);
    if (rule.whatToPreserve !== undefined)
      lines.push(`    Preserve: ${wrap(rule.whatToPreserve, width - 4)}`);
    if (rule.whatMustNotChange !== undefined) {
      lines.push(`    Must not change: ${wrap(rule.whatMustNotChange, width - 4)}`);
    }
  }

  if (conflicts.length > 0) {
    lines.push('', theme.bright('CONFLICTS'), rule(Math.min(width, 80)));
    for (const conflict of conflicts) {
      lines.push(`  ${theme.warning(sym.warn)} ${conflict.detail}`);
    }
  }

  if (retrieval.sources.length > 0) {
    lines.push('', theme.bright('SOURCES'), rule(Math.min(width, 80)));
    for (const source of retrieval.sources) {
      const name = source.name ?? source.title;
      lines.push(`  • ${name}${source.url !== undefined ? ` — ${source.url}` : ''}`);
    }
  }

  if (retrieval.userDecisions.length > 0) {
    lines.push('', theme.bright('USER DECISIONS'), rule(Math.min(width, 80)));
    for (const decision of retrieval.userDecisions) {
      lines.push(
        `  • ${decision.title}${decision.decision !== undefined ? `: ${decision.decision}` : ''}`,
      );
    }
  }

  lines.push('');
  return lines;
}
