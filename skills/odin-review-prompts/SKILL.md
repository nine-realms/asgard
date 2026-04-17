---
name: odin-review-prompts
description: Review prompt templates, file-type classification, model selection, and reviewer launch instructions for Odin's Step 5c adversarial review.
---

# Step 5c — Review Prompts & Reviewer Launch

This skill is a **hard dependency** for Odin's Step 5c adversarial review. It provides file-type classification, review prompt templates, model selection, and reviewer launch instructions.

**Expected check names** (must match the gate queries in `odin.agent.md` Step 5c):
- `review-mimir` (Small + Medium + Large)
- `review-tyr` (Medium + Large)
- `review-heimdall`, `review-thor`, `review-loki` (Large only)
- Timeout variants: `review-{name}-timeout`

---

## 1. File-Type Classification

Classify the staged files into three categories:
- **Specification files**: `.agent.md`, `.skill.md`, and files named `SKILL.md` — behavioral specification files that define agent/skill instructions
- **Documentation/config files**: `.md`, `.mdx`, `.txt`, `.yaml`, `.json`, `.xml`, other config files (excluding `.agent.md`, `.skill.md`, and `SKILL.md`)
- **Code files**: everything else

Then select the prompt:
- **All spec files** (no code, no other docs): use the **specification review prompt**
- **All documentation/config** (no spec files, no code): use the **documentation review prompt**
- **Code files present** (with or without spec/doc files): use the **code review prompt**, and if spec files are also in the diff, **append the spec review criteria** to the code review prompt
- **Mixed spec + doc** (no code): use the **specification review prompt** (spec criteria subsume doc criteria)

---

## 2. Review Prompt Templates

### Specification Review Prompt

Use when **all** changed files are specification files (`.agent.md`, `.skill.md`, `SKILL.md`):

```
agent_type: "code-review"
model: "gpt-5.3-codex"
prompt: "Review the following staged changes to behavioral specification files.
         Files changed: {list_of_files}.
         Use the provided staged diff as the source of truth. Do not re-run git to discover changes.
         <STAGED_DIFF>
         {staged_diff}
         </STAGED_DIFF>
         These are agent/skill specification files. Evaluate:
         - Cross-section logical consistency (do rules in one section contradict rules in another?)
         - Template placeholder validity (are template placeholders in code blocks defined or established by convention?)
         - Embedded code/SQL correctness (would the SQL, bash, or template blocks actually execute?)
         - Behavioral edge cases (what happens when the spec's assumptions don't hold?)
         - Gate/verification logic (are gates achievable? do they reference the right check names?)
         - Contradictions with other spec files in the repo
         Ignore: prose style, formatting preferences, section ordering.
         For each issue: what's wrong, why it matters, and the fix.
         If nothing wrong, say so."
```

### Documentation Review Prompt

Use when **all** changed files are documentation-only (`.md`, `.mdx`, `.txt`, `.yaml`, `.json`, `.xml`, config files — excluding `.agent.md`, `.skill.md`, and `SKILL.md`):

```
agent_type: "code-review"
model: "gpt-5.3-codex"
prompt: "Review the following staged changes.
         Files changed: {list_of_files}.
         Use the provided staged diff as the source of truth. Do not re-run git to discover changes.
         <STAGED_DIFF>
         {staged_diff}
         </STAGED_DIFF>
         This is a documentation/config change. Evaluate:
         - Accuracy of technical claims (do code examples match actual APIs?)
         - Missing or outdated information
         - Broken links or references to nonexistent files/symbols
         - Contradictions with other docs in the repo
         - Clarity and completeness for the target audience
         Ignore: prose style, formatting preferences.
         For each issue: what's wrong, why it matters, and the fix.
         If nothing wrong, say so."
```

### Code Review Prompt

Use when **code files are present** (with or without spec/doc files). Append spec criteria if `.agent.md`, `.skill.md`, or `SKILL.md` files are also in the diff:

```
agent_type: "code-review"
model: "gpt-5.3-codex"
prompt: "Review the following staged changes.
         Files changed: {list_of_files}.
         Use the provided staged diff as the source of truth. Do not re-run git to discover changes.
         <STAGED_DIFF>
         {staged_diff}
         </STAGED_DIFF>
         Find: bugs, security vulnerabilities, logic errors, race conditions,
         edge cases, missing error handling, and architectural violations.
         Ignore: style, formatting, naming preferences.
         For each issue: what the bug is, why it matters, and the fix.
         If nothing wrong, say so.
         {IF_SPEC_FILES_IN_DIFF}
         Additionally, for any .agent.md, .skill.md, or SKILL.md files in the diff, also evaluate:
         - Cross-section logical consistency (do rules contradict across sections?)
         - Template placeholder validity (are template placeholders defined or established?)
         - Embedded code/SQL correctness (would the blocks actually execute?)
         - Behavioral edge cases (what if the spec's assumptions don't hold?)
         {/IF_SPEC_FILES_IN_DIFF}"
```

### Conditional Inclusion Marker

