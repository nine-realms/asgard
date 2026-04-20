# Agent Instruction Benchmarks

Stress-test harness for validating how different LLM models process agent instruction files. Not a unit test — it's a structured simulation that measures instruction comprehension, gate compliance, and failure mode awareness across model families.

For Mimir-specific benchmarks (review process, CCA integration, panel/standalone modes), see [`mimir/`](mimir/).

For Surtr benchmarks (compliance comparison against Odin at ~37% token reduction), see [`surtr/`](surtr/).

## How to Run

1. Open Copilot CLI in the asgard repo
2. Select the Odin agent (`/agent` → `odin`)
3. Paste the simulation prompt from `simulation-prompt.md`
4. Or ask Odin: "Run the instruction simulation benchmark from `docs/benchmarks/`"

### Manual Multi-Model Run

Launch 3+ agents in parallel, each on a different model, with the simulation prompt:

```
agent_type: "general-purpose"
model: "{model}"
prompt: "<paste full contents of simulation-prompt.md here>"
```

**Recommended model panel:**
- `claude-sonnet-4.6` (Anthropic — mid-tier)
- `gpt-5.3-codex` (OpenAI — code-focused)
- `gpt-5.4` (OpenAI — flagship)
- `claude-opus-4.6` (Anthropic — flagship, optional — expensive)
- Google Gemini (when available in runtime — not yet supported as of 2026-04-04)

## Three-Arm Eval (compression-aware)

To separate "spec got better" from "model was just terse," run a three-arm panel:

1. **Baseline** — normal benchmark prompt on baseline spec (usually `main`)
2. **Terse control** — same baseline spec, but with a concise-response overlay
3. **Candidate** — candidate spec change, with the same concise-response overlay

Protocol + prompt overlays live in [`three-arm/README.md`](three-arm/README.md).
Comparison helper:

```bash
python3 docs/benchmarks/three-arm/compare.py \
  --baseline docs/benchmarks/results/<baseline-file>.md \
  --terse-control docs/benchmarks/results/<terse-control-file>.md \
  --candidate docs/benchmarks/results/<candidate-file>.md
```

## Scoring

See `scoring-rubric.md` for the 5-dimension rubric. Each dimension is scored 1-10. Total possible: 50.

## Results

Each benchmark run is saved as `results/YYYY-MM-DD-{label}.md`. Compare scores across runs to measure whether agent file changes improved or degraded instruction compliance.

## Files

| File | Purpose |
|------|---------|
| `simulation-prompt.md` | The exact prompt given to each model (Odin) |
| `surtr/` | Surtr benchmark: simulation prompt, design notes, scorer guidance |
| `scoring-rubric.md` | How to score responses (5 dimensions, 1-10 each) |
| `results/` | Timestamped benchmark results |
