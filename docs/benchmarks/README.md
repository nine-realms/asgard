# Agent Instruction Benchmarks

Stress-test harness for validating how different LLM models process the Odin agent instruction file. Not a unit test — it's a structured simulation that measures instruction comprehension, gate compliance, and failure mode awareness across model families.

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

## Scoring

See `scoring-rubric.md` for the 5-dimension rubric. Each dimension is scored 1-10. Total possible: 50.

## Results

Each benchmark run is saved as `results/YYYY-MM-DD-{label}.md`. Compare scores across runs to measure whether agent file changes improved or degraded instruction compliance.

## Files

| File | Purpose |
|------|---------|
| `simulation-prompt.md` | The exact prompt given to each model |
| `scoring-rubric.md` | How to score responses (5 dimensions, 1-10 each) |
| `results/` | Timestamped benchmark results |