The `{IF_SPEC_FILES_IN_DIFF}...{/IF_SPEC_FILES_IN_DIFF}` block is a **conditional inclusion marker** for Odin to expand at runtime: include the enclosed text only when `.agent.md`, `.skill.md`, or `SKILL.md` files appear in the staged diff's file list. When no spec files are present, omit the block entirely.

---

## 3. Prompt Render Order

This section governs **Step 5c only**. Operational skill loading for this step is direct — do not consult companion-skill or `<available_skills>` guidance here.

When materializing reviewer prompts, Odin expands in six phases:
1. **Resolve model variables**: replace `{tyr_model}`, `{mimir_model}`, and (Large) `{heimdall_model}`, `{thor_model}`, `{loki_model}` with concrete model strings using the model-resolution rules in Sections 4 and 5. For `{mimir_model}`, apply this precedence: instruction-file override from `.github/copilot-instructions.md` → table Primary → Fallback on model error. For all other variables, use the table Primary → Fallback on model error.
2. **Apply reviewer/task-size rewrites**: before placeholder verification, rewrite reviewer-specific prompt fragments that depend on task size. For Mimir, replace the default `review_context=panel, panel_reviewers={panel_list}` line with `review_context=standalone` for Small tasks (omit `panel_reviewers` entirely). For Medium/Large, keep the panel form and populate `{panel_list}` later.
3. **Evaluate conditionals**: expand `{IF_...}...{/IF_...}` blocks — include or remove the enclosed text based on whether spec files are in the diff.
4. **Apply the size-guard rewrite if needed**: when Step 5c's large-diff guard triggers, replace the normal "use the provided staged diff / do not re-run git" text plus the entire `<STAGED_DIFF> ... </STAGED_DIFF>` block in the selected review prompt with instructions telling reviewers that the inline diff was omitted for size and that they should inspect files individually using `git --no-pager diff --staged -- <path>` based on the provided file list.
5. **Substitute remaining placeholders**: replace `{list_of_files}`, `{repo_path}`, `{panel_list}`, etc. with captured values. If the size guard did **not** trigger, this step also substitutes `{staged_diff}` inside `<STAGED_DIFF>` tags — the placeholder is expanded, then the resulting diff content is treated as opaque. After substitution, any brace-like text in the expanded content (e.g., `{variable}` appearing inside the actual diff payload) is **not** re-expanded. Backtick-fenced inline code (e.g., `` `{example}` ``) in the template prose is also left as-is.
6. **Verify**: scan the final rendered prompt for any remaining `{...}` tokens outside the expanded diff payload. If unresolved placeholders remain, HALT instead of launching a malformed reviewer prompt.

---

## 4. Reviewer Templates

### Tyr (required — Medium + Large)

```
agent_type: "asgard:tyr"
model: "{tyr_model}"
name: "tyr"
description: "Convention enforcement review"
prompt: "{selected_review_prompt}"
```
> **Tyr** — the god of law and justice. Reviews against code quality conventions: method length, complexity, naming, nesting, duplication, error handling, async correctness, and test coverage.

INSERT verdict: `phase = 'review'`, `check_name = 'review-tyr'`.

### Mimir (required — Small + Medium + Large)

```
agent_type: "asgard:mimir"
model: "{mimir_model}"
name: "mimir"
description: "Heuristic pre-screening review"
prompt: "Pre-screen the following staged changes. Repo: {repo_path}. Files: {list_of_files}.
         review_context=panel, panel_reviewers={panel_list}
         Use the provided staged diff as the source of truth. Do not re-run git to discover changes.
         <STAGED_DIFF>
         {staged_diff}
         </STAGED_DIFF>"
```

Set review context based on task size:
- **Small**: use `review_context=standalone` (Mimir is the sole reviewer — omit `panel_reviewers`)
- **Medium**: `review_context=panel, panel_reviewers=tyr,mimir`
- **Large**: `review_context=panel, panel_reviewers=tyr,mimir,heimdall,thor,loki`

Set `{panel_list}` based on task size (for Medium/Large prompt substitution):
- **Medium**: `tyr,mimir`
- **Large**: `tyr,mimir,heimdall,thor,loki`

For Small tasks, the prompt's review context line becomes:
```
review_context=standalone
```
For Medium and Large, substitute `{panel_list}` into the template above. This rewrite happens during the render-order step above, before unresolved-placeholder verification.

> **Mimir** — guardian of the Well of Wisdom. Performs structured 3-pass review: walkthrough → file-by-file analysis → structured findings with review effort scoring.

INSERT verdict: `phase = 'review'`, `check_name = 'review-mimir'`.

### Tyr & Mimir Model Selection

Tyr and Mimir are custom agents with rich behavioral instructions — their diversity comes from agent specs, not model family. Unlike Heimdall/Thor/Loki (generic `code-review` agents where model IS the diversity), Tyr/Mimir use a simple primary/fallback table:

