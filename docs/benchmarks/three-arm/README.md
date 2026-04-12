# Three-Arm Eval Protocol

Use this when you are benchmarking instruction-file edits that also reduce prose or force terser output. It complements the standard benchmark run in `docs/benchmarks/`.

## Goal

Isolate real instruction-quality gains from generic brevity effects.

## Arms

| Arm | Spec under test | Prompt style |
|-----|------------------|--------------|
| **A. Baseline** | Baseline spec (usually `main`) | Standard `simulation-prompt.md` |
| **B. Terse control** | Baseline spec (same commit as A) | Standard prompt + concise overlay |
| **C. Candidate** | Candidate spec (feature branch) | Standard prompt + same concise overlay as B |

Why this matters:
- **B vs A** shows "just be concise" impact.
- **C vs B** shows candidate impact beyond generic terseness.

## Concise overlay (use in B and C only)

Append this line to the end of `simulation-prompt.md` when running B and C:

```
Response style constraint: Be concise and technical. Use bullet lists or tables where helpful. Do not omit required steps, gates, or failure-mode detail.
```

Keep everything else unchanged.

## Run sequence

1. **Arm A + B on baseline spec**
   1. Check out baseline ref (usually `main` or previous tagged version).
   2. Run the model panel once with standard prompt (A).
   3. Run the same panel with concise overlay (B).
   4. Save both results in `docs/benchmarks/results/`.
2. **Arm C on candidate spec**
   1. Check out candidate branch/commit.
   2. Run the same model panel with the same concise overlay (C).
   3. Save result in `docs/benchmarks/results/`.
3. Compare all 3 runs with `compare.py`.

Recommended panel (same as main benchmark):
- `claude-opus-4.6`
- `claude-sonnet-4.6`
- `gpt-5.4`
- `gpt-5.3-codex`

## Compare command

```bash
python3 docs/benchmarks/three-arm/compare.py \
  --baseline docs/benchmarks/results/<baseline-file>.md \
  --terse-control docs/benchmarks/results/<terse-control-file>.md \
  --candidate docs/benchmarks/results/<candidate-file>.md \
  --out docs/benchmarks/results/<date>-<label>-three-arm.md
```

## Interpretation

- `Candidate - Terse control` > 0: candidate improved compliance beyond generic terseness.
- `Candidate - Baseline` >= 0: no regression versus the current standard run.
- If candidate beats terse control but regresses baseline, review whether structural clarity improved only for terse responders.

This protocol is additive. Keep the normal benchmark run as the release gate.
