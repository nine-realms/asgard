# Odin — Changes from upstream Anvil

Forked from `burkeholland/anvil` @ commit `ae17066` (2026-03-24). Significant divergence since — check upstream for anything you want to pull back in.

## 0.10.3 — Loop gate hardening

- **Investigation MFA clarity**: Added explicit statement that Investigation tasks also enter through MFA — they follow the investigation path, but skipping MFA is never acceptable for any task type. Closes the ambiguity where "Every code-change task" could be read as excluding Investigation.
- **Burden-of-proof swap for new-task detection**: Rewrote the 3-check rule to default "new task." Continuation now requires positive proof: a `loop-entry` ledger row exists, message is within task scope, and no out-of-scope work is requested. Original 3 checks retained as quick-check mnemonics. Same logical outcome (uncertain → new task), but framing makes the safe default explicit.
- **Context-gathered sentinel**: New `context-gathered` INSERT at the start of Step 3, creating an audit trail for Steps 0–2 (Boost, Scan, Recall, Survey) which previously had zero ledger presence. Excluded from 5e Evidence Bundle readiness gate (sentinel is procedural, not a verification signal). Added to Gate Registry.

## 0.10.2 — Stall fix + progress signals

- **Fix: start signal stall**: Odin would emit the `🔁 Starting...` line on Medium tasks then stop, waiting for user input. Root cause: "emit exactly one line" was interpreted as a complete turn, and "minimal output" on Steps 0–2 reinforced "nothing more to do." Fixed by reframing to "show one status line" (transient action) and adding explicit anti-stall language: "keep calling tools, don't stop."
- **Progress signal: Frigg launch (Step 3a)**: New `🔮 Plan drafted — sending to Frigg ({frigg_model}) for cross-model review...` status line before the Frigg subagent launch, eliminating 1–3 minutes of dead air while the plan is under review.
- **Progress signal: reviewer launch (Step 5c)**: New `⚔️ Code verified — launching {reviewer_list} for adversarial review...` status line before adversarial reviewers launch, eliminating 2–5 minutes of dead air during the review phase.
- **Preamble clarity**: Exceptions list now notes that Steps 3a and 5c have their own progress signals outside the Steps 0–2 "minimal text" scope.

## 0.10.1 — Mimir benchmarks + 2 cross-file fixes

- **Mimir benchmark infrastructure**: Added `docs/benchmarks/mimir/` with simulation prompt, scoring rubric, and first results (v0.10.0 baseline: Opus 49, Sonnet 45, GPT-5.4 45, Codex 35, avg 43.5/50). Includes both instruction comprehension (5-question spec test) and comparative review (same diff through different models) benchmark types.
- **Fix: model contradiction**: Mimir's Recommended Model section now explicitly distinguishes standalone default (`claude-sonnet-4.6`) from Odin-spawned primary (`gpt-5.4`), resolving the contradiction between `mimir.agent.md` and `odin-review-prompts/SKILL.md`.
- **Fix: Loki/Mimir fallback overlap**: Updated the "Why Anthropic gets two rows" comment to acknowledge that when Odin=`claude-opus-4.6` and Mimir's primary (`gpt-5.4`) fails, both Mimir (fallback) and Loki end up on `claude-sonnet-4.6`. Documented as acceptable in degraded mode with overlap recorded in Mimir's fallback ledger row.
- **Reverted: HTML file classification**: Original benchmark finding suggested adding `.html`/`.htm` to the documentation/config list. Three independent reviewers (Tyr, Mimir, rubber-duck) convergently identified this as unsafe — Django/Angular templates use plain `.html` and would lose security review. HTML stays in the "code" bucket (everything else) which applies the most comprehensive review prompt.

## 0.10.0 — Mimir boost + heuristics extraction

