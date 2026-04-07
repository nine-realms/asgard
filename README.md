# Asgard

> Adversarial AI coding agents for GitHub Copilot CLI.

Asgard is a Copilot CLI plugin that brings an adversarial multi-model verification loop to your development workflow. Before code reaches you, it runs through a council of AI reviewers — each catching what the others miss.

## Why Adversarial?

A single AI agent writes code, reviews its own work, and calls it done. Same blind spots every time. Asgard fixes this:

| Single Agent | Asgard Council |
|---|---|
| Reviews its own work | **Up to five independent reviewers** from different model families |
| Claims tests pass without proof | Every check **INSERT'd into a SQL ledger** — evidence is a SELECT |
| Hallucinates "no regressions" | **Baseline snapshot** before, same checks after — regressions are math |
| Plans and builds in one shot | **Frigg reviews the plan** on a different model before a line is written |

## The Council

| Agent | Role |
|-------|------|
| **Odin** (`asgard:odin`) | Orchestrator. Runs the full verification loop: boost, survey, plan, implement, verify, present. Delegates plan review to Frigg and adversarial code review to Tyr + Mimir (+ Heimdall/Thor/Loki for large changes). |
| **Frigg** (`asgard:frigg`) | Plan reviewer. Reviews implementation plans before coding begins — catches architectural blind spots, scope creep, and simpler alternatives. Always spawned on a different model family than Odin for cross-model diversity. |
| **Tyr** (`asgard:tyr`) | Convention enforcer. Runs 10 structural checks — method length, nesting depth, naming, duplication, error handling, async correctness, and more. Every criticism includes a concrete fix. |
| **Mimir** (`asgard:mimir`) | Deep analysis reviewer. 3-pass review with 23 cross-cutting heuristics — tracing data flow, cache scope, idempotency, and boundary conditions that hide between files. |

Heimdall, Thor, and Loki are also invoked by Odin on Large tasks — three different model families providing cross-model signal. Heimdall is the sentinel (baseline review), Thor is brute-force structural analysis, and Loki is the adversarial trickster hunting subtle edge cases.

## Skills Architecture

Odin's full instruction set is 700+ lines. Loading all of it every turn would bloat the context window. Instead, step-specific knowledge lives in **skill files** that load on demand:

| Skill | Loaded At | Purpose |
|-------|-----------|---------|
| **Review Prompts** | Step 5c (Adversarial Review) | Review templates, model selection matrix, reviewer launch configs |
| **Evidence Bundle** | Step 5e (Presentation) | Evidence Bundle template, confidence definitions, formatting rules |
| **Recall** | Step 1b (Boosting) | Session history queries, filtering rules for past task retrieval |

Three skills is the practical ceiling — beyond that, remembering to invoke the right skill at the right step costs more than the token savings.

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
- Use branch prefix: feature/
```

Odin reads this file at the start of every task — no extra config files needed. Note: some behaviors are non-overridable (Frigg plan review, verification ledger, commit/push gates) even if repo instructions request otherwise.

By default, Odin saves task plans to `.github/odin/plans/` in your repo. Repo instructions can opt out of this (see above), or to keep them out of version control:

```gitignore
.github/odin/plans/*.md
```

## Requirements

- [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli)

## Credits

Inspired by [Anvil](https://github.com/burkeholland/anvil) by Burke Holland.
