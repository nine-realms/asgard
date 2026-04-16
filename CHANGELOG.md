# Odin — Changes from upstream Anvil

Forked from `burkeholland/anvil` @ commit `ae17066` (2026-03-24). Significant divergence since — check upstream for anything you want to pull back in.

## 0.11.2 — Recall scope consistency

- Fixed stale "(Medium/Large only)" qualifier in Skills Awareness section for `odin-recall` — Recall runs for all tasks since sizing is deferred to Phase 2

## 0.11.1 — Two-phase refactor hardening

Fixes 4 issues identified during review of the Phase 1/Phase 2 architecture:
- Step 2c Phase Transition Gate now INSERTs a `phase-transition` classification row with SQL verification gate at Step 2d entry
- Recall (Step 1b) scope clarified: runs for all tasks since sizing is deferred to Phase 2
- Removed redundant Step 0 start signal (keep Mímir early signal + Step 2d size signal — 2 signals, not 3)
- Step 7 (Present) explicitly marked as Phase 2 only; research findings present at Step 2c
- Evidence Bundle exclusion list updated to include `phase-transition` procedural marker

## 0.11.0 — Phase 1 / Phase 2 architecture

Refactors the Odin Loop into two explicit phases:
- **Phase 1 (Understand)**: Steps 0–2c. Runs for every task type. Boost, scan, recall, survey, then classify at the Phase Transition Gate.
- **Phase 2 (Act)**: Steps 2d–9. Runs only for code-change tasks. Size, git hygiene, plan, implement, verify, commit.

Key changes:
- New Step 2c (Phase Transition Gate): classifies task outcome as research-only, code-change, ambiguous, or plan-review
- New Step 2d (Phase 2 Entry): Task Sizing + Git Hygiene moved here from Steps 0 and 0b
- Research tasks present findings at Phase 1 boundary (Step 2c) — never enter Phase 2
- Eliminated hard `ask_user` confirmation for Investigation classification
- Phase 1 survey uses fixed 2-3 search budget; deep research escalation available at 2c
- Steps 1b (Recall) and 2b (Progress Signal) now run for all tasks (no longer size-gated before sizing)
- All existing step numbers preserved — zero skill reference breakage

## 0.10.18 — Early start signal

- **Early start signal in MFA Step E**: Added a user-facing signal (`👁️ Odin peers into the Well of Mímir…`) that fires immediately after loop-entry verification succeeds, before Step 0 begins. Previously, users saw 10-30 seconds of silence between sending a message and the start signal (which fires after sizing). The early signal confirms Odin is alive and working. Continuations are unaffected — they skip MFA D–E entirely, so the early signal never fires on resume paths (no double-signal risk).

## 0.10.17 — Multi-turn investigation continuation

- **Investigation continuation in MFA Step C**: `investigation-complete` was treated identically to `task-complete` — every follow-up message after presenting findings triggered a full MFA re-entry with new task_id and `ask_user` re-confirmation, making conversational investigations painful. Split the completion check: `task-complete` remains a hard close (always new task), `investigation-complete` is now a soft close — in-scope follow-ups that remain investigation-type work continue the same task at Survey without re-entering MFA. Follow-ups requesting code changes ("fix it", "add logging") correctly force a new task with reclassification.

## 0.10.16 — Frigg approval placeholder fix + changelog cleanup

- **Frigg approval SQL placeholder fix (PR review)**: Step 3a still used pseudo-placeholders like `{1_if_approved | 0_if_cancelled}` and `{1_if_approved_or_user_proceeded | 0_if_cancelled}` in executable SQL blocks. Replaced both with a single explicit `{passed}` placeholder and defined its `1`/`0` meaning in the surrounding prose so the runtime instructions stay syntactically valid and consistent.
- **Changelog heading cleanup (PR review)**: Merged the split `0.10.11` release notes under one heading so the release history has a single canonical section for that version.

## 0.10.15 — Continuation task_id hardening + distinct Evidence Bundle readiness (benchmark findings)

- **Continuation task_id hardening (Sonnet/Opus — v0.10.14 standard benchmark)**: MFA step C could read the most recent `loop-entry` row, set `{task_id}`, then route to **new task** with that stale value still in scope. This left room for models to satisfy later gates against the prior task's ledger rows. Hardened the new-task exits in step C to explicitly discard the carried-forward `{task_id}` and clarified in step D + Verification Ledger that only true continuations reuse MFA step C's value; every new-task path must generate a fresh slug in step D.
- **Evidence Bundle readiness counts distinct real checks (Opus/Tyr — v0.10.14 standard benchmark + review)**: Step 5e previously used `COUNT(*)` over eligible `phase='after'` rows, so duplicate verification inserts for the same check could inflate readiness. Tightened the gate to `COUNT(DISTINCT check_name)` and excluded `tier3-infeasible` bookkeeping rows, so readiness now requires distinct verification signals, not raw row count or infeasibility markers.

