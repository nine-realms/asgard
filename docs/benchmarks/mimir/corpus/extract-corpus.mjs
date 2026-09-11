#!/usr/bin/env node
/**
 * PR review feedback corpus extractor.
 *
 * Mines merged pull requests for inline review comments and labels each one with
 * whether the author acted on it. Acted-on comments are ground truth: a reviewer
 * said something and the code changed because of it. Unactioned comments are noise
 * and must not be used as positive labels.
 *
 * Output: JSONL (one finding per line) + a summary table.
 *
 * Usage:
 *   node extract-corpus.mjs --repo owner/name [--limit 50] [--out ./data] [--no-commit-check]
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
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

const exec = promisify(execFile);

const PR_PAGE_SIZE = 25;
const MAX_COMMIT_FILE_FETCHES = 400;

const QUERY = `
query($owner:String!,$name:String!,$cursor:String,$page:Int!){
  repository(owner:$owner,name:$name){
    pullRequests(states:MERGED,first:$page,orderBy:{field:UPDATED_AT,direction:DESC},after:$cursor){
      pageInfo{ hasNextPage endCursor }
      nodes{
        number title mergedAt url
        baseRefOid headRefOid
        reviewThreads(first:100){
          nodes{
            isResolved isOutdated path line originalLine startLine
            comments(first:20){
              nodes{ databaseId body createdAt diffHunk author{ login __typename } }
            }
          }
        }
        commits(first:250){ nodes{ commit{ oid committedDate } } }
      }
    }
  }
}`;


async function gh(args, { json = true } = {}) {
  const { stdout } = await exec('gh', args, { maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

async function fetchMergedPRs(owner, name, limit) {
  const prs = [];
  let cursor = null;
  while (prs.length < limit) {
    const page = Math.min(PR_PAGE_SIZE, limit - prs.length);
    const args = [
      'api', 'graphql',
      '-f', `query=${QUERY}`,
      '-F', `owner=${owner}`,
      '-F', `name=${name}`,
      '-F', `page=${page}`,
    ];
    if (cursor) args.push('-F', `cursor=${cursor}`);
    const res = await gh(args);
    const conn = res?.data?.repository?.pullRequests;
    if (!conn) throw new Error(`No pull requests returned for ${owner}/${name}`);
    prs.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return prs.slice(0, limit);
}

/**
 * Files touched by a commit. Cached per sha; the cache is shared across the run so
 * a commit referenced by several threads is only fetched once.
 */
function makeCommitFileLoader(owner, name, budget) {
  const cache = new Map();
  let spent = 0;
  let exhausted = false;
  const filesFor = async function filesFor(sha) {
    if (cache.has(sha)) return cache.get(sha);
    if (spent >= budget) {
      if (!exhausted) {
        exhausted = true;
        process.stderr.write(`  WARNING: commit-file budget (${budget}) exhausted — remaining labels are unverified.\n`);
      }
      return null;
    }
    spent += 1;
    try {
      const data = await gh(['api', `repos/${owner}/${name}/commits/${sha}`, '--jq', '[.files[].filename]']);
      const files = new Set(data);
      cache.set(sha, files);
      return files;
    } catch {
      cache.set(sha, null);
      return null;
    }
  };
  filesFor.exhausted = () => exhausted;
  return filesFor;
}

function authorType(author) {
  if (!author) return 'unknown';
  if (author.__typename === 'Bot' || /\[bot\]$/i.test(author.login || '')) return 'automated';
  return 'human';
}

