# Corpus Baseline — 2026-09-11

First run of Benchmark 3 (ground-truth recall). Establishes the corpus, validates the
extraction methodology, and records one blind Mimir run against a real service PR.

Source repositories are private, so this report contains **counts and generic patterns
only** — no comment text, file paths, or repository-identifying detail.

## Corpus

| | |
|---|---|
| Repositories mined | 7 (6 .NET services + this repo) |
| Merged PRs scanned | 174 |
| Review threads | 195 |
| Labeled positive | 82 |
| Positives in code repos | 34 |

Labels use the strong/moderate tiers (follow-up commit corroborated by thread-outdated or
human resolution). Of the code-repo positives, 79% came from an automated reviewer and 21%
from humans.

### Category distribution (code repos, positives)

| Category | Share |
|---|---:|
| logic / functional correctness | 55.9% |
| data integrity & integration | 20.6% |
| unclassified (needs triage) | 20.6% |
| null safety | 2.9% |

Lane split: **79% surface, 21% cross-cutting.**

## Methodology findings

Three defects in the first extraction pass, all fixed. They are recorded because each one
silently distorted the corpus rather than failing loudly.

### 1. A single acted-on signal drops whole repositories

The first implementation required GitHub to mark a thread *outdated* as line-level evidence
that a comment was addressed. Across the sample, 78 of 98 resolved threads were never marked
outdated — and three repositories produced **zero** positives despite having active review
threads.

The two signals track different team cultures: some teams never resolve threads (outdated
fires, resolution does not), others resolve everything without the anchored hunk moving.
Accepting either signal, paired with a follow-up commit, raised coverage from 60 to 114
threads and gave every repository a non-zero contribution.

**Lesson**: validate a labeling rule against every repo in the sample before trusting the
aggregate. A rule that works on the repo you developed it against can be silently
inapplicable elsewhere.

### 2. Automated reviewers publish their own labels — use them

Machine-generated comments prefix a category and severity marker. The first classifier
discarded this and keyword-matched the body, including collapsed tool-output blocks,
producing **73% unclassified**. Parsing the markers, classifying on the bold headline rather
than the whole body, and stripping collapsed blocks cut that to **21%**.

### 3. Most human review comments are not findings

Hand-triage of the unclassified positives showed human comments are dominated by questions
and preferences — "why not use the enum here?", "should we remove this?", "I would not do
X". They pass the acted-on test, because the file does change afterwards, but they describe
a conversation, not a defect, and no static reviewer could derive them.

These now classify as `discussion` and `preference` and are excluded from recall targets.
They were **20% and 6%** of all threads in the code repos. Left in, they would have trained
Mimir toward speculation — the exact noise the agent is designed to suppress.

## Blind runs

Seven PRs across five .NET services. Each was reviewed with the repository checked out at
the PR head commit, given only the diff, and explicitly forbidden from reading the PR's
review feedback.

| PR | Positives | Mimir findings | Exact | Same-file | Missed | Unmatched |
|---|---:|---:|---:|---:|---:|---:|
| A | 8 | 4 | 0 | 3 | 5 | 1 |
| B | 5 | 4 | 0 | 1 | 4 | 3 |
| C | 4 | 5 | 1 | 1 | 2 | 3 |
| D | 3 | 5 | 0 | 0 | 3 | 5 |
| E | 3 | 6 | 0 | 1 | 2 | 5 |
| F | 2 | 5 | 2 | 0 | 0 | 3 |
| G | 1 | 5 | 1 | 0 | 0 | 4 |
| **Total** | **26** | **34** | **4** | **6** | **16** | **24** |

**Recall: 15.4%** (4 of 26). Counting same-file pairs as partial credit puts the ceiling at
38.5%, but hand-inspection showed most of those are *different issues in the same file*, not
near-misses — so the true figure sits near the lower bound.

Two observations matter more than the headline:

- **Mimir produced more findings than the reviewers did** (34 vs 26) and they were largely
  disjoint. On the largest PR, the agent independently surfaced a status returned but never
  persisted, a retry path that permanently drops metrics, and swallowed concurrency
  exceptions — none of which appear in the recorded feedback.
