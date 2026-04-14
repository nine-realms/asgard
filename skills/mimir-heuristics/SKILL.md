---
name: mimir-heuristics
description: Cross-cutting analysis heuristics for Mimir's Pass 2 review. Loaded before running CCA checks — provides the full heuristic library plus specification-aware and dynamic analysis.
---

# Mimir — Cross-Cutting Analysis Heuristics

This skill provides the CCA heuristic library for Mimir's Pass 2 review phase. It is a **companion skill** — Mimir loads it before running cross-cutting analysis to get the full set of heuristics.

**Pruning rule**: Remove any heuristic that never triggers across 10+ reviewed PRs.

---

## Heuristics

#### CCA-001 · Data Flow Consistency

When a method filters, transforms, or scopes a dataset, verify that all downstream consumers apply **compatible** filtering. A common pattern: method A builds a filtered list (e.g., "active students only"), but method B consumes the unfiltered source and produces mismatched counts or populations.

**Look for:**
- A query or filter defined in one method, consumed by a different method that re-queries without the same filter
- Aggregation (count, sum, average) on a collection that has a broader or narrower scope than the display context
- Drilldown or detail views that don't apply the same criteria as the summary view


#### CCA-002 · Semantic Parity

When multiple code paths classify, categorize, or map the same concept (e.g., severity levels, status codes, membership tiers), verify they use **identical mappings**. Divergence means the same input produces different labels in different parts of the UI or logic.

**Look for:**
- Two or more switch/case or if/else chains that map the same enum or string to display values
- Mapping objects or dictionaries that translate the same source field but define different keys or labels
- Severity, priority, or status hierarchies defined in more than one place


#### CCA-003 · Stateful Control Accessibility

When a control has persistent state (toggled, expanded, selected, current) that is reflected visually, that same state must be exposed to screen readers via ARIA semantics or native HTML elements. This becomes cross-cutting when the same state drives behavior across multiple components or views — e.g., a filter toggle in a toolbar that changes content in a sibling panel.

**Look for:**
- Toggle controls (buttons, filters) with persistent on/off state missing `aria-pressed`
- Expandable sections where the trigger and content are in different components, missing `aria-expanded`
- Selection state (tabs, list filters) shared across views missing `aria-selected` or `aria-current`
- State communicated visually (bold, color, icon swap) across related components without ARIA parity


#### CCA-004 · Null Propagation

When a field can be null/undefined at its source (API response, database, user input), trace it through every operation: grouping, filtering, sorting, displaying. Each step must handle the null case consistently — either normalize early (convert null to a default) or guard at every use site.

**Look for:**
- A nullable field used as a grouping key without null-to-default normalization
- Sorting or comparison that treats null differently than empty/zero
- Display code that renders null as "null", "undefined", or blank instead of a meaningful default
- Filtering logic where null values silently drop out of results


#### CCA-005 · Cancellation Propagation

When async methods wrap work in retry loops, timeout helpers, or middleware pipelines, verify that the cancellation signal (token, abort controller, context) is threaded through every layer — including delay/backoff calls. A broad exception handler that catches cancellation without rethrowing will swallow the signal and continue retrying work the caller has already abandoned.

**Look for:**
- Retry helpers that accept no cancellation signal (e.g., cancellation tokens, abort signals, context objects)
- Delay/backoff calls inside retry loops that cannot be interrupted by caller cancellation
- Broad exception handlers (catch-all) that do not rethrow or filter cancellation exceptions
- Async wrapper methods that drop the cancellation signal before passing to inner calls
- Custom or library retry policies where the onRetry/backoff path ignores cancellation state


#### CCA-006 · Nested Recovery Safety

When catch-block recovery logic can itself fail (e.g., a fallback API call, database lookup, or retry), the failure path must be handled explicitly — either guard with an inner try/catch and preserve original context, or intentionally propagate with clear logging/exception wrapping. Do not let fallback failure accidentally mask the original error.

