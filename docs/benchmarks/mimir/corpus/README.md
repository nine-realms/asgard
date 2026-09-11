# PR Feedback Corpus

A labeled ground-truth corpus for measuring Mimir's review quality.

Mimir's other benchmarks measure whether a model **understands** the instruction file. They
do not measure whether the resulting review is any good. This corpus closes that gap: it
mines real merged pull requests for inline review comments, labels the ones the author
actually acted on, and scores Mimir on how many of them it independently finds.

## Why "acted on" is the label

A review comment is only evidence of a real problem if the author changed the code because
of it. Comments that were ignored, argued down, or resolved without a change are noise —
training Mimir to reproduce them makes it noisier, not better.

The extractor labels a comment `positive` when **all** of these hold:

1. A commit **after** the comment touches **the same file**.
2. GitHub marked the thread **outdated** — meaning the hunk the comment was anchored to
   actually changed. A file-level match alone is not enough: busy files keep changing for
   unrelated reasons, so an ignored comment on a hot file would otherwise look acted-on.
3. The comment author passes the `--authors` filter.
4. The comment is not a style nit or a clarity request — categories Mimir deliberately
   does not report.

Everything else is `excluded` and never counts against recall. `--weak-labels` relaxes rule 2
to file-scope only; it yields more positives and more noise, and should only be used on repos
whose PRs are small enough that file-scope implies line-scope.

### A note on automated reviewers

Much of the available inline feedback is machine-generated. That is usable signal — the
comments still describe real defects the author fixed — but scoring Mimir against another
automated reviewer is partly circular, and machine comments skew toward the surface lane.
`author_type` is recorded on every row and broken out in the summary; use
`--authors human` to build a human-only corpus when you want an independent measure.

## Privacy

Extracted data contains verbatim review comments and file paths from the source repository,
which may be private. `--out` defaults to `<script dir>/data`, which is gitignored.
**If you override `--out`, point it outside this repository.** Never commit corpus output —
this repo is public.

## Workflow

### 1. Extract

```bash
cd docs/benchmarks/mimir/corpus
node extract-corpus.mjs --repo owner/name --limit 50 --out ./data
```

Multiple repos in one run:

```bash
node extract-corpus.mjs --repo owner/service-a --repo owner/service-b --limit 50 --out ./data
```

| Flag | Default | Purpose |
|---|---|---|
| `--repo owner/name` | required | Repository to mine. Repeatable. |
| `--limit N` | 50 | Most recently updated merged PRs to scan. |
| `--out DIR` | `<script dir>/data` | Output directory. Defaults under the script so output lands in the gitignored path. |
| `--authors all\|human\|automated` | `all` | Restrict which comment authors can produce positive labels. |
| `--weak-labels` | off | Accept file-scope follow-up commits as evidence. More positives, more noise. |
| `--no-commit-check` | off | Skip per-commit file lookups. Much faster, but there is then no acted-on evidence — labels fall back to thread resolution and should not be trusted for scoring. |

Outputs `data/owner__name.jsonl` (one review thread per line) and
`data/owner__name.summary.md` (category and lane breakdown).

Requires `gh` authenticated with `repo` scope on the target repository.

### 2. Triage

Rows classified `other` carry `needs_triage: true`. The classifier is keyword-based and
deliberately conservative — hand-label those rows before trusting a category breakdown.
Repos whose diffs are mostly prose (docs, agent files) produce a high `other` rate; code
repos classify well.

### 2b. Relabel without re-mining

Every labeling decision is a pure function of the stored comment body and path, so a rule
change does not need a re-extract:

```bash
node relabel.mjs --dry-run   # show what would move
node relabel.mjs             # rewrite labels in place
```

This matters for comparability as much as for cost. Re-mining to pick up a labeling change
also picks up newly merged PRs, which moves the ground truth underneath the before/after
comparison — the numbers would no longer isolate the rule change. `relabel.mjs` only
recomputes labels; the evidence fields (`acted_on`, `outdated`, `followup_commit`) come
from GitHub and are preserved, so it can never promote an unactioned comment to a positive.

