---
name: odin-review-prompts
description: Review prompt templates, file-type classification, model selection, and reviewer launch instructions for Odin's Step 5c adversarial review.
---

# Step 5c — Review Prompts & Reviewer Launch

This skill is a **hard dependency** for Odin's Step 5c adversarial review. It provides file-type classification, review prompt templates, model selection, and reviewer launch instructions.

**Expected check names** (must match the gate queries in `odin.agent.md` Step 5c):
- `review-tyr`, `review-mimir` (Medium + Large)
- `review-heimdall`, `review-thor`, `review-loki` (Large only)
- Timeout variants: `review-{name}-timeout`

---

## 1. File-Type Classification

Classify the staged files into three categories:
- **Specification files**: `.agent.md`, `.skill.md` — behavioral specification files that define agent/skill instructions
- **Documentation/config files**: `.md`, `.mdx`, `.txt`, `.yaml`, `.json`, `.xml`, other config files (excluding `.agent.md` and `.skill.md`)
- **Code files**: everything else

Then select the prompt:
- **All spec files** (no code, no other docs): use the **specification review prompt**
- **All documentation/config** (no spec files, no code): use the **documentation review prompt**
- **Code files present** (with or without spec/doc files): use the **code review prompt**, and if spec files are also in the diff, **append the spec review criteria** to the code review prompt
- **Mixed spec + doc** (no code): use the **specification review prompt** (spec criteria subsume doc criteria)

---

## 2. Review Prompt Templates

### Specification Review Prompt

Use when **all** changed files are specification files (`.agent.md`, `.skill.md`):

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

Use when **all** changed files are documentation-only (`.md`, `.mdx`, `.txt`, `.yaml`, `.json`, `.xml`, config files — excluding `.agent.md` and `.skill.md`):

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

Use when **code files are present** (with or without spec/doc files). Append spec criteria if `.agent.md` or `.skill.md` files are also in the diff:

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
         Additionally, for any .agent.md or .skill.md files in the diff, also evaluate:
         - Cross-section logical consistency (do rules contradict across sections?)
         - Template placeholder validity (are template placeholders defined or established?)
         - Embedded code/SQL correctness (would the blocks actually execute?)
         - Behavioral edge cases (what if the spec's assumptions don't hold?)
         {/IF_SPEC_FILES_IN_DIFF}"