**Look for:**
- Exception handlers that call external services (HTTP, DB, cache) without guarding for failure
- Recovery paths in catch blocks where the recovery code is longer than the error-logging code — a signal it may throw
- Fallback lookups inside catch blocks that assume the fallback always succeeds
- Catch blocks where a recovery failure would surface as an unrelated error, masking the original cause


#### CCA-007 · Cache Scope Drift

When in-memory or distributed caches store per-tenant/per-environment data, verify that cache keys include the scoping dimension (tenant ID, environment ID, org ID). Missing scope causes cross-tenant data leakage or stale reads; missing eviction causes unbounded memory growth as new tenants are encountered.

**Look for:**
- Cache get-or-create calls where the key does not include a tenant/environment/org identifier
- Static or dictionary-based caches populated per-request without size limits or expiration
- Cache keys built from only the entity type or operation name, missing the tenancy dimension
- Multi-tenant services where the cache is registered as a singleton but stores tenant-specific data
- Cache entries for tenant-scoped data without sliding or absolute expiration


#### CCA-008 · Test Assertion Precision

When test assertions use broad predicates (substring contains, collection-wide all/any, "never called" with loose matchers), verify that they cannot pass on wrong data. An all-match check passes on an empty collection; a contains check matches unintended messages; a "never called" assertion with a stale method signature never fires after a breaking API change.

**Look for:**
- "Never called" mock verifications with loose argument matchers that don't match the current method signature
- All/any assertions on collections without a count/length guard (empty collections pass vacuously)
- Substring-contains assertions in log verification that match prefixes of unrelated messages
- Negative assertions that would still pass if the feature were completely broken
- Mock verification calls using an overload with fewer parameters than the actual method after a signature change


#### CCA-009 · Idempotency Safety

When a state-check-then-act sequence guards a side-effecting operation (start processing, create resource, send notification), verify that the check and the action are atomic or protected by a concurrency control. If two callers pass the check concurrently, both will execute the side effect — producing duplicates, race conditions, or corrupted state.

**Look for:**
- State-check (if status == X) followed by a side-effecting call (start, create, send) without a lock, transaction, or compare-and-swap
- Async methods that read state, await something, then act on the stale state without re-checking
- Upsert-or-create patterns where the existence check and the insert are separate calls
- Orchestrator or workflow triggers that can fire twice if the triggering endpoint is called concurrently
- Boolean flags (isProcessing, hasStarted) set after the operation instead of before/atomically


#### CCA-010 · Negative Cache TTL

When a cache-aside lookup misses (the external service returns no result or a subset of requested IDs), verify that the miss is recorded so subsequent calls don't re-fetch the same missing keys. Without negative caching, every request re-queries the source for IDs that will never resolve — creating repeated latency spikes and unnecessary load on downstream services.

**Look for:**
- Cache get-or-fetch patterns that only cache successful results and silently skip misses
- Batch lookups that filter to 'uncached IDs', fetch, then don't record which IDs the source couldn't resolve
- Retry or re-fetch logic triggered by cache misses without distinguishing 'not yet cached' from 'known absent'
- Cache key patterns where null/empty results are discarded instead of stored with a short TTL


#### CCA-011 · Shared Mutable Cache References

When an in-memory cache returns a reference type (dictionary, list, object), verify that callers do not mutate the returned reference. The cache holds the same instance for all concurrent readers — any mutation (Add, Remove, Clear, property set) affects every thread reading the same cache entry, causing race conditions, corrupted state, or data leakage between requests.

**Look for:**
- Cache get-or-create returning a mutable collection (Dictionary, List, HashSet) that callers later modify
- Code that adds entries to or removes entries from a dictionary obtained from cache
- Cached objects whose properties are set after retrieval without creating a defensive copy
- IMemoryCache or ConcurrentDictionary patterns returning mutable reference types without wrapping in a read-only facade


#### CCA-012 · Input Validation Layering

When a request flows through controller → service → data adapter, verify that invalid input (null, empty, malformed, ambiguous identifiers) is rejected at the boundary layer closest to the caller — not deep in the data access layer where errors are unclear and expensive. Missing boundary validation lets bad requests consume resources and produce misleading error messages.