## Defect class — what Mimir is actually accountable for

`category` describes a comment's subject matter. **`defect_class` describes whether Mimir
should have reported it at all**, and it is the filter the scorer uses.

| Class | Meaning | Recall target |
|---|---|---|
| `behavioral` | The code does the wrong thing at runtime. | **Yes** |
| `contract-drift` | A published contract artifact disagrees with the source that generates it. | **Yes** (usually via `cross-ref`) |
| `convention` | Works, but doesn't match a codebase pattern, attribute baseline, or doc wording. | No |
| `tooling` | Developer tooling and editor config. | No |

`convention` and `tooling` are excluded by default because Mimir's review prompt scopes
them out — it is told to report "findings that would block or delay a merge". Counting them
scores the agent against instructions it was explicitly told not to follow, and tuning to
recover them would train it toward exactly the nit-reporting the agent is designed to avoid.
Use `--all-classes` to see them anyway; the scorer always reports what it excluded.

Classification is deliberately biased toward `behavioral`. Consistency language shows up
*inside* real defect reports all the time — "returns 200 on failure, which is inconsistent
with the other endpoints and breaks client retry logic" is a runtime bug that merely
mentions consistency. A stated runtime consequence (auth bypass, silent data loss, a
collision, a wrong status code) therefore overrides the convention branch. The asymmetry is
intentional: calling a nit `behavioral` only adds a visible row to the miss list, while
calling a real defect `convention` deletes it from the denominator and silently inflates
recall.

> **Severity is not a usable filter — don't reach for it.** The obvious lever looks like
> `--min-severity`, and it is wrong. Measured across this corpus, the grades automated
> reviewers assign track *how cheap the fix is*, not how much the defect matters:
> `.vscode/launch.json` drift is graded `major`, while "this test asserts nothing" and
> "these generated IDs can collide" are graded `minor`. A severity floor deletes the
> strongest evidence of a real agent gap and keeps the noise. It is also unusable on
> reach: 55 of 84 positives — including every human-authored one — carry no grade at all.
> The flag is retained only for slicing a report after the fact.

## Restated defects are deduped

The same defect often gets commented twice across review rounds — "`runTaskId` risks
collisions" on the first pass, "`runTaskId` collision risk still unaddressed" on the
second. Two comment ids, two corpus rows, one defect. Left in, an agent that correctly
reports it once can never score better than 50% on it, which measures the review thread
rather than the agent.

`findDuplicates` groups positives by PR and file, compares stemmed content words of the
headline, and marks anything at or above 0.4 Jaccard similarity as `duplicate_of` the
earliest comment. Scoping to one file keeps unrelated code that shares vocabulary from
colliding, and rows with no path are skipped rather than grouped together.