```

### Conditional Inclusion Marker

The `{IF_SPEC_FILES_IN_DIFF}...{/IF_SPEC_FILES_IN_DIFF}` block is a **conditional inclusion marker** for Odin to expand at runtime: include the enclosed text only when `.agent.md` or `.skill.md` files appear in the staged diff's file list. When no spec files are present, omit the block entirely.

---

## 3. Prompt Render Order

When materializing reviewer prompts, Odin expands in two phases:
1. **Conditionals first**: evaluate `{IF_...}...{/IF_...}` blocks — include or remove the enclosed text.
2. **Variable substitution**: replace `{list_of_files}`, `{staged_diff}`, `{repo_path}`, `{heimdall_model}`, etc. with captured values. This includes `{staged_diff}` inside `<STAGED_DIFF>` tags — the placeholder is expanded, then the resulting diff content is treated as opaque. After substitution, any brace-like text in the expanded content (e.g., `{variable}` appearing inside the actual diff payload) is **not** re-expanded. Backtick-fenced inline code (e.g., `` `{example}` ``) in the template prose is also left as-is.

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

### Mimir (required — Medium + Large)

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

Set `{panel_list}` based on task size:
- **Medium**: `tyr,mimir`
- **Large**: `tyr,mimir,heimdall,thor,loki`

> **Mimir** — guardian of the Well of Wisdom. Performs structured 3-pass review: walkthrough → file-by-file analysis → structured findings with review effort scoring.

INSERT verdict: `phase = 'review'`, `check_name = 'review-mimir'`.

### Tyr & Mimir Model Selection

Tyr and Mimir are custom agents with rich behavioral instructions — their diversity comes from agent specs, not model family. Unlike Heimdall/Thor/Loki (generic `code-review` agents where model IS the diversity), Tyr/Mimir use a simple primary/fallback table:

| Reviewer | Primary | Fallback | Rationale |
|----------|---------|----------|-----------|
| Tyr | `gpt-5.3-codex` | `gpt-5.4-mini` | Pattern matching (naming, nesting, duplication) — fast models handle this well |
| Mimir | `claude-sonnet-4.6` | `gpt-5.4` | Multi-pass synthesis (walkthrough → file-by-file → findings) benefits from stronger reasoning; gives Anthropic/OpenAI cross-family diversity on every Medium task |

**Materialization:** Before launching Tyr and Mimir, resolve `{tyr_model}` and `{mimir_model}` to concrete model strings from the Primary column. These are subject to the general materialization rule in Section 3.

**Fallback:** If the primary model is unavailable (task fails with a model error), retry with the Fallback model. Record the substitution as a ledger row: `phase = 'review'`, `check_name = 'review-{name}-model-fallback'`, `tool = '{name}'`, `passed = 1`, and `output_snippet` noting the original model and the substitute. This row is bookkeeping — not a review verdict.

---

## 5. Large Task — Additional Reviewers

**Large OR 🔴 files:** After launching Tyr + Mimir, launch Heimdall/Thor/Loki in parallel.

### Reviewer Model Selection

Maximize model diversity across the review panel. Check Odin's own model family from `<model_information>`, then select from the table:

| Odin's model family | Heimdall | Thor | Loki |
|---------------------|----------|------|------|
| Anthropic (Claude) | `gpt-5.3-codex` | `gpt-5.4` | `gpt-5.2-codex` |
| OpenAI (GPT) | `gpt-5.3-codex` | `claude-sonnet-4.6` | `claude-opus-4.6` |
| Google (Gemini) | `gpt-5.3-codex` | `claude-sonnet-4.6` | `gpt-5.4` |
| Unknown / other | `gpt-5.3-codex` | `gpt-5.4` | `claude-opus-4.6` |

**Fallback**: If a selected model is unavailable (task fails with a model error), substitute the next model in the same family. Record the substitution as a ledger row: `phase = 'review'`, `check_name = 'review-{name}-model-fallback'`, `tool = '{name}'`, `passed = 1`, and `output_snippet` noting the original model, the substitute model, and any forced overlap. This row is bookkeeping — not a review verdict. No two of the three (Heimdall/Thor/Loki) should use the same model — if forced by availability, note the overlap in `output_snippet`.

**Google-family future-proofing**: When a supported Google-family model becomes available in the runtime, slot it into the Thor column for Anthropic/OpenAI rows — giving 3-family coverage. Until then, Thor uses the cross-family selection above.

### Model Materialization

Before launching Heimdall/Thor/Loki, look up Odin's model family in the table above and resolve `{heimdall_model}`, `{thor_model}`, `{loki_model}` to concrete model strings from the matching row. These are subject to the general materialization rule — substitute them into the task templates below alongside the previously materialized `{list_of_files}` and `{staged_diff}`.

### Launch Templates

```
agent_type: "code-review", model: "{heimdall_model}", name: "heimdall", description: "Baseline code review",        prompt: "{selected_review_prompt}"
agent_type: "code-review", model: "{thor_model}",     name: "thor",     description: "Cross-family code review",     prompt: "{selected_review_prompt}"
agent_type: "code-review", model: "{loki_model}",     name: "loki",     description: "Adversarial trickster review", prompt: "{selected_review_prompt}"
```
> **Heimdall** (watcher), **Thor** (thunder), **Loki** (trickster) — Odin's children stand guard. Loki finds the subtle, devious problems everyone else misses.

INSERT each verdict: `phase = 'review'`, `check_name = 'review-{name}'` (e.g., `review-heimdall`, `review-thor`, `review-loki`).
