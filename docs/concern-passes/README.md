# Concern Passes

Concern passes are a qualitative pre-benchmark tool for finding likely weaknesses in an agent spec before running the formal benchmark panel.

Use them to gather candidate edits. Use the benchmark suite to measure whether those edits actually improved compliance.

## When to use this

- Before a compaction/clarity pass on a long agent file
- When you want cross-model criticism without immediately paying the cost of a full scored benchmark
- When you need ideas for safe cuts, source-of-truth cleanup, or ambiguity reduction

## How this differs from benchmarks

| Concern pass | Benchmark |
|---|---|
| Generates concerns and hypotheses | Measures behavior and scores outcomes |
| Qualitative | Structured and scored |
| Uses targeted critique prompts | Uses the benchmark simulation prompt |
| Best before editing | Best after editing |

## Rerun recipe

1. Start from a clean branch or commit.
2. Ask a cross-family model panel to read the current spec and skill files:
   - `agents/odin.agent.md`
   - `skills/odin-review-prompts/SKILL.md`
   - `skills/odin-recall/SKILL.md`
   - `skills/odin-evidence-bundle/SKILL.md`
   - `.github/copilot-instructions.md`
3. Use a critique prompt focused on:
   - safe compaction targets
   - duplicated source-of-truth logic
   - navigation/step-numbering clarity
   - anything likely to hurt compliance without changing architecture
4. Keep only convergent, high-signal findings. Ignore one-off style preferences.
5. Turn those findings into a small candidate change set.
6. After the candidate lands, run the normal benchmark flow. If the change is compaction-oriented, prefer the three-arm protocol in `docs/benchmarks/three-arm/README.md`.

## Current pass

- [`2026-04-17-mainline-odin.md`](2026-04-17-mainline-odin.md) — four-model concern pass on current mainline before the first clean compaction candidate
