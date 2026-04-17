# 2026-04-17 — Mainline Odin concern pass

This pass was run on a fresh branch from current `main` to decide whether Odin should be compacted further, and if so, where the safe cuts were.

## Goal

Find high-signal clarity and compaction opportunities **without** changing Odin's conversational routing, verification flow, or adversarial-review architecture.

## Files reviewed

- `agents/odin.agent.md`
- `skills/odin-review-prompts/SKILL.md`
- `skills/odin-recall/SKILL.md`
- `skills/odin-evidence-bundle/SKILL.md`
- `.github/copilot-instructions.md`

## Model panel

| Model | Role in pass |
|---|---|
| `claude-sonnet-4.6` | Fast structural critique |
| `claude-opus-4.6` | Deep spec review and compaction judgment |
| `gpt-5.4` | Instruction-following and architecture-risk critique |
| `gpt-5.3-codex` | Code/spec consistency critique |

## Prompt shape

Each model was asked to read the files above and answer this question in substance:

> Identify the highest-signal concerns in the current Odin spec. Keep the conversational flow and phase setup. Focus on clarity, safe compaction, duplicated source-of-truth logic, and anything likely to hurt compliance. Do not propose removing the adversarial review flow or simplifying the core architecture.

## Convergent findings

### 1. Do not compress control logic

All useful reviewers converged on the same core point: the gates, thresholds, SQL checks, and reviewer-selection rules are not the right place to save tokens. They are explicit on purpose.

### 2. Keep the navigation scaffolding

The Intent Router, sizing table, Gate Registry, and reviewer/model tables help models stay oriented in a long spec. They are not dead weight.

### 3. Reduce duplicated source-of-truth logic

The strongest repeated concern was Step 5c duplication between `agents/odin.agent.md` and `skills/odin-review-prompts/SKILL.md`. The skill should own the detailed render order; the agent should keep only the local invariants it must enforce.

### 4. Prose-only sections are the safest compaction target

Reviewers consistently pointed at sections like Pushback, Documentation Lookup, Interactive Input Rule, and Step 6 Learn as good places to cut words without changing behavior.

### 5. The Step 1 -> Step 3 jump causes avoidable cognitive drag

Several reviewers flagged the missing Step 2 as a real navigation hiccup, even if it does not break the spec mechanically.

## Notable model-specific concerns

| Model | Main concern |
|---|---|
| `gpt-5.3-codex` | Step 5c duplication and a confusing numbering gap |
| `gpt-5.4` | Step 5c duplication is the top maintenance risk; compress prose, not logic |
| `claude-opus-4.6` | Duplicate source-of-truth prose and overly detailed narrative sections are the best cut targets |
| `claude-sonnet-4.6` | Missing Step 2 is a clarity hazard; keep tables and structure |

## Chosen follow-up moves

1. **Trim prose-only sections** in `agents/odin.agent.md`
2. **Make the Step 5c skill the detailed source of truth** and keep only local invariants in the agent file
3. **Add an explicit Step 2 tombstone** so historical numbering stays legible

## Why this was not a benchmark

This pass was for concern generation, not measurement. It did not use `docs/benchmarks/simulation-prompt.md`, did not apply the scoring rubric, and did not produce release-grade scores.

The next step after implementing a candidate is a benchmark run. For compaction work, the preferred measurement method is the three-arm protocol in `docs/benchmarks/three-arm/README.md`.