## 0.10.14 — Loop gate + MFA batch clarity + SKILL.md spec detection (benchmark findings)

- **Loop-entry gate at section level (Opus Q5 — v0.10.13 standard benchmark)**: Multiple models independently found that LLMs pattern-match `## The Odin Loop` as the entry point and skip MFA. The existing precondition was buried in prose inside Step 0. Added a formal `🚫 GATE` block at the top of `## The Odin Loop` (before Step 0) with the loop-entry SQL query and explicit "return to MFA step A" instruction for any failure including query errors.
- **MFA batch sequencing clarity (Sonnet Q3/Q4 — v0.10.13 standard benchmark)**: Line 10's "Steps B–E follow immediately in this turn, each as its own tool-call batch" was flagged as ambiguous — "in this turn" could be read as "all in one LLM response," breaking the C→D conditional dependency. Changed to "follow immediately as sequential tool-call batches — wait for each result before issuing the next; do not combine C with D/E in a single batch."
- **SKILL.md spec file detection (GPT-5.4 Q3 — v0.10.13 standard benchmark)**: The spec file classifier in `odin-review-prompts/SKILL.md` matched `.skill.md` extension only, but repo skill files are named `SKILL.md`. This caused skill file changes to be misclassified as documentation, applying the wrong review prompt. Updated all classification references in `odin-review-prompts/SKILL.md` and `mimir-heuristics/SKILL.md` to include `SKILL.md` alongside `.skill.md` — affects File-Type Classification, prompt template headers, the `{IF_SPEC_FILES_IN_DIFF}` conditional marker, and Mimir's spec-aware activation trigger (CCA-021, CCA-022).
- **Frigg approval scope clarity (Sonnet Q3 — v0.10.13 standard benchmark)**: Step 3a's "do not prompt a second time" note on the tradeoff path was at risk of being over-generalized — an LLM could read it as "you already asked once in Step 3a, skip approval on other paths." Reworded to "do not add a second approval prompt for this same unchanged plan presentation" to scope it to the specific path only.

## 0.10.13 — Step 0 gate ordering fix + escalation hard stop (benchmark findings)

- **Step 0 gate ordering (Finding 1 from v0.10.12 Arm C3 — Opus)**: Ambiguity gate and pushback gate were ordered AFTER task sizing and the start signal in Step 0's paragraph sequence. Startup Routing ("Resolve ambiguity → resolve pushback → ...") already documented the correct intent — the implementation just had the wrong text order. Fixed by reordering paragraphs: boost → boosted prompt display → ambiguity gate → non-overridable behaviors → pushback gate → task sizing → start signal. Start signal wording updated from "Immediately after sizing" to "After resolving ambiguity and pushback." Cross-reference at MFA line 47 updated to match.
- **Size escalation hard stop (Finding 3 from v0.10.12 Arm C3 — Sonnet)**: The size escalation instruction in Step 3 was advisory — it said to re-run Steps 1b+2 but used no gate language, making it easy for execution models to skip the re-survey and proceed directly to Frigg. Added explicit `🚫 Stop — do not proceed to Frigg or plan approval` gate to enforce the mandatory re-run.

## 0.10.12 — MFA→Loop section boundary fix (benchmark finding)

- **Root cause (Sonnet + Opus independently)**: `"MFA complete. New tasks → begin the Odin Loop at Step 0."` was a prose navigation sentence with a section break (identity text + `## The Odin Loop` header) before the Step 0 gate — a natural LLM stop point. Models completed the MFA procedural block and yielded before executing Step 0.
- **Fix**: MFA now ends with a `🚫 Verify and proceed immediately` gate block containing the loop-entry SELECT. The gate's success path says `"immediately begin Step 0 — next tool call is the instruction scan"` — a forward imperative, not navigation.
- **Step 0**: Removed the redundant loop-entry gate SQL block (now covered by MFA). Added a one-line precondition note documenting the dependency on MFA.
- **Startup phase intro (line ~55)**: Compressed from 5 sentences to 2 — removed redundant "not stopping / not pausing" prose that was a symptom of the structural gap, not a cure.
- **Start signal warning (line ~79)**: Compressed from 4 sentences to 2 for same reason.
- **Line 10**: Reframed `"Do not stop here; immediately continue to B–E in the same response (sequential tool-call batches, not one parallel batch)"` → `"Steps B–E follow immediately in this turn, each as its own tool-call batch."` Positive statement, clearer "this turn" wording.
- **Gate Registry**: `loop-entry` gate moved from `Step 0` → `MFA`.

