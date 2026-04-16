# Copilot Instructions for asgard

This repo contains the Odin agent ecosystem — adversarial code review agents for GitHub Copilot CLI, shipped as the **asgard** plugin.

## Core Design Principle

The goal of this repo is to build the **best possible AI coding agent** through adversarial multi-model review. Odin orchestrates a verification pipeline where multiple AI models independently review every change before it reaches the developer. This is not over-engineering — it's the product. Do not suggest simplifying, consolidating, or removing steps from the review flow.

## Repo Structure

- `agents/` — Agent instruction files (.agent.md)
- `skills/` — Agent-specific skills (odin-review-prompts, odin-recall, odin-evidence-bundle)
- `extensions/` — Copilot CLI extensions (mimir-feedback)
- `.mcp.json` — MCP server configuration (Context7)
- `plugin.json` — Plugin manifest

## Agents

Agents live in `agents/<name>.agent.md`. They follow the GitHub Copilot custom agent format with YAML frontmatter defining the agent's metadata and the body containing system instructions.

### Agent Roster

| Agent | File | Role |
|-------|------|------|
| **Odin** | `agents/odin.agent.md` | Orchestrator. Runs the verification loop — boost, survey, implement, verify, present. Delegates plan review to Frigg and adversarial code review to the other agents. |
| **Tyr** | `agents/tyr.agent.md` | Convention-focused adversarial reviewer. Challenges code against readability, simplicity, and maintainability. Every criticism includes a concrete fix. |
| **Mimir** | `agents/mimir.agent.md` | Heuristic pre-screening reviewer. Structured 3-pass review (walkthrough → file-by-file → findings) with review effort scoring. Catches what automated PR reviewers would flag. |
| **Frigg** | `agents/frigg.agent.md` | Plan reviewer. Reviews draft implementation plans before user approval — catches architectural blind spots, scope creep, and simpler alternatives. Spawned by Odin on a different model family for cross-model diversity. |

### Adversarial Reviewers Without Agent Files (by design)

Odin's adversarial review step also uses **Heimdall**, **Thor**, and **Loki**. These are **intentionally not custom agents** — they use the generic `code-review` agent type with dynamically selected models:

| Reviewer | Agent Type | Purpose |
|----------|-----------|---------|
| Heimdall | `code-review` | Baseline cross-model review |
| Thor | `code-review` | Additional review lane |
| Loki | `code-review` | Adversarial trickster — finds subtle, devious problems |

Models are selected at runtime for cross-family diversity based on Odin's own model. See the selection table in `skills/odin-review-prompts/SKILL.md` (Section 5, "Reviewer Model Selection") for the full matrix.

**Do not create `.agent.md` files for Heimdall, Thor, or Loki.** Their value comes from being unbiased — they receive only the review prompt and the diff, with no agent personality or conventions baked in.

## Editing Agent Files

Agent `.agent.md` files are the most critical files in this repo — they define agent behavior at runtime. When editing them:

1. **Read the full file first.** Agent files are long (400–600 lines) and internally cross-referenced. A change to one section can break assumptions in another.
2. **Keep all three agents in sync.** When Odin's review orchestration changes how it passes data to reviewers (prompts, diff format, etc.), update Tyr and Mimir's intake logic to match.
3. **The Odin Loop steps are numbered for a reason.** Do not reorder, merge, or skip steps. Each gate (baseline, review, evidence bundle) exists because a failure mode was observed.
4. **Template placeholders** (`{staged_diff}`, `{list_of_files}`, `{task_id}`) are expanded by the orchestrating LLM at runtime, not by a template engine. Use `<STAGED_DIFF>` XML tags (not markdown fences) to delimit inline diffs — nested backticks break markdown parsing.
5. **All code-change tasks (Small/Medium/Large) show the Frigg-refined plan, not the raw draft.** If user edits change files, risk, architecture, or task size after Frigg reviewed the plan, rerun Frigg once before implementation, record that rerun separately, and show the rerun-refined plan to the user if it changes the approved plan.

## Things That Look Wrong But Aren't

- **Odin's verification ledger uses a SQL session database**, not a file. The `session` database is ephemeral per-session — this is correct. `session_store` is read-only (for recall/history).
- **The `ask_user` gates before commit/push** are intentional friction. Odin must never auto-commit, even if the user says "just do it" in the chat.
- **Tyr and Mimir are launched as `asgard:tyr` and `asgard:mimir`** (custom agents with their own instruction files), while Heimdall/Thor/Loki are launched as `code-review` (generic). This asymmetry is the design.
- **The review prompts say "Do not re-run git"** and pass the diff inline via `<STAGED_DIFF>` tags. This is a performance optimization so 5 reviewers don't all independently shell out to git.

## Git Conventions

- **Branch prefix**: Odin creates branches as `odin/{task-id}`
- **Commits**: Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- **Primary branch**: `main`

## Versioning

The plugin version lives in `plugin.json` — this is the **sole version source** for Copilot CLI plugin installs. Bump it when agent or skill files change:

- **Patch** (e.g., `0.8.0` → `0.8.1`): Any change to `agents/*.agent.md` or `skills/*/SKILL.md` — the default bump.
- **Minor** (e.g., `0.8.1` → `0.9.0`): New agent, new skill, new step in the Odin Loop, or behavioral feature addition. Overrides patch.
- **Major** (e.g., `0.9.0` → `1.0.0`): Breaking changes to agent behavior that require user adaptation. Overrides minor.

When in doubt, bump patch. Forgetting to bump means users running `copilot plugin install` won't pick up the change.

**Always update `CHANGELOG.md`** when committing changes to agent files, skill files, or plugin configuration. Each entry should briefly describe what changed and why. The changelog is the human-readable release history — if it's not in the changelog, it didn't happen.

## Skills Architecture

Odin's operational skills (`skills/*/SKILL.md`) extract step-specific content from the agent file into on-demand modules. This reduces per-turn token cost — content loads only when the relevant step executes.

**Current operational skills:**

| Skill | Step | Type | Purpose |
|-------|------|------|---------|
| `odin-review-prompts` | 5c | Hard dependency | Review prompt templates, model selection, reviewer launch |
| `odin-evidence-bundle` | 5e | Hard dependency | Evidence Bundle template, confidence definitions |
| `odin-recall` | 1d | Advisory | Session history query templates, filtering rules |

**⚠️ Fragmentation limit: 3 operational skills is the practical ceiling.** Beyond this, the cost of remembering to invoke the right skill at the right step exceeds the token savings from a shorter agent file. Cross-model benchmarks (v0.8.0 baseline, avg 43.5/50) showed that file length hurts compliance, but adding more invocation points creates its own compliance risk. Future token optimization should prefer **prose compression** (making existing sections more concise) over **further skill extraction** (creating more files to load).

**Companion skills** (agent-specific, not counted toward Odin's operational ceiling):

| Skill | Agent | Type | Purpose |
|-------|-------|------|---------|
| `mimir-heuristics` | Mimir | Companion | CCA heuristic library (CCA-001–025), spec-aware review, dynamic analysis |

## Testing Changes

After modifying agents:
1. Run contract checks: `make check` (validates cross-file contracts — check names, model tables, skill existence)
2. Reinstall the plugin: `copilot plugin install ./` (from the repo root)
3. Inside Copilot CLI, verify with `/agent` and select the modified agent
4. Run a real task through the modified agent and verify the full loop completes

CI runs `make check` automatically on PRs to `main`.
