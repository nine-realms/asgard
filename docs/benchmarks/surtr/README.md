# Surtr Benchmark

Compliance benchmark for `agents/surtr.agent.md` — the caveman-speak ultra-compact experimental variant of Odin.

## Purpose

Surtr is a compression hypothesis test. If LLM compliance is driven by instruction clarity rather than instruction length, a terse 421-line agent should match or exceed a verbose 666-line agent on the same panel.

**Hypothesis**: Surtr avg score ≥ Odin avg at ~37% token reduction.

## Design

Two-arm comparison (not three-arm — Surtr is a structurally different agent, not a length-variant of the same spec, so a terse-control arm is not meaningful here):

| Arm | Agent | Lines |
|-----|-------|-------|
| A — Odin baseline | `agents/odin.agent.md` | 666 |
| B — Surtr candidate | `agents/surtr.agent.md` | 421 |

Same 4-model panel, same scoring rubric. Two-arm can establish whether Surtr achieves parity; it cannot prove compression *caused* any difference.

## Running the Benchmark

1. Open Copilot CLI in the asgard repo
2. Launch 4 `general-purpose` agents in parallel, each on a different model:
   - `claude-sonnet-4.6`
   - `gpt-5.3-codex`
   - `gpt-5.4`
   - `claude-opus-4.6`
3. Prompt each with the contents of `simulation-prompt.md` and direct them to read `agents/surtr.agent.md` and the three `odin-*` skill files
4. Score each response with `docs/benchmarks/scoring-rubric.md` (see scorer notes below)
5. File results in `docs/benchmarks/results/YYYY-MM-DD-surtr-v{version}-{label}.md`

## Scorer Notes

The shared `scoring-rubric.md` uses Odin-specific language in three dimensions. Apply these mappings for Surtr runs:

| Rubric dimension | Odin language | Surtr equivalent |
|------------------|---------------|-----------------|
| 2 — Gate Identification | "Count against every explicit `🚫 GATE` in `odin.agent.md`" | Count against `surtr.agent.md`'s gates (6 total: loop-entry, review-frigg+user-approval, baseline, 5c-review, 5e-bundle, 8-pre-commit) |
| 4 — MANDATORY FIRST ACTIONS Clarity | References "MANDATORY FIRST ACTIONS" header | Map to **On Every Message** routing block — does the model route before anything else? |
| 5 — Loop Start Diagnosis | "The Odin loop is not always starting" | "The Surtr loop is not always starting" |

Gate scoring is **within-agent**: score Surtr's 6 gates against Surtr's spec. Do not penalize Surtr for lacking gates that exist only in Odin.

## Files

| File | Purpose |
|------|---------|
| `simulation-prompt.md` | Surtr-specific simulation prompt (5 questions) |
| `../scoring-rubric.md` | Shared 5-dimension rubric (apply scorer notes above) |
| `../results/` | Results filed as `YYYY-MM-DD-surtr-v{version}-{label}.md` |
