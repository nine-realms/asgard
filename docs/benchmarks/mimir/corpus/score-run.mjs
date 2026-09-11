#!/usr/bin/env node
/**
 * Score a Mimir review run against the labeled PR feedback corpus.
 *
 * Reads Mimir's markdown (or JSON) findings for one PR, matches them against the
 * corpus positives for that PR, and reports recall plus the findings that matched
 * nothing.
 *
 * IMPORTANT: the corpus is not exhaustive. A finding that matches no corpus row is
 * *unmatched*, not a false positive — reviewers miss things too. Unmatched findings
 * are output for hand-triage, and only hand-triage produces a precision number.
 *
 * Usage:
 *   node score-run.mjs --corpus data/owner__repo.jsonl --pr 35 --findings run.md [--tolerance 5]
 */

import { readFile } from 'node:fs/promises';
import { DEFECT_CLASSES, DEFAULT_RECALL_CLASSES } from './labeling.mjs';

/**
 * Reviewers anchor a comment anywhere in the construct they are describing — often the end
 * of a diff hunk, while the agent cites the offending call. Observed same-issue pairs sat
 * up to ~10 lines apart, so a tight window reports genuine catches as misses. The
 * same-file tier and its printed delta make over-wide matches easy to spot in triage.
 */
const DEFAULT_LINE_TOLERANCE = 20;

const SEVERITY_RANK = { minor: 1, major: 2, critical: 3 };

/**
 * `--min-severity` is retained but is the wrong instrument for almost every question, and
 * is deliberately not the default. Measured across the corpus, the grades automated
 * reviewers assign track *how cheap the fix is*, not how much the defect matters:
 * `.vscode/launch.json` drift is graded `major`, while "this test asserts nothing" and
 * "these generated IDs can collide" are graded `minor`. A severity floor therefore deletes
 * the strongest evidence of a real agent gap and keeps the noise. Filter on
 * `--defect-class` instead; severity is kept only for slicing a report after the fact.
 */

/** Section headings that wrap findings rather than being one. */
const SECTION_HEADINGS = /^(findings|walkthrough|changed files|verdict|summary|review|output)\b/i;

/**
 * Parses Mimir's Pass 3 finding blocks: "**File**: `path/to/x.cs` line 42".
 * Finding headings are emitted at either `###` or `####` depending on whether the review
 * nests them under a "Findings" section, so both are accepted and the wrapper headings are
 * filtered out by title.
 */
