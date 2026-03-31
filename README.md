# Asgard

> Adversarial AI coding agents for GitHub Copilot CLI.

Asgard is a Copilot CLI plugin that brings an adversarial multi-model verification loop to your development workflow. Before code reaches you, it runs through a council of AI reviewers — each catching what the others miss.

## The Council

| Agent | Role |
|-------|------|
| **Odin** (`asgard:odin`) | Orchestrator. Runs the full verification loop: boost, survey, plan, implement, verify, present. Delegates plan review to Frigg and adversarial code review to Tyr + Mimir (+ Heimdall/Thor/Loki for large changes). |
| **Frigg** (`asgard:frigg`) | Plan reviewer. Reviews implementation plans before coding begins — catches architectural blind spots, scope creep, and simpler alternatives. Always spawned on a different model family than Odin for cross-model diversity. |
| **Tyr** (`asgard:tyr`) | Convention-focused adversarial reviewer. Challenges code against readability, simplicity, and maintainability standards. Every criticism includes a concrete fix. |
| **Mimir** (`asgard:mimir`) | Heuristic pre-screening reviewer. Structured 3-pass review (walkthrough → file-by-file → findings) with review effort scoring. Catches what automated PR reviewers would flag. |

Heimdall, Thor, and Loki are also invoked by Odin on Large tasks — they use the generic `code-review` agent type with different models to provide independent multi-model signal.

## Install

```bash
copilot plugin install nine-realms/asgard
```

Then pick your agent:
```
/agent   → pick odin
```

## Configuring Odin

Add a `## Odin` section to your repo's `.github/copilot-instructions.md`:

```markdown
## Odin
- Don't save plan files
- Skip Frigg review on medium tasks
- Use branch prefix: feature/
```

Odin reads this file at the start of every task — no extra config files needed.

Odin saves task plans to `.github/odin/plans/` in your repo. To keep them out of version control:

```gitignore
.github/odin/plans/*.md
```

## Requirements

- [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli)

## Credits

Inspired by [Anvil](https://github.com/burkeholland/anvil) by Burke Holland.
