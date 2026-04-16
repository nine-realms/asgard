---
name: odin-recall
description: Session history query templates and filtering rules for Odin's Step 1d Recall phase. Advisory skill — if loading fails, proceed silently.
---

# Step 1d — Recall Query Templates

This skill provides SQL query templates for querying `session_store` during Odin's Recall phase. It is **advisory** — if loading fails, Step 1d should note the failure silently and proceed. Do not HALT.

All queries run against `session_store` (read-only). Never write to `session_store`.

---

## 0. Availability Guard

Before running any query below, verify that `session_store` has the required tables. Run this check once per session — if it fails, skip all Recall queries silently and proceed to the next step.

```sql
-- database: session_store
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'session_files', 'search_index') ORDER BY name;
```

**Expected result**: 3 rows (all table names present). If fewer than 3 rows are returned, `session_store` is not fully populated in this runtime — skip Recall silently. Do not log errors or warn the user; this is a known runtime limitation in some environments.

---

## 1. Query Templates

### File-level recall (when target files are known after Step 1b)

```sql
-- database: session_store
SELECT s.id, s.summary, s.branch, sf.file_path, s.created_at
FROM session_files sf JOIN sessions s ON sf.session_id = s.id
WHERE sf.file_path LIKE '%{filename}%' AND sf.tool_name = 'edit'
ORDER BY s.created_at DESC LIMIT 5;
```

### Branch/area-level fallback (when target files are NOT yet known)

```sql
-- database: session_store
SELECT s.id, s.summary, s.branch, s.created_at
FROM sessions s WHERE s.cwd LIKE '%{repo_path}%'
ORDER BY s.created_at DESC LIMIT 5;
```

### Past problems (regression/failure detection)

```sql
-- database: session_store
SELECT content, session_id, source_type FROM search_index
WHERE search_index MATCH 'regression OR broke OR failed OR reverted OR bug'
AND session_id IN (
    SELECT s.id FROM session_files sf JOIN sessions s ON sf.session_id = s.id
    WHERE sf.file_path LIKE '%{filename}%' AND sf.tool_name = 'edit'
    ORDER BY s.created_at DESC LIMIT 5
) LIMIT 10;
```

### Past plans and reviewer findings

```sql
-- database: session_store
SELECT content, session_id, source_type FROM search_index
WHERE search_index MATCH '{filename}'
AND source_type IN ('checkpoint_overview', 'workspace_artifact')
LIMIT 5;
```

```sql
-- database: session_store
SELECT content, session_id, source_type FROM search_index
WHERE search_index MATCH 'review OR finding OR tyr OR mimir'
AND session_id IN (
    SELECT s.id FROM session_files sf JOIN sessions s ON sf.session_id = s.id
    WHERE sf.file_path LIKE '%{filename}%' LIMIT 5
) LIMIT 5;
```

---

## 2. Filtering Rule

Only surface findings that meet at least one criterion:
- **Repeated**: appears in 2+ sessions
- **Recent**: within the last 7 days
- **Direct file overlap**: touches the same files as the current task

Discard stale or tangential context to avoid biasing the plan with folklore.

---

## 3. What To Do With Recall

- If a past session touched these files and had failures → mention it in your plan: "⚡ **History**: Session {id} modified this file and encountered {issue}. Accounting for that."
- If a past reviewer flagged a repeated concern in this area → note it as a watch item during implementation.
- If a past session established a pattern → follow it.
- If nothing relevant → move on silently.