The opposite error is the dangerous one, so the rule is asymmetric. Merging two *distinct*
defects deletes a real recall target and nothing downstream can see it happened — the row
is simply gone, and recall inflates. Repeated-pattern defects ("guard null `order`", "guard
null `customer`") are the most common thing a reviewer flags several times in one file, and
prose similarity alone collapses them. So when both comments name backticked symbols, they
must share at least one before they count as the same defect. The result is deliberately
conservative: across 84 positives it finds exactly one pair.

Deduping happens *after* the class filter in the scorer, and only when the surviving twin
is itself in scope — otherwise an out-of-scope sibling would absorb an in-scope defect and
delete it from the denominator entirely.

### 3. Aggregate across repos (optional)

```bash
node aggregate.mjs --exclude nine-realms/asgard
```

Reports category, lane, and evidence-strength distributions over every corpus in `data/`.
Counts only — no comment bodies or paths — so the output is safe to paste into a results
document. `--exclude` drops a repository from the rollup.

### 4. Run Mimir on a corpus PR

Corpus line numbers are anchored to the **PR head commit**. If Mimir reviews a different
checkout, every line number shifts and nothing matches — so check out the head commit first:

```bash
PR=123
REPO=owner/name
HEAD_SHA=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)

git fetch origin "$HEAD_SHA"
git checkout "$HEAD_SHA"
gh pr diff "$PR" --repo "$REPO" > /tmp/pr-$PR.diff
```

Then invoke Mimir standalone with that diff as the source of truth and save the markdown
output to a file.

Two constraints make the run valid:

- Mimir must **not** read the PR's review comments, reviews, or metadata — that is the
  answer key. State this explicitly in the prompt; the agent has `gh` available.
- Ask for the standard finding format, including the ``**File**: `path` line N`` line. The
  scorer needs it.

### 5. Score

```bash
node score-run.mjs --corpus data/owner__name.jsonl --pr 123 --findings /tmp/mimir-run.md
```

Reports recall overall and split by lane (cross-cutting vs surface), the missed positives,
and any Mimir findings that matched no corpus row.

Matches are tiered, strongest first:

| Tier | Meaning | Counted as recall |
|---|---|---|
| `exact` | Same file, line within tolerance | Yes — the headline number |
| `file-only` | Same file, one side has no line number | No — reported as an upper bound |
| `cross-ref` | Different files, one side names the other's path | No — reported as an upper bound |
| `same-file` | Same file, both lines known, outside tolerance | No — needs triage |

`same-file` exists to separate **line drift from a genuine miss**. If the review was run
against the wrong checkout, every pair lands in that tier; the scorer emits a protocol
warning when there are no exact matches but multiple same-file pairs. If the checkout was
correct, a same-file pair means Mimir found a *different* issue in the same file — which is
a real miss plus a candidate finding, and only hand-inspection can tell the two apart.

`cross-ref` exists because path equality assumes the reviewer and the agent anchor a defect
in the same place, and for **generated contract artifacts they systematically don't**. A
comment lands on the spec line that looks wrong; the fix — and a correct finding — lands on
the controller, example provider, or config that generated it. Same defect, no shared path,
scored as a miss. The tier is a text heuristic (one side must name the other's path), so it
is reported for confirmation, never counted on sight. Pairs are labelled `strong` when the
corpus comment names the source file and `weak` when only the finding names the artifact —
weak pairs match every corpus row in that artifact equally, so they are a guess among
siblings until a human confirms.

Assignment is best-match-first across tiers, so clustered comments in one file don't mispair
into a false miss plus a false catch.

| Flag | Default | Purpose |
|---|---|---|
| `--corpus FILE` | required | JSONL from step 1. |
| `--pr N` | required | PR number to score. |
| `--findings FILE` | required | Mimir output — `.md` (parsed from Pass 3 blocks) or `.json`. |
| `--tolerance N` | 5 | Line-distance tolerance, in lines, for a line-level match. |

### 6. Act on the results

- **Missed positives** are recall gaps. Feed them to `mimir_gap_analysis` in the
  `mimir-feedback` extension to propose new CCA heuristics — this is what the extension is
  for, and corpus misses are far better input than intuition.
- **Unmatched findings** need hand-triage. The corpus is *not exhaustive* — reviewers miss
  things too, so an unmatched finding may be a genuine catch the corpus lacks. Only
  hand-triage produces a precision number; the scorer deliberately refuses to guess.
- **Cross-cutting recall** is the number that matters most. Surface bugs get caught by every
  reviewer on the panel; cross-boundary findings are Mimir's unique lane.

## Guarding against overfitting

Split the corpus by repository, not by PR. Tune heuristics on one repo's corpus and validate
on another that was never used for tuning — otherwise new CCAs will encode the quirks of a
single codebase rather than transferable review skill.

## Files

| File | Purpose |
|---|---|
| `labeling.mjs` | Shared pure labeling rules — category, defect class, severity, dedupe. Imported by the extractor and the relabeler so both apply identical rules. |
| `extract-corpus.mjs` | Mines merged PRs, labels acted-on comments, writes JSONL + summary. |
| `relabel.mjs` | Re-applies labeling rules to an existing corpus. No API calls, no ground-truth drift. |
| `score-run.mjs` | Matches a Mimir run against corpus positives; reports recall and gaps. |
| `aggregate.mjs` | Cross-repo category/lane/strength distributions. Emits counts only — safe to publish. |
| `data/` | Extracted corpora. Gitignored. |
