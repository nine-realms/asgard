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