function parseMarkdownFindings(text) {
  const findings = [];
  const blocks = text.split(/^#{3,4}\s+/m).slice(1);
  for (const block of blocks) {
    const title = block.split('\n', 1)[0].trim();
    if (SECTION_HEADINGS.test(title.replace(/^[🔴🟡🟠⚪\s]+/u, ''))) continue;
    const fileLine = block.match(/\*\*File\*\*:\s*([^\n]+)/i);
    if (!fileLine) continue;
    const pathMatch = fileLine[1].match(/`([^`]+)`/);
    if (!pathMatch) continue;

    // Tolerates "`path` line 42", "`path` lines 42-50", "`path:42`", and "(line 42)".
    let filePath = pathMatch[1];
    let line = null;
    const suffixed = filePath.match(/^(.*?):([0-9]+)$/);
    if (suffixed) {
      filePath = suffixed[1];
      line = Number(suffixed[2]);
    }
    const explicit = fileLine[1].match(/lines?\s*([0-9]+)/i);
    if (explicit) line = Number(explicit[1]);

    findings.push({
      title: title.replace(/^[🔴🟡🟠⚪]\s*/u, ''),
      severity: /🔴/u.test(title) ? 'must-fix' : 'should-fix',
      path: filePath,
      line,
      category: (block.match(/\*\*Category\*\*:\s*([^\n]+)/i)?.[1] || 'unknown').trim(),
      confidence: (block.match(/\*\*Confidence\*\*:\s*([^\n]+)/i)?.[1] || 'unknown').trim(),
      body: block,
    });
  }
  return findings;
}

/** First substantive line of a comment — skips marker prefixes and collapsed blocks. */
function excerpt(body) {
  const cleaned = String(body || '')
    .replace(/<details>[\s\S]*?<\/details>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const bold = cleaned.match(/\*\*([^*]{12,})\*\*/);
  if (bold) return bold[1].trim().slice(0, 140);
  const line = cleaned
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^_.*_(\s*\|\s*_.*_)*$/.test(l));
  return (line || '').slice(0, 140);
}

async function loadFindings(file) {
  const raw = await readFile(file, 'utf8');
  if (file.endsWith('.json')) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.findings || [];
  }
  return parseMarkdownFindings(raw);
}

async function loadCorpus(file, pr, minSeverity, recallClasses) {
  const raw = await readFile(file, 'utf8');
  const all = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.pr === pr && r.label === 'positive');

  // Defect class is the meaningful filter. Rows Mimir was instructed not to report
  // (convention, tooling) are excluded by default rather than counted as misses.
  const classes = new Set(recallClasses);
  const inScope = all.filter((r) => classes.has(r.defect_class));
  const outOfScope = all.length - inScope.length;
  const outOfScopeByClass = all
    .filter((r) => !classes.has(r.defect_class))
    .reduce((acc, r) => {
      acc[r.defect_class] = (acc[r.defect_class] || 0) + 1;
      return acc;
    }, {});

  // Dedupe is applied *after* the class filter, and only when the surviving twin is itself
  // in scope. Otherwise an out-of-scope sibling silently absorbs an in-scope defect and
  // deletes it from the denominator — the row would be counted nowhere at all.
  const inScopeIds = new Set(inScope.map((r) => r.comment_id));
  const deduped = inScope.filter((r) => !(r.duplicate_of && inScopeIds.has(r.duplicate_of)));
  const duplicates = inScope.length - deduped.length;

  if (!minSeverity) {
    return { rows: deduped, dropped: 0, duplicates, outOfScope, outOfScopeByClass };
  }

  const floor = SEVERITY_RANK[minSeverity];
  // Ungraded rows are dropped too: without a severity there is no way to tell whether the
  // comment clears the bar, and silently keeping them would defeat the filter.
  const kept = deduped.filter((r) => SEVERITY_RANK[r.reported_severity] >= floor);
  return {
    rows: kept, dropped: deduped.length - kept.length, duplicates, outOfScope, outOfScopeByClass,
  };
}

/**
 * Match quality tiers, strongest first:
 *
 *   exact     — same file, line within tolerance. The only tier counted as recall.
 *   file-only — same file, one side has no line number.
 *   cross-ref — different files, but one side names the other's path. See below.
 *   same-file — same file, both lines known, outside tolerance.
 *
 * `same-file` exists to separate line drift from a genuine miss. Corpus line numbers are
 * anchored to the PR head commit; if the review is run against a different checkout the
 * lines shift wholesale, and every pair lands here. A run with many `same-file` pairs and
 * no exact ones is a protocol error (wrong checkout), not a recall failure.
 *
 * `cross-ref` exists because a reviewer and the agent can describe the same defect from
 * opposite ends. Generated contract artifacts are the common case: a comment anchored on
 * a spec line ("this response example is wrong") and a finding anchored on the source
 * that produced it are the same defect, but share no path. Path-equality scoring calls
 * that a miss and undercounts recall. It is a text heuristic, so it is reported for
 * confirmation rather than counted as recall.
 */
const TIER_ORDER = { exact: 0, 'file-only': 1, 'cross-ref': 2, 'same-file': 3 };

/** Paths distinctive enough that a mention is evidence, not coincidence. */
const GENERIC_BASENAMES = /^(index|main|app|test|types|utils|helpers|constants|config|setup)\.[a-z]+$/i;

function pathAliases(p) {
  const aliases = [p];
  const base = p.split('/').pop();
  if (base && base.length >= 8 && !GENERIC_BASENAMES.test(base)) aliases.push(base);
  return aliases;
}

function mentions(text, p) {
  const haystack = String(text || '');
  return pathAliases(p).some((alias) => haystack.includes(alias));
}

/**
 * Direction matters. A corpus comment naming the source file is specific evidence about
 * one defect. A finding naming the artifact is weak: every corpus row in that artifact
 * matches it equally, so the pair is a guess among siblings. Rank strong pairs first and
 * label weak ones in the report so they are confirmed, not counted on sight.
 */
function crossRefStrength(finding, row) {
  if (mentions(row.body, finding.path)) return 0;
  if (mentions(finding.body, row.path)) return 1;
  return null;
}

function matchQuality(finding, row, tolerance) {
  if (finding.path !== row.path) {
    // Symptom/cause pairs: the corpus comment names the source file, or the finding cites
    // the artifact it was derived from. Requires an explicit path mention on one side.
    return crossRefStrength(finding, row) === null ? null : 'cross-ref';
  }
  if (finding.line == null || row.line == null) return 'file-only';
  return Math.abs(finding.line - row.line) <= tolerance ? 'exact' : 'same-file';
}

function lineDistance(finding, row) {
  if (finding.line == null || row.line == null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(finding.line - row.line);
}

function parseArgs(argv) {
  const args = { tolerance: DEFAULT_LINE_TOLERANCE, defectClasses: [...DEFAULT_RECALL_CLASSES] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--corpus') args.corpus = argv[++i];
    else if (a === '--pr') args.pr = Number(argv[++i]);
    else if (a === '--findings') args.findings = argv[++i];
    else if (a === '--tolerance') args.tolerance = Number(argv[++i]);
    else if (a === '--min-severity') args.minSeverity = argv[++i];
    else if (a === '--defect-class') args.defectClasses = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--all-classes') args.defectClasses = [...DEFECT_CLASSES];
    else throw new Error(`Unknown argument: ${a}`);
  }
  for (const req of ['corpus', 'pr', 'findings']) {
    if (args[req] === undefined) throw new Error(`--${req} is required`);
  }
  if (!Number.isInteger(args.pr) || args.pr < 1) throw new Error('--pr must be a positive integer');
  if (!Number.isInteger(args.tolerance) || args.tolerance < 0) {
    throw new Error('--tolerance must be a non-negative integer');
  }
  if (args.minSeverity && !SEVERITY_RANK[args.minSeverity]) {
    throw new Error(`--min-severity must be one of ${Object.keys(SEVERITY_RANK).join(', ')}`);
  }
  const unknown = args.defectClasses.filter((c) => !DEFECT_CLASSES.includes(c));
  if (unknown.length) {
    throw new Error(`--defect-class must be from ${DEFECT_CLASSES.join(', ')} (got ${unknown.join(', ')})`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [corpus, findings] = await Promise.all([
    loadCorpus(args.corpus, args.pr, args.minSeverity, args.defectClasses),
    loadFindings(args.findings),
  ]);
  const expected = corpus.rows;

  if (expected.length === 0) {
    process.stderr.write(`No positive corpus rows for PR #${args.pr} — nothing to score.\n`);
    process.exit(1);
  }

  const usedFindings = new Set();
  const caught = [];
  const missed = [];

  // Assign exact line matches before file-only ones, closest line first. Corpus-order
  // greedy assignment lets one row consume the only candidate for a neighbouring row,
  // producing a false miss and a false catch in the same file.
  const pairs = [];
  expected.forEach((row, rowIndex) => {
    findings.forEach((finding, findingIndex) => {
      const quality = matchQuality(finding, row, args.tolerance);
      // Line distance is meaningless across files; rank cross-ref pairs by evidence
      // direction instead so the specific pairing wins over the ambiguous one.
      const distance = quality === 'cross-ref'
        ? crossRefStrength(finding, row)
        : lineDistance(finding, row);
      if (quality) pairs.push({ rowIndex, findingIndex, quality, distance });
    });
  });
  pairs.sort((a, b) => {
    if (a.quality !== b.quality) return TIER_ORDER[a.quality] - TIER_ORDER[b.quality];
    return a.distance - b.distance;
  });

  const usedRows = new Set();
  for (const pair of pairs) {
    if (usedRows.has(pair.rowIndex) || usedFindings.has(pair.findingIndex)) continue;
    usedRows.add(pair.rowIndex);
    usedFindings.add(pair.findingIndex);
    caught.push({
      row: expected[pair.rowIndex],
      finding: findings[pair.findingIndex],
      quality: pair.quality,
      distance: pair.distance,
    });
  }
  expected.forEach((row, i) => {
    if (!usedRows.has(i)) missed.push(row);
  });

  const unmatched = findings.filter((_, i) => !usedFindings.has(i));
  const exact = caught.filter((c) => c.quality === 'exact');
  const fileOnly = caught.filter((c) => c.quality === 'file-only');
  const crossRef = caught.filter((c) => c.quality === 'cross-ref');
  const sameFile = caught.filter((c) => c.quality === 'same-file');
  const recall = exact.length / expected.length;
  const recallUpper = (exact.length + fileOnly.length + crossRef.length) / expected.length;
  const driftSuspected = exact.length === 0 && sameFile.length >= 2;

  const laneRecall = (lane) => {
    const total = expected.filter((r) => r.lane === lane).length;
    const hit = exact.filter((c) => c.row.lane === lane).length;
    return total === 0 ? 'n/a' : `${hit}/${total}`;
  };

  const lines = [
    `# Mimir score — PR #${args.pr}`,
    '',
    `Corpus positives: **${expected.length}**${corpus.dropped ? ` (${corpus.dropped} below \`${args.minSeverity}\` severity, excluded)` : ''}`,
    `Scope: defect class ${args.defectClasses.map((c) => `\`${c}\``).join(', ')}`
      + (corpus.outOfScope
        ? ` — ${corpus.outOfScope} out-of-scope positive(s) excluded (${Object.entries(corpus.outOfScopeByClass).map(([k, v]) => `${k} ${v}`).join(', ')})`
        : '')
      + (corpus.duplicates ? ` · ${corpus.duplicates} restated defect(s) deduped` : ''),
    `Mimir findings: **${findings.length}**`,
    `Caught: **${exact.length}** line-level, **${fileOnly.length}** file-only, **${crossRef.length}** cross-ref, **${sameFile.length}** same-file · Missed: **${missed.length}** · Unmatched: **${unmatched.length}**`,
    `Recall: **${(recall * 100).toFixed(1)}%** line-level (upper bound ${(recallUpper * 100).toFixed(1)}% counting file-only and cross-ref matches)`,
    `By lane: cross-cutting ${laneRecall('cross-cutting')}, surface ${laneRecall('surface')}`,
    '',
    ...(driftSuspected
      ? ['> **Protocol warning**: no line-level matches but multiple same-file pairs. The review',
        '> was probably run against a different checkout than the PR head commit, so line numbers',
        '> are not comparable. Re-run against the PR head sha before trusting this number.', '']
      : []),
    ...(sameFile.length
      ? ['## Same-file, different line — drift or genuine miss', '',
        ...sameFile.map((c) => `- \`${c.row.path}\` corpus:${c.row.line} ↔ finding:${c.finding.line} (Δ${c.distance === Number.MAX_SAFE_INTEGER ? '?' : c.distance}) — ${c.finding.title}`),
        '']
      : []),
    ...(crossRef.length
      ? ['## Cross-reference matches — symptom/cause pairs, confirm before counting', '',
        ...crossRef.map((c) => `- ${c.distance === 0 ? 'strong' : 'weak'} · corpus \`${c.row.path}:${c.row.line ?? '?'}\` ↔ finding \`${c.finding.path}:${c.finding.line ?? '?'}\` — ${c.finding.title}`),
        '']
      : []),
    ...(fileOnly.length
      ? ['## File-only matches — confirm before counting', '',
        ...fileOnly.map((c) => `- \`${c.row.path}\` corpus:${c.row.line ?? '?'} ↔ finding:${c.finding.line ?? '?'} — ${c.finding.title}`),
        '']
      : []),
    '## Missed — no matching finding',
    ...(missed.length
      ? missed.map((r) => `- \`${r.path}:${r.line}\` [${r.category}/${r.lane}] ${excerpt(r.body)}`)
      : ['- none']),
    '',
    '## Unmatched Mimir findings — hand-triage required',
    '',
    'Mark each as a true finding the corpus missed, or a false positive. Only this step yields precision.',
    '',
    ...(unmatched.length
      ? unmatched.map((f) => `- \`${f.path}:${f.line ?? '?'}\` [${f.category}/${f.confidence}] ${f.title}`)
      : ['- none']),
    '',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