- **Recall correlates inversely with diff size.** The two smallest PRs scored 100%; the two
  largest scored 0%. On a 60-file diff the agent reported four findings concentrated in
  three files. This looks like a coverage-breadth problem, not a detection problem.

Precision is still unmeasured: 24 unmatched findings need hand-triage, and the corpus is not
exhaustive, so an unmatched finding is not automatically a false positive.

## Confirmed agent defect: committed specifications are skipped

Four of the 26 positives — 15% of the entire corpus — were in checked-in OpenAPI specs.
Mimir missed all four, and its own walkthrough states why:

> Auto-skipped: `openapi/*.json` (generated)

Pass 1's auto-skip list excludes generated code. That is right for build output, and wrong
for a generated artifact that is **committed to the repository and published as the API
contract**. Reviewers treat drift in those files as a real defect: response examples
contradicting implementation behavior, undeclared error-response bodies, and
environment-specific values leaking into a published spec.

**Fix**: narrow the auto-skip so generated artifacts under version control are reviewed for
contract drift rather than skipped wholesale.

## Other recall gaps → heuristic candidates

The remaining misses cluster into patterns not covered by CCA-001–025:

1. **Identifier collision from timestamp precision** — composite keys built from a clock with
   insufficient precision to survive rapid duplicate calls. Missed twice on the same PR.
2. **Unprotected concurrent upsert** — document writes with no precondition or optimistic
   concurrency check, where a read-modify-write silently overwrites.
3. **Validate-before-persist ordering** — a record written in a pending state before its
   inputs are validated. Adjacent to CCA-012 (input validation layering), which covers
   *where* validation happens, not *when* it happens relative to the write.
4. **Tests that assert nothing meaningful** — a null-guard test that never passes null, a
   branch test that does not enter the branch. Notably CCA-008 (Test Assertion Precision)
   *already covers this* and did not fire. That is an activation failure, not a coverage
   gap, and is cheaper to fix than a new heuristic.

## Benchmark defects found while running

Four scoring bugs, all fixed, all of which understated the agent:

1. **Line tolerance too tight.** The default ±5 window reported a confirmed same-issue pair
   as a miss; reviewers anchor comments anywhere in the construct they describe, and observed
   same-issue pairs sat up to ~10 lines apart. Default is now ±20.
2. **Finding headings not recognised.** Mimir emits findings at `####` when nesting them
   under a `Findings` section; the parser only split on `###`, so one run scored 1 finding
   instead of 5.
3. **Section headers parsed as findings.** `### Findings (5)` was itself matched as a
   finding block.
4. **Severity filtering is unusable at this sample size.** Reported severity is now captured
   and `--min-severity` exists, but human comments carry no severity marker and are dropped
   wholesale by the filter, leaving 6 gradable positives. Not a usable axis until the corpus
   is several times larger.

## Caveats

- **Seven PRs and 26 positives is a small sample.** Per-PR recall swings from 0% to 100%,
  and the total is dominated by two large PRs. Treat 15% as a first data point, not a
  stable measure.
- **Scoring against an automated reviewer is partly circular.** 79% of code-repo positives
  are machine-generated. Use `--authors human` for an independent measure, accepting a much
  smaller sample.
- **The corpus is not exhaustive.** Findings that match nothing in it are unmatched, not
  false positives. Precision requires hand-triage and is not reported here.
- **This repository is over-represented** (48 of 82 positives) and is a specification repo,
  not a code repo. Exclude it with `--exclude` for code-review measurements.

## Next

1. **Narrow the Pass 1 auto-skip rule** so committed generated artifacts are reviewed for
   contract drift. Highest-value single change: 15% of the corpus in one blind spot.
2. **Investigate why CCA-008 did not fire** on two test files that plainly match it. If a
   heuristic in the library isn't being applied, adding more heuristics won't help.
3. **Triage the 24 unmatched findings** to produce a precision number alongside recall.
4. **Investigate coverage breadth on large diffs** — four findings across 60 files suggests
   the agent stops early rather than missing subtle issues.
5. Feed the three remaining gap patterns through `mimir_gap_analysis` as CCA candidates.
