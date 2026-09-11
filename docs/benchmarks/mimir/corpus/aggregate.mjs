#!/usr/bin/env node
/**
 * Aggregate extracted corpora into a cross-repo view.
 *
 * Reports category, lane, and evidence-strength distributions across every corpus file,
 * so heuristic gaps can be spotted at the population level rather than one PR at a time.
 *
 * Emits counts only — never comment bodies or file paths — so the output is safe to
 * commit even when the underlying corpora come from private repositories.
 *
 * Usage:
 *   node aggregate.mjs [--data ./data] [--exclude owner/name]
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function tally(rows, key) {
  return rows.reduce((acc, r) => {
    const k = r[key] ?? 'none';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function table(title, counts, total) {
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| ${k} | ${n} | ${((n / total) * 100).toFixed(1)}% |`)
    .join('\n');
  return `### ${title}\n\n| Value | Count | Share |\n|---|---:|---:|\n${rows}\n`;
}

function parseArgs(argv) {
  const args = { data: path.join(HERE, 'data'), exclude: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--data') args.data = argv[++i];
    else if (a === '--exclude') args.exclude.push(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = (await readdir(args.data)).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) throw new Error(`No .jsonl corpora found in ${args.data}`);

  let rows = [];
  for (const f of files) {
    const raw = await readFile(path.join(args.data, f), 'utf8');
    rows.push(...raw.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  }
  rows = rows.filter((r) => !args.exclude.includes(r.repo));

  const positives = rows.filter((r) => r.label === 'positive');
  const repos = [...new Set(rows.map((r) => r.repo))].sort();

  const perRepo = repos.map((repo) => {
    const all = rows.filter((r) => r.repo === repo);
    const pos = all.filter((r) => r.label === 'positive');
    const cc = pos.filter((r) => r.lane === 'cross-cutting').length;
    return `| ${repo} | ${all.length} | ${pos.length} | ${cc} | ${pos.length - cc} |`;
  }).join('\n');

  const out = [
    '# Cross-repo corpus aggregate',
    '',
    `Repositories: **${repos.length}** · Review threads: **${rows.length}** · Positives: **${positives.length}**`,
    `Positives needing hand-triage (category \`other\`): **${positives.filter((r) => r.needs_triage).length}**`,
    '',
    '### Per repository',
    '',
    '| Repository | Threads | Positive | Cross-cutting | Surface |',
    '|---|---:|---:|---:|---:|',
    perRepo,
    '',
    table('Positives by category', tally(positives, 'category'), positives.length),
    table('Positives by lane', tally(positives, 'lane'), positives.length),
    table('Positives by evidence strength', tally(positives, 'label_strength'), positives.length),
    table('Positives by author type', tally(positives, 'author_type'), positives.length),
    table('All threads by category', tally(rows, 'category'), rows.length),
    '',
    '> Counts only. No comment bodies or file paths are emitted, so this report is safe to',
    '> publish even when the underlying corpora come from private repositories.',
    '',
  ].join('\n');

  process.stdout.write(out);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