**Look for:**
- Controller actions that null-check the request body but not individual required fields or identifier formats
- Service methods that accept both an ID and a natural key and silently prefer one when both are present
- Data adapter methods that build LINQ/SQL predicates from parameters without null or range guards
- Endpoints where empty-string or zero-value identifiers pass validation and hit the database
- Catch-all exception handlers in controllers that mask data-layer validation failures as 500 errors


#### CCA-013 · Schema Evolution Gaps

When a new field is added to a persisted document or database schema (document stores, SQL, blob), verify that existing records without the field are handled correctly. If code reads the new field from old records, it will get null/default — which may silently produce wrong results in calculations, comparisons, or display. New fields need either backfill logic, null-safe reading with explicit defaults, or migration handling.

**Look for:**
- New properties added to a document model or entity with no default value and no null-handling at read sites
- Conditional logic that checks a new field without accounting for the field being absent on pre-existing documents
- Timestamp or tracking fields (FirstSeen, CreatedAt, LastModified) added to existing entities without backfill for historical records
- Comparison or sorting logic on a new field where null/default would sort incorrectly or produce wrong equality results
- New enum or status fields where the zero/default value has semantic meaning different from 'not yet populated'


#### CCA-014 · Temporal Coupling

When two or more operations must execute in a specific order to produce correct results, verify that the ordering is enforced by the code — not just by the current call sequence. If caller A happens to call `Initialize()` before `Process()` today, a future caller (or a refactor) may not. Temporal coupling is invisible until it breaks.

**Look for:**
- Methods that assume a prior method has already been called (e.g., reading a field set by `Initialize()` without null/ready checks)
- Setup-then-use patterns where the setup and use are in different methods or classes with no guard
- Event handlers that depend on registration order
- Async pipelines where step N reads state written by step N-1 without verifying it exists


#### CCA-015 · Partial Update Hazard

When multiple fields, records, or system states must be updated together to maintain consistency, verify that all related updates happen atomically or that partial failure is handled. Updating 2 of 3 related fields leaves the system in an inconsistent state that may not surface until much later.

**Look for:**
- Multiple related field assignments (e.g., `status`, `statusChangedAt`, `statusChangedBy`) where some but not all are set
- Multi-table or multi-document updates without a transaction or compensating action
- Cache invalidation that covers some but not all affected keys
- UI state updates where visual state and data state can diverge if one update fails


#### CCA-016 · Error Information Leakage

When error handling constructs user-facing responses (HTTP error bodies, UI error messages, log entries sent to external monitoring), verify that internal details are not exposed. Stack traces, connection strings, SQL queries, internal file paths, and schema details give attackers a map of the system and confuse end users.

**Look for:**
- Exception messages or stack traces passed directly into HTTP response bodies or UI error displays
- Catch blocks that include `ex.Message` or `ex.ToString()` in user-facing output without sanitization
- Error responses that include database column names, internal service URLs, or file system paths
- Log statements at INFO or DEBUG level that include credentials, tokens, or PII and ship to external log aggregators


#### CCA-017 · Pagination Boundary

When code implements paginated data access (skip/take, cursor-based, page number), verify correct behavior at the boundaries: first page, last page, empty results, single-item pages, and total count consistency. Off-by-one errors in pagination silently duplicate or skip records.

**Look for:**
- Skip/take calculations that don't account for zero-indexed vs one-indexed page numbers
- Total count queries that run separately from the data query without consistent filtering
- Empty-page handling that returns an error instead of an empty collection
- Cursor-based pagination where the cursor value can be null, deleted, or duplicated
- Page size changes between requests that cause records to be skipped or shown twice


#### CCA-018 · Configuration Symmetry

When a configuration value is added or changed in one environment file, verify that all sibling environment configs are updated consistently. A setting that exists in `appsettings.Development.json` but not `appsettings.Production.json` — or in `.env.local` but not `.env.production` — means the app works in dev and crashes (or silently misbehaves) in production. This is a cross-boundary deployment failure, not a style issue.