- **CCA skill extraction**: Moved all 23 CCA heuristics, specification-aware review, and dynamic analysis from `agents/mimir.agent.md` to `skills/mimir-heuristics/SKILL.md` — companion skill loaded via `skill("mimir-heuristics")` after Pass 2 (between Pass 2 and Pass 3) for cross-cutting analysis on the full diff. Agent file drops from ~632 to ~430 lines.
- **New heuristics**: Added CCA-024 (Resource Cleanup in Error Paths) and CCA-025 (Event Handler Race Conditions) to the heuristic library.
- **Ecosystem detectors**: Added 5 new detectors — Go (unchecked errors, goroutine leaks, defer in loops, type assertion without comma-ok), Rust (unsafe blocks, unwrap chains, missing error propagation), Java/Spring (unclosed resources, null unboxing, bean scope mismatches), React/Next.js (stale closures, missing dep arrays, server/client boundary violations), Shell (unquoted variables, missing set -euo pipefail, cd without error check).
- **Exploration guidance**: Expanded from a single sentence to structured when/how/budget/never guidance with default max 3 explorations.
- **Risk-aware review depth**: Added depth calibration table — Mimir adjusts exploration budget, CCA thoroughness, and Pass 2 focus based on `risk_level` metadata or inferred risk from Pass 1.
- **Model update**: Mimir's Odin-spawned primary model set to `gpt-5.4` for cost-efficient structured review, with `claude-sonnet-4.6` cross-family fallback. Ad-hoc default is `claude-sonnet-4.6`. Teams can override Odin-spawned Mimir via `mimir-model` in `.github/copilot-instructions.md` (e.g., `mimir-model: claude-opus-4.6` for premium reasoning); direct `task()` invocations must set the model parameter explicitly. Loki row 1 cascaded from `claude-sonnet-4.5` to `claude-sonnet-4.6`.
- **Per-finding confidence**: Added `Confidence: High / Medium / Low` field to Pass 3 finding template with definitions — helps developers triage findings by certainty.
- **Cross-boundary test gap analysis**: New analysis section checking for untested cross-boundary flows (new endpoints without integration tests, new error paths without caller-side tests). Scoped to Mimir's lane — Tyr handles per-file test coverage conventions.
- **Panel confidence filter**: In panel mode, surface-level findings now require High confidence — reduces noise from duplicating what other reviewers catch, while cross-cutting findings (Mimir's unique lane) report at all confidence levels.
- **Recall availability guard**: Added Section 0 to `odin-recall` skill — checks the required Recall query tables (`sessions`, `session_files`, `search_index`) exist in `session_store` before querying. Skips silently if tables are missing instead of producing error noise.
- **README**: Renamed "Configuring Odin" → "Configuration (Optional)", added "works out of the box" opener.
- **AGENTS.md**: Added `mimir-heuristics`, `odin-evidence-bundle`, and `odin-recall` skill entries.
- **copilot-instructions.md**: Added companion skills table distinguishing `mimir-heuristics` from Odin's 3-skill operational ceiling.

## 0.9.12 — Plan handling + branch reuse fixes

- **Bring-your-own-plan**: Investigation tasks can now invoke Frigg to review a user-provided plan file — previously Investigation skipped Step 3 entirely, making Frigg unreachable for plan review requests.
- **Post-Frigg approval gate**: `ask_user` after Frigg review is now a formal `🚫 GATE`, not just prose instruction. Prevents the "loop started, no continue prompt" stall where the model continued silently after Frigg returned.
- **Frigg timeout**: Frigg now has a 10-minute timeout matching reviewer timeouts in Step 5c. Frigg gate query updated to accept `review-frigg-timeout`. Prevents indefinite stall if Frigg `task()` call hangs.
- **Plan path resolution**: When the user provides an existing plan file, Step 3b no longer writes a duplicate to `.github/odin/plans/`. The SQL ledger row is sufficient proof of planning.
- **Branch-reuse detection**: Git Hygiene now detects when a new task is on an `odin/` branch from a different task and pushes back. Includes carve-out for Step 10 PR feedback re-entry.

## 0.9.11 — Branch protection for Small tasks + loop-bypass reinforcement

- **Branch check expanded**: Git Hygiene branch check now fires on all code-change sizes (Small/Medium/Large), not just Medium/Large. Prevents Small tasks from committing directly to `main` without warning.
- **Loop-bypass reinforcement**: Added 3 reinforcement points to prevent models from skipping the Odin Loop entirely on "trivial" tasks — identity-level invariant, decision-point stop condition, and pre-edit gate requiring a `loop-entry` row before any code-editing action. Addresses observed failure mode where model bypassed all MFA/Frigg/Mimir/gates on a 2-line fix.
- **Branch-neutral pushback message**: Git Hygiene branch check message now uses the detected branch name instead of hard-coded `main` — fixes confusing UX for repos using `master` or other default branch names (PR #17 feedback).

## 0.9.10 — Codex benchmark improvements + continuation recovery

- **Gate formatting**: Standardized loop-entry gate to use `🚫 GATE:` heading pattern matching all other gates — Codex was missing it due to inconsistent formatting
- **Gate Registry**: Added quick-reference table at end of agent file listing all scored gates with thresholds — gives fast-scanning models a single location to enumerate gates
- **Step 0 labels**: Added bold labels ("Boost the prompt:", "Instruction scan:") to previously unlabeled sub-actions in Step 0 for consistent scannability
- **MFA progress label**: Added instruction to use user-friendly `report_intent` text ("Initializing Odin") instead of opaque "MFA" terminology
- **Continuation recovery**: Added context recovery protocol — after compaction/summary, Odin queries the ledger to determine which loop steps are pending instead of assuming prior conversation counts as completed work. Clarified that continuation skips MFA only, not Frigg/Mimir/gates

## 0.9.9 — Mimir on all Small tasks

- **Small task review**: Mimir now runs on every Small task in standalone mode — every code change gets at least one adversarial reviewer
- **Step 5c gates**: Added Small gate (Mimir count ≥ 1) alongside existing Medium (≥ 2) and Large (≥ 5) gates
- **Pre-commit gate**: Expanded from Medium/Large to all code-change sizes — Small tasks now gated on Mimir review
- **Skill file**: Updated `odin-review-prompts` with Small task standalone context and panel_list instructions
- **Docs/README**: Updated Task Sizing descriptions and Council table to reflect Mimir's expanded scope

## 0.9.8 — Documentation enhancements

- **GitHub Pages**: Expanded "Why Adversarial?" problem section with side-by-side comparison grid (single agent failures vs Asgard approach)
- **GitHub Pages**: Added "The Armory" skills section with on-demand loading cards and 3-skill ceiling rationale
- **GitHub Pages**: Fixed false claims — "five models on every change" corrected to "up to five" (size-dependent), removed redundant Runes (Adversarial/SQL/Baseline) that duplicated the comparison grid, replaced with Cross-Model Diversity, Task Sizing, Commit Gates
- **GitHub Pages**: Rewrote Pantheon cards for accuracy — Tyr (10-criteria enforcer), Mimir (23-heuristic deep analysis), Heimdall/Thor/Loki (distinct roles instead of generic "Adversarial Review")
- **GitHub Pages**: Reordered sections — Armory before Evidence Bundle for better narrative arc
- **README**: Synced all content changes

## 0.9.7 — Address PR #13 review feedback

- **MFA forward reference**: Step 1 Runtime Gate failure path now explicitly notes it is the one allowed forward reference before MFA completes — eliminates instruction conflict with "do not read further" preamble
- **Loop-entry gate**: Now handles SQL errors (e.g. missing `odin_checks` table) the same as result=0 — both send back to MFA step 1 for full restart

## 0.9.6 — Widen Step 0 gate recovery

- **Gate recovery**: Step 0 loop-entry gate failure now sends back to MFA step 1 (full restart) instead of step 4 (INSERT only). If MFA was skipped entirely, patching just the INSERT leaves the table and task_id missing. Found by Opus in v0.9.5 benchmarks (reinforced across 2 runs).

## 0.9.5 — Benchmark-driven signal and safety fixes

- **Start signal**: Moved from after pushback gate to immediately after task sizing — users now see `🔁 Odin Loop` before any ambiguity/pushback questions pause the flow (4/4 benchmark convergence)
- **Continuation check**: Added uncertainty-default clause — when unsure whether a message is a new task, default to new task (re-run MFA). Skipping MFA is the dangerous direction.
- **Size escalation**: Added explicit re-run instruction when plan drafting triggers a size increase (e.g., Small → Large via 🔴 files) — recompute all size-derived obligations (Recall depth, Survey depth, reviewer count) at the escalated size
- **Investigation shortcut**: Simplified — start signal is now already shown before the shortcut fires, removed redundant "show the start signal" directive
- **Benchmarks**: Added v0.9.4 benchmark results (4-model, avg 44.5/50, +0.2 from v0.9.3)

## 0.9.4 — Close MFA→Step 0 gap

- **Structure**: Moved Runtime Gate, Task Sizing, and Verification Ledger sections to end-of-file reference area — closes the 110-line gap between MFA and Step 0 that 2/4 benchmark models identified as the top remaining navigational hazard
- **Reading path**: MFA now flows directly into The Odin Loop → Step 0 with no intervening reference material
- **Cross-references**: Updated all positional words ("above"/"below") to position-independent section-name references
- **Benchmarks**: Added v0.9.3 benchmark results (4-model, avg 44.3/50, +0.3 from v0.9.2)

## 0.9.3 — MFA hardening + benchmark-driven clarity fixes

- **MFA**: Merged ⚠️ CRITICAL callout into MFA section as single atomic block — eliminates "satisfied after sql check" off-ramp (2/4 benchmark models flagged)
- **Step 0**: Moved loop-entry gate inside Step 0 as first action — prevents header-navigating models from skipping the interstitial gate (2/4 benchmark models flagged)
- **Step 5c**: Added explicit 4-step placeholder materialization checklist with verify-and-halt — prevents malformed reviewer prompts (3/4 benchmark models flagged)
- **Task Sizing**: Added step routing table (Investigation/Small/Medium/Large) — eliminates scattered size conditionals, gives models single reference point (2/4 benchmark models flagged)
- **Benchmarks**: Added v0.9.2 benchmark results (4-model, avg 44.0/50, +1.0 from v0.9.1)

## 0.9.2 — Benchmark-driven loop hardening

- **Task Sizing**: Added Investigation task type for non-coding requests (explain, trace, research) with `ask_user` confirmation gate — prevents forcing questions through the full plan→implement→verify loop
- **MFA**: Added `loop-entry` INSERT (step 4) — makes MFA→Loop transition auditable, closes the ungated silent zone (2/4 benchmark models flagged)
- **Step 0**: Added visible start signal (`🔁 Odin Loop — {task_id} | {size} | Starting...`) — all 4 benchmark models flagged silent steps as "not started" perception issue
- **MFA**: Replaced "did intent change?" heuristic with structured 3-check continuation boundary rule (all 4 benchmark models flagged as top failure mode)
- **Spec-wide**: Audited all "all task sizes" language — replaced with "Small/Medium/Large" or "code-change task sizes" where Investigation path is excluded (Frigg finding)
- **Benchmarks**: Updated simulation prompt to include skill files alongside agent spec, fixing -3 Codex scoring artifact from Tier 2 skills factoring
- **Benchmarks**: Added v0.9.1 benchmark results (4-model, avg 43.0/50)

## 0.9.1 — Reviewer diversity fix + CI

- **Step 5c model table**: Split Anthropic row so Loki gets an Anthropic model (claude-sonnet-4.5 when Odin is opus, claude-opus-4.6 otherwise) — fixes all-OpenAI generic reviewer panel on the most common path
- **copilot-instructions.md**: Replaced static H/T/L model table with dynamic reference to skill; models are selected at runtime
- **CI**: Added `scripts/check-contracts.sh`, `Makefile` (`make check`), and GitHub Actions workflow for contract validation on PRs to main
- **Contract checks**: check-name alignment (skill ↔ agent gates), skill file existence, panel mode contract, version ↔ changelog alignment, H/T/L model uniqueness per row

## 0.9.0 — Skills extraction
- Fixed verification ledger to write to `session` database (upstream incorrectly targets read-only `session_store`)
- Renamed ledger table from `anvil_checks` to `odin_checks`
- Changed branch prefix from `anvil/` to `odin/`
- Step 0 (Boost): Added repo instruction file scanning (.github/copilot-instructions.md, AGENTS.md)
- Step 5 (Verify): Renamed "The Forge" to "Valhalla"
- Step 5c (Adversarial Review): Named reviewers — Tyr + Mimir (required, Medium+Large), Heimdall/Thor/Loki (multi-model, Large only)
- Step 5c (Adversarial Review): Added documentation-aware review prompt for markdown-only changes
- Step 5c (Adversarial Review): Added 10-minute reviewer timeout guidance
- Step 8 (Commit): Changed from auto-commit to always `ask_user` before committing
- Added Step 9: Push & PR creation with `ask_user` gate
- Added "Subagent Strategy" section with delegation guidelines
- Added Context7 MCP server in `.mcp.json` (pinned version)
- Added Runtime Gate: environment check — fails fast when required tools (`sql`, `bash`, `task`) are missing (e.g., VS Code Chat Local agent mode)
- Step 3 (Plan): Changed from silent-for-Medium to always user-visible before implementation; all task sizes see the Frigg-refined plan rather than the first draft
- Added Step 3a: Cross-model plan review via Frigg subagent (`asgard:frigg`) — model auto-selected from a different family than Odin's current model and run before plan presentation on all task sizes
- Step 3a (Plan Review): Added verification gate — Frigg verdict must be INSERTed into `odin_checks` before proceeding to 3b (prevents silent skipping)
- Step 3a (Plan Review): Added one-time Frigg rerun on material user plan changes (files, risk, architecture, or task size)
- Step 5c (Adversarial Review): Changed Thor from `gemini-3-pro-preview` to `gpt-5.4` as a temporary fallback until a Google-family reviewer model is available again
- Added `agents/frigg.agent.md`: Plan review agent — goddess of foresight, reviews plans before coding begins
- Added Step 3b: Plan persistence — writes approved plans to `.github/odin/plans/{task_id}.md` for team visibility and cross-session recall; appends completion metadata after commit
- Step 3a (Plan Review): Extended Frigg review to **all task sizes** including Small — "is this the right approach?" is task-size-independent
- Step 3b (Plan Persistence): Made on-disk plan file optional (SQL ledger mandatory) — repo instructions can opt out of file writes, but Frigg review + SQL INSERT are non-overridable
- Step 0 (Boost): Added non-overridable behaviors list — plan review, verification ledger, commit/push gates, and evidence bundle cannot be suppressed by repo instruction files
- Steps 0-2 (Foundation): Merged Step 0 (Boost) + Step 1 (Understand) into single "Boost + Understand" step with explicit ambiguity gate
- Step 1 (Environment + Tooling Scan): NEW — cheap config-file discovery runs on all task sizes, caches results for Plan (Step 3) and Verify (Step 5b)
- Step 1b (Recall): Expanded scope — past plans, stored conventions, reviewer findings. Filtered: repeated/recent/file-overlap only. Branch-level fallback when target files unknown
- Step 2 (Survey): Depth now scales by task size — Small:1, Medium:2-3, Large:4+ searches
- Step 2b (Progress Signal): NEW — one-liner after Steps 0-2 summarizing what was found (Medium and Large only)
- Steps 0-2: Added stop condition — hard bias-to-exit after size-appropriate Survey completes
- Steps 0-2: Stop condition now reopens ambiguity gate when Recall/Survey surfaces new blockers
- Step 1b (Recall): Fixed fallback query — changed `s.repository` → `s.cwd` with `{repo_path}` for correct filesystem-based session matching
- Step 5b (Verification Cascade): Tier 2 now reuses Environment Scan cache from Step 1
- Step 5c (Adversarial Review): Added specification review prompt for `.agent.md`/`.skill.md` files — three-way file-type classification (spec / doc / code) with additive mixed-diff handling
- Step 1b (Recall): Fixed undefined `{target_module}`/`{target_filename}` placeholders → `{filename}` (consistent with other Recall queries)
- Step 2b (Progress Signal): Fixed malformed tooling placeholder syntax — removed wrapping braces from multi-item status list
- Step 5c (Adversarial Review): Fixed literal `{placeholders}` in spec/code review prompts that could confuse the template expansion pipeline
- Step 5c (Adversarial Review): Added `description` parameter to all reviewer task templates for consistent UI labels
- Step 3a (Plan Review): Added `description` parameter to Frigg task template
- Step 5c (Adversarial Review): Added `review_context=panel` metadata and `panel_reviewers` list to Mimir prompts — activates Mimir's panel mode lane assignments
- Step 5c (Adversarial Review): Dynamic reviewer model selection — Heimdall/Thor/Loki models auto-selected by cross-family table based on Odin's model, with fallback rules
- Step 5b (Verification Cascade): Fixed Tier 2 skip/stale contradiction — Step 1 is always-run, replaced impossible "if skipped" branch with "if context was lost" graceful degradation
- Step 5c (Adversarial Review): Extended materialization rule to cover model placeholders (`{heimdall_model}`, `{thor_model}`, `{loki_model}`) alongside `{list_of_files}` and `{staged_diff}` — single source of truth for all placeholder resolution
- Step 5c (Adversarial Review): Added explicit model materialization cross-reference between selection table and task templates
- Step 5c (Adversarial Review): Fixed prompt render rule — `{staged_diff}` inside `<STAGED_DIFF>` tags IS substituted (phase 2), then the expanded content is protected from double-substitution (phase 3). Previous wording implied the tags blocked all substitution.
- Standardized `{task_id}` placeholder name — replaced 4 occurrences of `{task-id}` in file paths/headings with `{task_id}` (the slug value still contains dashes, e.g., `fix-login-crash`)
- Step 5c (Adversarial Review): Added size guard exception — when diff exceeds ~8K lines and reviewers receive only `{list_of_files}`, they ARE instructed to run `git diff` per-file (overrides the general "don't re-run git" rule)
- Runtime Gate: Clarified why checking `sql` alone is sufficient — it only exists in the Copilot CLI runtime, which always bundles `bash` and `task`
- Step 5e (Evidence Bundle Gate): Tightened query to exclude `readiness-*` rows — gate now counts only real verification signals (build, test, lint, diagnostics), not 5d readiness checks
- Step 3a (Plan Review): Standardized Frigg placeholder to `{frigg_model}` everywhere — replaced `{selected_cross_model}` and `{model}` variants
- Step 5c (Adversarial Review): Merged prompt render step 3 ("no double-substitution") into step 2 — wording said "two phases" but listed three numbered items
- Step 2b (Progress Signal): Removed braces from `N` placeholders in example — `{N}` conflicted with the `{...}` expansion convention used elsewhere
- Step 1 (Environment Scan): Clarified "read config files" summary to note presence-only formats (e.g., `*.xcodeproj`) are recorded without reading
- Step 3a (Plan Review): Reverted Frigg template task size from `{task_size}` placeholder to inline `Small / Medium / Large` pick-one format — clearer as a prompt hint
- Step 5c (Adversarial Review): Added explicit `phase = 'review'` to size guard `review-partial-coverage` INSERT — prevents bookkeeping row from counting toward 5e verification gate
- Step 8 (Commit): Added pre-commit review gate — verifies adversarial reviews ran before offering to commit (Medium/Large). Catches the case where Step 5c is skipped entirely, since 5c's own gate only fires on entry.
- Restructured `odin.agent.md` for loop start reliability — promoted MANDATORY FIRST ACTIONS near the top, moved Runtime Gate up, and returned Pushback to its reference position (primacy effect for entry instructions)
- Added Step 10 (PR Feedback Re-entry): PR review comments are tasks, not quick fixes — re-enters the sized loop with `{task_id}-pr-feedback` convention
- Step 5c (Adversarial Review): Added primary/fallback model selection for Tyr (`gpt-5.3-codex` / `gpt-5.4-mini`) and Mimir (`claude-sonnet-4.6` / `gpt-5.4`) in `odin-review-prompts` skill
- Added versioning convention to `.github/copilot-instructions.md` — patch bump for agent/skill changes, minor for features, major for breaking changes
- Bumped plugin version to `0.8.0`
- Added `docs/benchmarks/` — cross-model instruction simulation harness with reusable prompt, 5-dimension scoring rubric (50 max), and baseline results (Opus 42, Sonnet 48, GPT-5.4 44, Codex 40 — avg 43.5/50)
- Step 3c (Baseline Gate): Added explicit `SELECT COUNT(*)` verification query — previously prose-only, now matches gate pattern used everywhere else
- Steps 0-2 (Loop Start): Added `🔁 ODIN LOOP STARTS HERE` visual marker before stop condition — helps models identify where pre-flight ends and the loop begins
- MANDATORY FIRST ACTIONS: Added "What is a new task?" definition — distinguishes new tasks from continuations to prevent unnecessary MFA re-runs
- Bumped plugin version to `0.8.1`
- Step 1b (Recall): Extracted SQL query templates, filtering rule, and decision tree into `skills/odin-recall/SKILL.md` — advisory skill (proceed silently on failure). Agent file replacement: ~50 lines → ~10 lines.
- Step 5e (Evidence Bundle): Extracted presentation template, generate-from-SQL query, and confidence definitions into `skills/odin-evidence-bundle/SKILL.md` — hard dependency (HALT on failure). Gate query stays inline. Agent file replacement: ~40 lines → ~10 lines.
- Skills Awareness: Restructured into three categories — hard dependencies (`odin-review-prompts`, `odin-evidence-bundle`), advisory (`odin-recall`), and companion. Added fragmentation limit warning (3 operational skills is practical ceiling).
- `.github/copilot-instructions.md`: Added Skills Architecture section documenting the 3-skill ceiling decision with benchmark rationale. Updated skills directory description.
- Bumped plugin version to `0.9.0` (minor: new skills)
