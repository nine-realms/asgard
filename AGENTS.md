# Agents of Asgard

## Available Agents

### Odin (`asgard:odin`)
Evidence-first coding agent. Verifies before presenting. Attacks its own output. Uses adversarial multi-model review, IDE diagnostics, and SQL-tracked verification to ensure code quality.

### Frigg (`asgard:frigg`)
Plan reviewer. Reviews implementation plans before coding begins — catches architectural blind spots, scope creep, and simpler alternatives. Spawned by Odin on a different model family for cross-model diversity.

### Mimir (`asgard:mimir`)
Heuristic pre-screening code reviewer. Catches common PR review findings before push so reviewers see clean code. Structured multi-pass review with high signal-to-noise ratio.

### Tyr (`asgard:tyr`)
Adversarial but constructive code reviewer. Rigorously challenges code changes against readability, simplicity, and maintainability standards. Every criticism includes a concrete suggestion or rewritten example.

### Surtr (`asgard:surtr`) *(experimental)*
Ultra-compact caveman-speak variant of Odin. Same gates and SQL ledger (`odin_checks` — cross-agent task resume works), same skills (stolen, not duplicated), ~38% fewer lines. Exists to benchmark whether terse imperatives match Odin's compliance score at lower token cost. No plan file persistence, no PR feedback re-entry.

## Skills

### `odin-review-prompts`
Review prompt templates, file-type classification, model selection, and reviewer launch instructions for Odin's Step 5c adversarial review. This is an **operational skill** — a hard dependency loaded on-demand during Step 5c, not on every turn. Contains the 3 review prompt templates (spec/doc/code), Tyr/Mimir/Heimdall/Thor/Loki launch templates, and the cross-family model selection table.

### `odin-evidence-bundle`
Evidence Bundle presentation template and confidence level definitions for Odin's Step 5e. Hard dependency — if loading fails, HALT.

### `odin-recall`
Session history query templates and filtering rules for Odin's Step 1d Recall phase. Advisory skill — if loading fails, proceed silently.

### `mimir-heuristics`
Cross-cutting analysis heuristic library for Mimir's Pass 2 review. Contains CCA-001 through CCA-025, specification-aware review rules, and dynamic analysis guidance. This is a **companion skill** — loaded by Mimir before running cross-cutting analysis, not an Odin operational skill.