async function extractRepo({ owner, name, limit, commitCheck, weakLabels, authors }) {
  const prs = await fetchMergedPRs(owner, name, limit);
  const filesFor = makeCommitFileLoader(owner, name, MAX_COMMIT_FILE_FETCHES);
  const records = [];
  const seen = new Set();

  for (const pr of prs) {
    const commits = (pr.commits?.nodes || [])
      .map((n) => n.commit)
      .filter(Boolean)
      .sort((a, b) => new Date(a.committedDate) - new Date(b.committedDate));

    for (const thread of pr.reviewThreads?.nodes || []) {
      const first = thread.comments?.nodes?.[0];
      if (!first) continue;
      // Paginating an ordered, mutating set can return the same PR twice.
      if (seen.has(first.databaseId)) continue;
      seen.add(first.databaseId);

      const commentedAt = new Date(first.createdAt);
      let followupCommit = false;
      let followupChecked = false;

      if (!commitCheck) {
        // Without commit verification there is no acted-on evidence at all; fall back
        // to thread resolution, which --weak-labels already documents as unreliable.
        followupCommit = Boolean(thread.isResolved);
        followupChecked = false;
      } else if (thread.path) {
        const later = commits.filter((c) => new Date(c.committedDate) > commentedAt);
        for (const c of later) {
          const files = await filesFor(c.oid);
          if (files === null) continue;
          followupChecked = true;
          if (files.has(thread.path)) {
            followupCommit = true;
            break;
          }
        }
        // No later commits at all is a definitive answer, not an unknown.
        if (later.length === 0) followupChecked = true;
      }

      const category = classify(first.body);

      // A follow-up commit touching the file is only weak evidence on its own — busy
      // files keep changing for unrelated reasons, so an ignored comment on a hot file
      // would look acted-on. Corroborate it with one of two independent signals:
      //
      //   strong   — GitHub marked the thread outdated, meaning the anchored hunk itself
      //              changed. Line-level evidence.
      //   moderate — a human resolved the thread AND the file changed afterwards.
      //              File-level evidence plus a deliberate human action.
      //
      // Both are needed because the two signals track different team cultures: some repos
      // never resolve threads (outdated fires, resolution doesn't), others resolve
      // everything without the hunk moving. Requiring only one systematically drops every
      // positive from half the repos measured.
      const followupScope = followupCommit ? (thread.isOutdated ? 'line' : 'file') : null;
      let labelStrength = null;
      if (followupCommit && thread.isOutdated) labelStrength = 'strong';
      else if (followupCommit && thread.isResolved) labelStrength = 'moderate';
      else if (followupCommit) labelStrength = 'weak';

      const actedOn = labelStrength === 'strong'
        || labelStrength === 'moderate'
        || (weakLabels && labelStrength === 'weak');

      const authorKind = authorType(first.author);
      const authorAllowed = authors === 'all' || authors === authorKind;

      records.push({
        repo: `${owner}/${name}`,
        pr: pr.number,
        pr_url: pr.url,
        pr_title: pr.title,
        merged_at: pr.mergedAt,
        base_sha: pr.baseRefOid,
        head_sha: pr.headRefOid,
        comment_id: first.databaseId,
        author_type: authorKind,
        author_allowed: authorAllowed,
        created_at: first.createdAt,
        path: thread.path,
        line: thread.line ?? thread.originalLine ?? null,
        start_line: thread.startLine ?? null,
        diff_hunk: first.diffHunk || null,
        body: first.body,
        category,
        defect_class: defectClass(first.body, thread.path),
        reported_severity: parseSeverity(first.body),
        lane: CROSS_CUTTING_CATEGORIES.has(category) ? 'cross-cutting' : 'surface',
        resolved: Boolean(thread.isResolved),
        outdated: Boolean(thread.isOutdated),
        followup_commit: followupCommit,
        followup_checked: followupChecked,
        acted_on: actedOn,
        followup_scope: followupScope,
        label_strength: labelStrength,
        needs_triage: category === 'other',
        label: actedOn && authorAllowed && !NON_ACTIONABLE_CATEGORIES.has(category)
          ? 'positive'
          : 'excluded',
      });
    }
  }

  // Dedupe runs after every record exists, because a restated defect is only visible by
  // comparing a comment with its siblings in the same file. Only positives can be
  // duplicates — an excluded row is already out of the denominator.
  const duplicateOf = findDuplicates(records.filter((r) => r.label === 'positive'));
  for (const r of records) {
    r.duplicate_of = duplicateOf.get(r.comment_id) ?? null;
  }

  return { prs, records };
}

function summarize(records) {
  const by = (key) => records.reduce((acc, r) => {
    acc[r[key]] = (acc[r[key]] || 0) + 1;
    return acc;
  }, {});
  const positives = records.filter((r) => r.label === 'positive');
  return {
    total: records.length,
    positives: positives.length,
    byCategory: by('category'),
    positivesByCategory: positives.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {}),
    positivesByLane: positives.reduce((acc, r) => {
      acc[r.lane] = (acc[r.lane] || 0) + 1;
      return acc;
    }, {}),
    positivesBySeverity: positives.reduce((acc, r) => {
      acc[r.reported_severity || 'ungraded'] = (acc[r.reported_severity || 'ungraded'] || 0) + 1;
      return acc;
    }, {}),
    positivesByStrength: positives.reduce((acc, r) => {
      acc[r.label_strength] = (acc[r.label_strength] || 0) + 1;
      return acc;
    }, {}),
    positivesByAuthor: positives.reduce((acc, r) => {
      acc[r.author_type] = (acc[r.author_type] || 0) + 1;
      return acc;
    }, {}),
    positivesByDefectClass: positives.reduce((acc, r) => {
      acc[r.defect_class] = (acc[r.defect_class] || 0) + 1;
      return acc;
    }, {}),
    duplicates: positives.filter((r) => r.duplicate_of).length,
    byAuthorType: by('author_type'),
    needsTriage: records.filter((r) => r.label === 'positive' && r.needs_triage).length,
  };
}

