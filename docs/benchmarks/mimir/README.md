# Mimir Instruction Benchmarks

Stress-test harness for validating how different LLM models process the Mimir agent instruction file. Measures comprehension of Mimir's 3-pass review architecture, panel/standalone mode behavior, CCA heuristic integration, and signal calibration across model families.

## How to Run

### Benchmark 1: Instruction Comprehension

Tests whether a model understands the Mimir spec by answering 5 questions about review process, lane deference, CCA integration, signal calibration, and failure modes. Each model reads the agent file and companion skill, then answers without performing an actual review.

Launch 3+ agents in parallel, each on a different model:

```
agent_type: "general-purpose"
model: "{model}"
prompt: "Read the file `agents/mimir.agent.md` in full.
         Then read the companion skill `skills/mimir-heuristics/SKILL.md`.
         Then answer the 5 questions below:
         <paste full contents of simulation-prompt.md here>"
```

**Recommended model panel:**
- `claude-opus-4.6` (Anthropic — flagship)
- `claude-sonnet-4.6` (Anthropic — mid-tier)
- `gpt-5.4` (OpenAI — flagship)
- `gpt-5.3-codex` (OpenAI — code-focused)

### Benchmark 2: Comparative Review

Tests actual review output quality by running the same diff through Mimir on different models. Unlike Benchmark 1 (which tests spec comprehension), this tests real execution — the agent loads its full instruction file and companion skill at runtime.

Launch 2+ agents with `asgard:mimir` as the agent type:

```
agent_type: "asgard:mimir"
model: "{model}"
prompt: "Pre-screen the following staged changes. Repo: /path/to/repo.
         Files: {list_of_files}.
         review_context=standalone
         Use the provided staged diff as the source of truth.
         <STAGED_DIFF>
         {staged_diff}
         </STAGED_DIFF>"
```

Compare outputs on: walkthrough quality, finding count/severity, CCA application, effort scoring accuracy, panel mode awareness (if applicable), and output formatting.

## Scoring

See `scoring-rubric.md` for the 5-dimension rubric (Benchmark 1 only). Each dimension is scored 1-10. Total possible: 50.

Benchmark 2 is scored qualitatively — compare review outputs side-by-side on finding quality, CCA depth, and signal-to-noise ratio.

## Results

Each benchmark run is saved as `results/YYYY-MM-DD-{label}.md`. Compare scores across runs to measure whether agent file changes improved or degraded instruction compliance.

## Files

| File | Purpose |
|------|---------|
| `simulation-prompt.md` | The exact prompt given to each model (Benchmark 1) |
| `scoring-rubric.md` | How to score responses (5 dimensions, 1-10 each) |
| `results/` | Timestamped benchmark results |
