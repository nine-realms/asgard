#!/usr/bin/env node
/**
 * Re-apply labeling rules to an already-extracted corpus.
 *
 * Extraction is expensive and rate-limited — mining 174 PRs costs hundreds of GraphQL and
 * commit-file calls. But every labeling decision (`category`, `defect_class`,
 * `reported_severity`, `lane`, dedupe) is a pure function of the comment body and path,
 * all of which are already stored. So a labeling change does not need a re-mine, and
 * re-mining for one would silently move the ground truth underneath the comparison:
 * newly merged PRs would appear and the before/after numbers would no longer be measuring
 * the rule change.
 *
 * This rewrites the labels in place and leaves the evidence fields (`acted_on`,
 * `outdated`, `followup_commit`, ...) untouched, so a relabeled corpus stays comparable to
 * the run it is scored against.
 *
 * Usage:
 *   node relabel.mjs [--data ./data] [--dry-run]
 */

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CROSS_CUTTING_CATEGORIES,
  NON_ACTIONABLE_CATEGORIES,
  classify,
  defectClass,
  findDuplicates,
  parseSeverity,
} from './labeling.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { data: path.join(HERE, 'data'), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--data') args.data = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

/**
 * Recomputes every derived label from the stored body/path. `acted_on`, `author_type` and
 * `author_allowed` are evidence, not labels — they come from GitHub and the extraction
 * run's `--authors` filter, and are preserved as-is.
 *
 * `author_allowed` has to be read back rather than recomputed because `--authors` is a
 * property of the extraction run, not of the row. A corpus mined with `--authors human`
 * and relabeled without that term would silently absorb every acted-on bot comment into
 * the denominator, and nothing in the JSONL would record that it happened. Corpora
 * extracted before this field existed were mined with the default `--authors all`, so a
 * missing value is treated as allowed.
 */
function relabelRow(row) {
  const category = classify(row.body);
  const authorAllowed = row.author_allowed !== false;
  const label = row.acted_on && authorAllowed && !NON_ACTIONABLE_CATEGORIES.has(category)
    ? 'positive'
    : 'excluded';
  return {
    ...row,
    category,
    defect_class: defectClass(row.body, row.path),
    reported_severity: parseSeverity(row.body),
    lane: CROSS_CUTTING_CATEGORIES.has(category) ? 'cross-cutting' : 'surface',
    needs_triage: category === 'other',
    label,
  };
}

function diffCounts(before, after, key) {
  const moved = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i][key] !== after[i][key]) {
      moved.push(`${before[i][key] ?? 'none'} → ${after[i][key] ?? 'none'}`);
    }
  }
  return moved.reduce((acc, m) => {
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = (await readdir(args.data)).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) throw new Error(`No .jsonl corpora found in ${args.data}`);

  for (const file of files) {
    const full = path.join(args.data, file);
    const before = (await readFile(full, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const after = before.map(relabelRow);

    // Dedupe is scoped per corpus file, which is per repository — the same defect cannot
    // be restated across two repositories.
    const duplicateOf = findDuplicates(after.filter((r) => r.label === 'positive'));
    for (const r of after) r.duplicate_of = duplicateOf.get(r.comment_id) ?? null;

    const positives = after.filter((r) => r.label === 'positive');
    const byClass = positives.reduce((acc, r) => {
      acc[r.defect_class] = (acc[r.defect_class] || 0) + 1;
      return acc;
    }, {});

    const labelMoves = diffCounts(before, after, 'label');
    process.stdout.write(`${file}\n`);
    process.stdout.write(`  positives: ${before.filter((r) => r.label === 'positive').length} → ${positives.length}\n`);
    process.stdout.write(`  defect class: ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}\n`);
    process.stdout.write(`  duplicates: ${duplicateOf.size}\n`);
    if (Object.keys(labelMoves).length) {
      process.stdout.write(`  label changes: ${Object.entries(labelMoves).map(([k, v]) => `${k} (${v})`).join(', ')}\n`);
    }

    if (!args.dryRun) {
      await writeFile(full, `${after.map((r) => JSON.stringify(r)).join('\n')}\n`);
      // The sibling summary was rendered from the old labels. Leaving it next to a
      // rewritten corpus is worse than having no summary — it reports a distribution and
      // an author filter that no longer describe the data.
      const summary = full.replace(/\.jsonl$/, '.summary.md');
      await rm(summary, { force: true });
    }
  }

  if (args.dryRun) process.stdout.write('\nDry run — no files written.\n');
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