function renderSummary(repo, prCount, s, opts) {
  const rows = Object.entries(s.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `| ${cat} | ${n} | ${s.positivesByCategory[cat] || 0} |`)
    .join('\n');
  return `# Corpus summary — ${repo}

Merged PRs scanned: **${prCount}**
Review threads: **${s.total}**
Labeled positive (acted on, non-nit): **${s.positives}**
Positive by lane: cross-cutting **${s.positivesByLane['cross-cutting'] || 0}**, surface **${s.positivesByLane.surface || 0}**
Positive by defect class: ${Object.entries(s.positivesByDefectClass).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}
Restated defects marked duplicate (excluded from recall): **${s.duplicates}**
Positive by reported severity: ${Object.entries(s.positivesBySeverity).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}
Positive by evidence strength: ${Object.entries(s.positivesByStrength).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}
Positive by author: ${Object.entries(s.positivesByAuthor).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}
All comment authors: ${Object.entries(s.byAuthorType).map(([k, v]) => `${k} ${v}`).join(', ')}
Positives still needing hand-triage (category \`other\`): **${s.needsTriage}**
Label mode: **${opts.weakLabels ? 'weak tier included' : 'strong + moderate only'}** · author filter: **${opts.authors}**

| Category | Threads | Positive |
|---|---:|---:|
${rows}

> Positive = a commit after the comment changed the file, corroborated by the thread being
> marked outdated (\`strong\`) or resolved by a human (\`moderate\`); the author passes the
> \`--authors\` filter; and the comment is not a style nit or a clarity request.
> \`--weak-labels\` also admits uncorroborated follow-up commits, which is noisier.
> Only positives are valid recall targets; everything else is excluded from scoring.
> Rows in category \`other\` carry \`needs_triage: true\` — hand-label them before use.
`;
}

const AUTHOR_FILTERS = new Set(['all', 'human', 'automated']);

function value(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) throw new Error(`${flag} requires a value`);
  return v;
}

function positiveInt(raw, flag) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer, got: ${raw}`);
  return n;
}

function parseArgs(argv) {
  // Default under the script, not the cwd — extracted comment bodies may come from
  // private repos, and only the script-relative data/ path is gitignored.
  const args = {
    limit: 50,
    out: path.join(HERE, 'data'),
    commitCheck: true,
    weakLabels: false,
    authors: 'all',
    repos: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') args.repos.push(value(argv, ++i, '--repo'));
    else if (a === '--limit') args.limit = positiveInt(value(argv, ++i, '--limit'), '--limit');
    else if (a === '--out') args.out = value(argv, ++i, '--out');
    else if (a === '--authors') args.authors = value(argv, ++i, '--authors');
    else if (a === '--no-commit-check') args.commitCheck = false;
    else if (a === '--weak-labels') args.weakLabels = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.repos.length === 0) throw new Error('At least one --repo owner/name is required');
  if (!AUTHOR_FILTERS.has(args.authors)) {
    throw new Error(`--authors must be one of ${[...AUTHOR_FILTERS].join(', ')}, got: ${args.authors}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });

  for (const slug of args.repos) {
    const [owner, name] = slug.split('/');
    if (!owner || !name) throw new Error(`--repo must be owner/name, got: ${slug}`);

    process.stderr.write(`Extracting ${slug} (last ${args.limit} merged PRs)...\n`);
    const { prs, records } = await extractRepo({
      owner,
      name,
      limit: args.limit,
      commitCheck: args.commitCheck,
      weakLabels: args.weakLabels,
      authors: args.authors,
    });

    const stem = `${owner}__${name}`;
    const jsonl = records.map((r) => JSON.stringify(r)).join('\n');
    const s = summarize(records);

    await writeFile(path.join(args.out, `${stem}.jsonl`), jsonl ? `${jsonl}\n` : '');
    await writeFile(
      path.join(args.out, `${stem}.summary.md`),
      renderSummary(slug, prs.length, s, { weakLabels: args.weakLabels, authors: args.authors }),
    );

    process.stderr.write(`  ${prs.length} PRs → ${records.length} threads, ${s.positives} positive → ${args.out}/${stem}.jsonl\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