**Look for:**
- New keys added to one environment config file but absent from sibling environment files
- Default values that are safe in development but dangerous in production (e.g., `debug: true`, `rate_limit: 0`, `timeout: 999999`)
- Feature flags enabled in dev/staging configs but missing from production (will default to off or throw)
- Connection strings or URLs that reference environment-specific hosts added to only one config


#### CCA-019 · Logging Level Mismatch

When log statements are added or modified, verify that the severity level matches the actual impact. ERROR-level logging for expected or recoverable conditions floods alerting systems with noise, causing on-call engineers to ignore real alerts. DEBUG or INFO for actual failures means production incidents go undetected in monitoring dashboards. This is a cross-boundary observability failure — the code works, but the operations team can't see when it doesn't.

**Look for:**
- `LogError` / `logger.error` / `console.error` for conditions that are expected in normal operation (e.g., cache miss, optional feature unavailable, user input validation failure)
- `LogDebug` / `logger.debug` for conditions that indicate data loss, service degradation, or security events
- Catch blocks that log at INFO level and swallow — the caller succeeds but the failure is invisible to monitoring
- Structured log events missing correlation IDs or context fields that monitoring dashboards need to group related events


#### CCA-020 · Feature Flag Residue

When code contains feature flags or toggle checks, verify that flags which have been fully rolled out (always-on) or abandoned (always-off) have their conditional branches cleaned up. Dead code behind stale flags obscures the actual execution path, makes reasoning about behavior harder, and can mask bugs when someone later flips a "dead" flag that still has wired-up side effects.

**Look for:**
- Boolean flags or config values checked in conditionals where one branch is never reachable in any current environment
- Feature flag checks that wrap the only code path (the "off" branch is empty or throws `NotImplementedException`)
- Multiple layers of flag checks for the same feature across different files, where some check the flag and others don't
- Flags referenced in code but absent from all current config files (flag was removed from config but not from code)


#### CCA-021 · Template Placeholder Consistency

When behavioral specification files (`.agent.md`, `.skill.md`, `SKILL.md`) contain code blocks with `{placeholder}` tokens, verify that each placeholder is either defined in the same section, established by a prior step in the documented flow, or is a well-known convention (e.g., `{task_id}`, `{staged_diff}`). Orphaned placeholders in embedded code blocks mean the runtime will substitute nothing or the LLM will hallucinate a value — both produce silent failures that are hard to trace.

**Look for:**
- `{placeholder}` tokens in SQL, bash, or template code blocks that are not defined or referenced elsewhere in the same specification file
- Placeholders that changed name in one section but not in the code blocks that reference them (e.g., `{repo_name}` vs `{repo_path}`)
- Code blocks copied between sections where the placeholder context differs but the tokens weren't updated
- Placeholders in example/illustration blocks are **excluded** — only flag placeholders in blocks that are meant to be executed or expanded at runtime
- Lookup tables or selection rules that define how a placeholder value should be computed, but no explicit instruction to perform the lookup and substitute the result before the placeholder is consumed (table-to-template gap)


#### CCA-022 · Cross-Section Rule Consistency

When specification files define rules, gates, or conditions across multiple sections, verify that they don't contradict each other. Specification files are long (400–800 lines) and internally cross-referenced — a change to one section's rule can silently break assumptions in another section's gate or flow. The result is an agent that non-deterministically follows one rule or the other depending on which section it reads first.

**Look for:**
- A gate condition in one section that references a check name or phase not produced by any earlier step
- Contradictory directives (e.g., "always run X" in one section vs "skip X for Small tasks" in another)
- Step numbering or ordering references that don't match the actual step sequence
- Conditions that are achievable only if an optional step ran (but that step can be skipped)
- Diff text that references another section's behavior with an assumed condition (e.g., "if X was skipped") that contradicts the referenced section's actual definition (e.g., "X always runs") — cross-reference the assumed condition against the source section


#### CCA-023 · Embedded Code Validity

When specification files contain embedded SQL, bash, template, or configuration blocks, verify that the blocks would actually parse and execute in their target runtime. LLMs generating specification files often produce plausible-looking but syntactically broken embedded code — missing quotes, wrong column names, invalid SQL keywords, or bash commands with incorrect flags. These blocks are executed at runtime by the agent or by the LLM expanding them, so a syntax error becomes a runtime failure.