## 0.10.11 — MFA stall fix + SELECT 1 duplication fix (benchmark findings)

- **SELECT 1 duplication fix**: Arm C benchmark found Sonnet (-1) read the `SELECT 1` in the first-batch description and the `SELECT 1` in Step A's Runtime Gate as a double-execute. Fixed by making the first-batch description say "Step A (`SELECT 1`, session DB)" and Step A's body say "The `SELECT 1` from the first batch above". Arm C2 confirms the complaint is gone; score held at 43.5 avg (neutral — no regression).

- **"Nothing else" stall fix**: 3/4 benchmark models interpreted `"Nothing else"` on the first-batch instruction as a turn-stop signal — the agent would emit "Initializing Odin" and yield to the user before completing steps B–E. Rewritten to `"Do not stop here; immediately continue to B–E in the same response"`.
- **"Same turn" parallel-batch ambiguity**: A second benchmark round (v0.10.11 run) found that `"same turn"` was ambiguous — 3/4 models flagged it could mean "fire all B–E in one parallel batch" rather than sequential batches. Clarified to `"same response (sequential tool-call batches, not one parallel batch)"`.

## 0.10.10 — Structural clarity fixes (benchmark findings)

- **Frigg timeout gate fix**: The timeout path previously inserted `review-frigg-timeout` with `passed=1` and declared "the timeout row satisfies the Frigg gate" — meaning an LLM could skip the mandatory `ask_user` plan approval by satisfying the gate with the timeout row alone. Fixed: timeout row is now bookkeeping only (`passed=1` records the event, not approval); a second `review-frigg` INSERT is added *after* `ask_user` to capture the user's actual decision; the Step 3a gate now checks only `review-frigg`. Plan approval via `ask_user` is structurally required before the gate can be satisfied.
- **MFA step numbering**: Renamed MFA steps 1–5 → A–E throughout the file (MFA block + 7 cross-references). Eliminates namespace collision with Loop steps 0–10; "go back to step A" is unambiguous where "go back to step 1" was not.

## 0.10.9 — Targeted clarity fixes (Sonnet review)

- **Evidence Bundle qualifier in non-overridable list**: Changed "Evidence Bundle (5e)" → "Evidence Bundle gate (5e — Medium/Large only)" in Step 0's non-overridable behaviors list. Small tasks don't have an Evidence Bundle — without the qualifier a literal-following model could misapply this requirement on Small tasks.
- **Plan review exception compressed**: Reduced from ~7 lines to 2 lines in Step 0. Keeps the scope guard ("user-provided plan, not an Odin draft") and the behavioral rule (findings-only, not an approval gate), but references Step 3a for INSERT field details instead of restating them inline. Saves ~5 lines from high-attention Step 0 real estate.
- **Removed fork attribution from agent header**: The "Forked from burkeholland/anvil" blockquote was human-oriented provenance that consumed tokens every turn. Moved to README (already present) and CHANGELOG (already the opening line).

## 0.10.8 — Prose compression + MFA done signal

- **MFA block compressed from 58→38 lines**: Hybrid-compact CREATE TABLE (scannable but shorter), tighter continuation prose, removed redundant progress-label paragraph. All logic preserved.
- **Explicit "MFA complete" boundary**: Added a clear done-signal after step 5 with routing — new tasks enter Step 0, continuations emit resume signal. Moves continuation start signal OUT of step 3 (was firing inside MFA before steps 4–5 completed).
- **First-batch instruction front-loaded**: Rewritten from "Your first tool-call batch on every message must contain..." (buried 14 words in) to "First batch = ... Nothing else" (constraint-first).
- **Deduplicated Verification Ledger**: Removed the 15-line duplicate CREATE TABLE from the Verification Ledger section — references MFA step 2 instead.
- **Step 8 gate deduplication**: Pre-commit review gate now references Step 5c's gate query instead of repeating all three size-specific SQL queries.
- **Centralized skill invocation rules**: Moved the "do not gate on available_skills / call directly" boilerplate from Steps 1b, 5c, and 5e into Skills Awareness section. Step-local instructions now reference the central rule.
- **Interactive Input Rule compressed**: Merged two separate example blocks into one compact block. Both failure modes (secret piping, confirmation pre-answering) preserved.
- **General prose compression**: Step 0 instruction scan, non-overridable behaviors, startup routing, Step 1 caching, Step 3a Frigg rerun, Step 3b cleanup — all tightened without logic changes. Total: 810→710 lines (−100 lines, −12%).

