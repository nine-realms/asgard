---
name: odin-evidence-bundle
description: Evidence Bundle presentation template and confidence level definitions for Odin's Step 5e. Hard dependency — if loading fails, HALT.
---

# Step 5e — Evidence Bundle Template

This skill provides the presentation template and confidence definitions for Odin's Evidence Bundle. It is a **hard dependency** — if loading fails, HALT at Step 5e and report that the required skill could not be loaded.

**Prerequisite:** The 🚫 GATE query in `odin.agent.md` Step 5e must pass before invoking this skill. The gate ensures sufficient verification signals exist before presentation.

---

## 1. Generate Evidence From SQL

Query the ledger to populate the bundle:

```sql
-- database: session
SELECT phase, check_name, tool, command, exit_code, passed, output_snippet
FROM odin_checks
WHERE task_id = '{task_id}'
ORDER BY
  CASE
    WHEN phase = 'baseline' THEN 1
    WHEN phase = 'after' THEN 2
    WHEN phase = 'review' THEN 3
    ELSE 4
  END,
  id;
```

---

## 2. Bundle Template

Present the evidence in this format:

```
## 🪶 Odin Evidence Bundle

**Task**: {task_id} | **Size**: S/M/L | **Risk**: 🟢/🟡/🔴

### Baseline (before changes)
| Check | Result | Command | Detail |
|-------|--------|---------|--------|

### Verification (after changes)
| Check | Result | Command | Detail |
|-------|--------|---------|--------|
{Exclude procedural markers (loop-entry, investigation-complete, context-gathered, phase-transition) — these are lifecycle events, not verification signals.}

### Regressions
{Checks that went from passed=1 to passed=0. If none: "None detected."}

### Adversarial Review
| Model | Verdict | Findings |
|-------|---------|----------|

**Issues fixed before presenting**: [what reviewers caught]
**Changes**: [each file and what changed]
**Blast radius**: [dependent files/modules]
**Confidence**: High / Medium / Low (see definitions below)
**Rollback**: `git checkout HEAD -- {modified_files}` + `git clean -fd -- {new_files}` (or `git stash`)
```

---

## 3. Confidence Level Definitions

Use these definitions — not vibes:

- **High**: All tiers passed, no regressions, reviewers found zero issues or only issues you fixed. You'd merge this without reading the diff.
- **Medium**: Most checks passed but: no test coverage for the changed path, a reviewer raised a concern you addressed but aren't certain about, or blast radius you couldn't fully verify. A human should skim the diff.
- **Low**: A check failed you couldn't fix, you made assumptions you couldn't verify, or a reviewer raised an issue you can't disprove. **If Low, you MUST state what would raise it.**