**Look for:**
- SQL blocks with column names that don't match the `CREATE TABLE` schema defined elsewhere in the same file
- Bash commands using flags that don't exist for that tool (e.g., `test -s` vs `test -f` confusion)
- Template blocks mixing markdown fence syntax with XML tag delimiters in ways that break parsing
- JSON/YAML blocks with trailing commas, missing brackets, or invalid escape sequences


#### CCA-024 · Resource Cleanup in Error Paths

When resources (file handles, database connections, locks, transactions, network sockets) are acquired before an operation that can fail, verify they are released in **all** exit paths — not just the happy path. A resource acquired in a try block but only closed in the success branch leaks on every error. In high-throughput systems, leaked resources accumulate until the process runs out of handles, connections, or memory.

**Look for:**
- Catch blocks that return or rethrow without closing resources acquired earlier in the same method
- Error paths that skip cleanup steps present in the success path (e.g., transaction rollback, lock release, temp file deletion)
- Finally/defer/using blocks that don't cover all acquired resources — especially when a second resource is acquired after the first's scope opens
- Async error paths where `await` failures skip subsequent cleanup awaits
- Early returns inside try blocks that bypass finally-equivalent cleanup (languages where finally isn't idiomatic)


#### CCA-025 · Event Handler Race Conditions

When event handlers or callbacks modify shared state (class fields, global variables, store/context state), verify they guard against concurrent or reentrant execution. Event handlers often appear sequential in the source but fire concurrently at runtime — from user interactions, WebSocket messages, timer ticks, or framework lifecycle hooks. Two handlers reading the same state, modifying it independently, and writing back can silently corrupt it.

**Look for:**
- Async event handlers that read-modify-write shared state without synchronization (locks, atomic operations, or queue serialization)
- Multiple event handlers that independently update the same state object without coordination
- Event handlers that assume sequential execution but can fire concurrently (e.g., `onMessage` handlers for WebSocket/SSE, React `useEffect` cleanup races)
- Timer or interval callbacks that mutate state also written by user-initiated event handlers
- State management patterns (Redux, MobX, Vuex) where actions triggered by events don't account for in-flight async actions modifying the same slice


---

## Specification-Aware Review

When the diff contains `.agent.md`, `.skill.md`, or `SKILL.md` files, activate specification-aware analysis in addition to standard code review passes. These files are behavioral specifications — their "bugs" are logical contradictions, orphaned references, and impossible gates rather than null pointer exceptions.

**Activation:** Automatic when any file in the diff matches `*.agent.md`, `*.skill.md`, or is named `SKILL.md`. This mode is **additive** — standard code review passes still run for any code files in the same diff.

**Additional analysis for spec files:**
1. **Section dependency graph**: Trace which sections reference which other sections. Flag any reference to a section, step, or gate that doesn't exist or was renamed.
2. **Flow completeness**: Walk the documented flow (e.g., "The Odin Loop") end-to-end. Can each gate be satisfied by the steps that precede it? Are there dead-end paths?
3. **Template expansion safety**: For every code block meant to be expanded at runtime, verify all `{placeholders}` resolve and the expanded result would be valid in its target language.

> **Note**: CCA-021, CCA-022, and CCA-023 are the heuristic counterparts to this section. Specification-Aware Review provides the structural analysis (dependency graph, flow walk, expansion safety); the CCA heuristics provide the pattern-matching checks.


---

## Dynamic Analysis

The heuristics above are a curated checklist — they cannot cover every cross-cutting pattern. After running them, apply the same depth of analysis to patterns they don't cover:

- What invariants span file boundaries in this diff? If file A assumes file B behaves a certain way, does file B still honor that assumption after these changes?
- What happens if these changes execute concurrently, out of order, or partially (crash mid-operation)?
- Are there implicit contracts (naming conventions, expected directory structures, registration order) that these changes could violate?
- What would a senior engineer ask about during a live review that isn't covered by the static heuristics?

Report any findings from dynamic analysis using the same structured format and severity levels as static heuristic findings.