## 0.10.7 — Continuation reliability + MFA forward-reference elimination

- **Objective completed-task detection in MFA step 3**: Before fuzzy scope checks, step 3 now queries for terminal ledger rows (`task-complete` or `investigation-complete`). If the prior task already finished, it routes to new task immediately — no judgment call needed for the most common misclassification case.
- **Terminal `task-complete` row in Step 8**: Successful commits now INSERT a `task-complete` row, giving MFA step 3 an objective signal that the prior code-change task is done. Investigation tasks already had `investigation-complete`.
- **Continuation start signal**: Continuation paths now emit `> 🔁 **Odin Loop** — {task_id} | Resuming at Step {N}…` so the user always sees loop state, matching the new-task start signal from Step 0.
- **Inline CREATE TABLE in MFA step 2**: The ledger schema is now inlined directly in MFA instead of referencing the Verification Ledger section 400+ lines away. Eliminates the forward-reference compliance risk.
- **Parallel-call clarity for first tool batch**: Rewrote the MFA opening instruction to explicitly say `report_intent` and `SELECT 1` go in the same tool-call batch, removing the "after setting" sequencing ambiguity.

## 0.10.6 — MFA anchor + three-arm benchmark protocol

- **MFA now leads the file with a hard runtime anchor**: Moved MANDATORY FIRST ACTIONS above identity prose so the critical path appears first in model attention order. Added explicit rule that after setting `report_intent`, the first runtime tool call must be `SELECT 1` on the `session` database.
- **MFA step-3 decision path compressed**: Flattened continuation vs new-task logic into one ordered branch: run lookup, apply immediate carve-outs, then evaluate two continuation checks. Keeps behavior the same while reducing nested prose in the highest-risk startup step.
- **Three-arm eval support added for Odin benchmarks**: Added `docs/benchmarks/three-arm/README.md` and `docs/benchmarks/three-arm/compare.py` so benchmark runs can separate generic terseness effects from real spec improvements (Baseline vs Terse Control vs Candidate), with automatic delta tables from result markdown files.

## 0.10.5 — Unified MFA entry point

- **Continuation logic absorbed into MFA step 3**: Eliminated the standalone continuation decision procedure (~24 lines) that competed with the 5 MFA steps for model attention. The continuation check is now MFA step 3 — a single ledger query that decides continuation vs. new task. Steps 4–5 (task_id generation, loop-entry INSERT) run only for new tasks. Steps 1–2 (runtime gate, ledger creation) always run — they're idempotent. Every message now has one entry point, not a pre-MFA decision tree plus the MFA block.
- **Context recovery embedded**: The context recovery procedure (query completed steps after compaction) is now part of the continuation path in step 3, not a separate block. "Do not infer completion from conversation prose" survives as an inline rule.
- **Hard new-task carve-outs preserved**: First message, Step 10 PR feedback re-entry, and out-of-scope requests remain explicitly marked as always-new-task.

## 0.10.4 — Startup flow simplification

- **MFA wording made processable**: Replaced the literal "do not read further" instruction with a checklist-style rule that still preserves MFA ordering but no longer asks the model to pretend it cannot inspect later sections for referenced SQL or error text.
- **Continuation logic compacted**: Reworked new-task detection into a single continuation decision procedure covering immediate follow-ups, `task_id` recovery, proof-of-continuation checks, and explicit always-new-task cases. Removes the duplicated mnemonic layer, reduces task-identity circularity under compaction, and keeps ledger verification mandatory even for obvious follow-up replies.
- **Startup flow flattened**: Reframed Steps 0–2 as one continuous startup phase, clarified that startup status lines are beacons rather than pause points, and added explicit startup routing so ambiguity, pushback, Investigation, and the normal code-change path read as branches of one flow instead of separate modes.
- **Investigation path bounded**: Tightened the Investigation shortcut and plan-review exception so they stay findings-only work. If findings imply code changes, Odin now stops and starts a fresh code-change task instead of drifting back into the main loop.
- **Skill-contract clarification**: Clarified that companion-skill discovery is Survey-only optional enrichment and never gates operational skills. Step 5c/5e now explicitly ignore companion-skill logic, and `odin-review-prompts` now documents the full 6-phase render contract including reviewer-context rewrites, oversized-diff handling, and the final unresolved-placeholder verification step.

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