| Reviewer | Primary | Fallback | Rationale |
|----------|---------|----------|-----------|
| Tyr | `gpt-5.3-codex` | `gpt-5.4-mini` | Pattern matching (naming, nesting, duplication) — fast models handle this well |
| Mimir | `gpt-5.4` | `claude-sonnet-4.6` | Strong instruction-following for Mimir's structured 3-pass review; cross-family fallback ensures Mimir is available even during OpenAI API outages |

**Instruction-file override:** If the repo's `.github/copilot-instructions.md` specifies `mimir-model: {model}` (e.g., `mimir-model: claude-opus-4.6`), use that model instead of the table default. This lets teams opt into premium models per-project without changing the plugin.

**Materialization:** Before launching Tyr and Mimir, resolve `{tyr_model}` and `{mimir_model}` to concrete model strings. For Mimir: use the instruction-file override if present, otherwise the table Primary. For Tyr: use the table Primary. These are subject to the general materialization rule in Section 3.

**Fallback:** If the primary model is unavailable (task fails with a model error), retry with the Fallback model. Record the substitution as a ledger row: `phase = 'review'`, `check_name = 'review-{name}-model-fallback'`, `tool = '{name}'`, `passed = 1`, and `output_snippet` noting the original model and the substitute. This row is bookkeeping — not a review verdict.

---

## 5. Large Task — Additional Reviewers

**Large OR 🔴 files:** After launching Tyr + Mimir, launch Heimdall/Thor/Loki in parallel.

### Reviewer Model Selection

Maximize model diversity across the review panel. Check Odin's **exact model** from `<model_information>`, then select from the table. The Anthropic rows use the exact model ID (not just family) so Loki avoids self-review while still adding an Anthropic perspective to the generic lane:

| Odin's model | Heimdall | Thor | Loki |
|--------------|----------|------|------|
| `claude-opus-4.6` | `gpt-5.3-codex` | `gpt-5.4` | `claude-sonnet-4.6` |
| Other Anthropic (Claude) | `gpt-5.3-codex` | `gpt-5.4` | `claude-opus-4.6` |
| OpenAI (GPT) | `gpt-5.3-codex` | `claude-sonnet-4.6` | `claude-opus-4.6` |
| Google (Gemini) | `gpt-5.3-codex` | `claude-sonnet-4.6` | `gpt-5.4` |
| Unknown / other | `gpt-5.3-codex` | `gpt-5.4` | `claude-opus-4.6` |

**Why Anthropic gets two rows:** When Odin is `claude-opus-4.6`, Loki can't use the same model (self-review). `claude-sonnet-4.6` gives a current-generation Anthropic perspective different from Odin. Note: if Mimir falls back from `gpt-5.4` to `claude-sonnet-4.6` in this scenario, Mimir and Loki share the same model — acceptable in degraded mode. Record the overlap in Mimir's `review-mimir-model-fallback` ledger row (`forced_overlap_with=loki` in `output_snippet`). When Odin is any other Anthropic model, Loki uses `claude-opus-4.6` — the strongest available, different from both Odin and the H/T/L panel.

**Fallback**: If a selected model is unavailable (task fails with a model error), substitute the next model in the same family. Record the substitution as a ledger row: `phase = 'review'`, `check_name = 'review-{name}-model-fallback'`, `tool = '{name}'`, `passed = 1`, and `output_snippet` noting the original model, the substitute model, and any forced overlap. This row is bookkeeping — not a review verdict. No two of the three (Heimdall/Thor/Loki) should use the same model — if forced by availability, note the overlap in `output_snippet`.

**Google-family future-proofing**: When a supported Google-family model becomes available in the runtime, slot it into the Thor column for Anthropic/OpenAI rows — giving 3-family coverage. Until then, Thor uses the cross-family selection above.

### Model Materialization

Before launching Heimdall/Thor/Loki, look up Odin's model in the table above: first try an exact match on Odin's model ID; if no exact row exists, match by model family (Anthropic/OpenAI/Google); if neither matches, use the "Unknown / other" row. Resolve `{heimdall_model}`, `{thor_model}`, `{loki_model}` to concrete model strings from the matching row. These are subject to the general materialization rule — substitute them into the task templates below alongside the previously materialized `{list_of_files}` and, when the size guard did not trigger, `{staged_diff}`.

### Launch Templates

```
agent_type: "code-review", model: "{heimdall_model}", name: "heimdall", description: "Baseline code review",        prompt: "{selected_review_prompt}"
agent_type: "code-review", model: "{thor_model}",     name: "thor",     description: "Cross-family code review",     prompt: "{selected_review_prompt}"
agent_type: "code-review", model: "{loki_model}",     name: "loki",     description: "Adversarial trickster review", prompt: "{selected_review_prompt}"
```
> **Heimdall** (watcher), **Thor** (thunder), **Loki** (trickster) — Odin's children stand guard. Loki finds the subtle, devious problems everyone else misses.

INSERT each verdict: `phase = 'review'`, `check_name = 'review-{name}'` (e.g., `review-heimdall`, `review-thor`, `review-loki`).
