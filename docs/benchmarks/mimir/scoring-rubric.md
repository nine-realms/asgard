# Mimir Scoring Rubric

Each model response is scored on 5 dimensions. Score 1-10 per dimension. Total possible: 50.

## Dimensions

### 1. Review Process Accuracy (1-10)

Did the model correctly execute Mimir's 3-pass review sequence with all required sub-steps?

| Score | Criteria |
|-------|----------|
| 9-10 | Complete sequence: mode detection → input acquisition → auto-skip → Pass 1 walkthrough (risk, effort, depth) → Pass 2 file-by-file (path-aware) → omission analysis → cross-boundary test gap → CCA skill load → heuristic execution → dynamic analysis → Pass 3 findings with panel filter → verdict. Named ecosystem-specific checks appropriate to the scenario's language/framework (e.g., .NET async/await, IDisposable for C# diffs). |
| 7-8 | Correct major passes in order; minor sub-steps missing (e.g., auto-skip, dynamic analysis, or ecosystem detection). |
| 5-6 | Most passes present but significant gaps — missed omission analysis, cross-boundary test gap, or security checks. |
| 3-4 | Partial sequence; skipped Pass 1 or merged passes incorrectly. |
| 1-2 | Fundamentally wrong — no structured review process, or started findings before analysis. |

### 2. Lane & Mode Awareness (1-10)

Did the model correctly identify panel vs standalone behavior, lane boundaries with Tyr, and scope adjustment for Large tasks?

| Score | Criteria |
|-------|----------|
| 9-10 | Correct panel mode detection. Explicit Tyr lane deference (conventions, error handling patterns, async correctness, test coverage). Correct Large-task scope narrowing. Accurate panel confidence filter (cross-cutting at all levels, surface at High only). Identified Medium-task coverage gap or nuances. |
| 7-8 | Correct mode detection and main lane boundaries; missed 1-2 nuances (e.g., Tyr's full lane scope, Medium-task gap). |
| 5-6 | Panel mode detected but lane boundaries vague or incorrect. |
| 3-4 | Confused panel and standalone behavior. |
| 1-2 | No awareness of panel mode or lane deference. |

### 3. CCA Integration (1-10)

Did the model correctly describe companion skill loading, failure handling, and heuristic selection?

| Score | Criteria |
|-------|----------|
| 9-10 | Correct load timing (after Pass 2, before Pass 3). Correct failure mode (no HALT, first-principles fallback). Named 6+ specific CCA heuristic IDs with justified fire/no-fire reasoning. Mentioned dynamic analysis as post-heuristic step. Noted spec-aware review if applicable. |
| 7-8 | Correct timing and failure mode. Named 4-5 heuristic IDs with reasoning. |
| 5-6 | Load timing approximately correct. Named some heuristics but reasoning weak or generic. |
| 3-4 | Vague understanding of skill loading. Few or no specific heuristic IDs. |
| 1-2 | No understanding of CCA integration or companion skill architecture. |

### 4. Signal Calibration (1-10)

Did the model correctly calibrate effort scoring, risk assessment, and finding confidence?

| Score | Criteria |
|-------|----------|
| 9-10 | Effort score justified against the rubric (auth → level 4-5). Risk correctly tied to change TYPE (auth/security), not just path. Exploration budget scaled to risk. Concrete 🔴/🟡 examples with traceable evidence. Panel suppression example correctly identifies confidence + category interaction. |
| 7-8 | Reasonable effort score and risk assessment. Examples present but less concrete. |
| 5-6 | Effort score given without rubric justification. Risk/budget relationship unclear. |
| 3-4 | Generic calibration without scenario-specific reasoning. |
| 1-2 | No meaningful calibration. |

### 5. Failure Mode Analysis (1-10)

Were the identified failure modes insightful, structural, and actionable?

| Score | Criteria |
|-------|----------|
| 9-10 | Identified non-obvious structural failure modes with root cause in the instruction file (e.g., Medium-task confidence gap, "obvious" undefined, severity hesitancy). Analyzed companion skill reliability impact (token efficiency vs load failure vs context fragmentation). Cited specific sections/lines. Gave actionable fixes. |
| 7-8 | Good failure modes with reasonable structural analysis. At least one non-obvious insight. |
| 5-6 | Generic failure modes (e.g., "might miss things") without structural root cause. |
| 3-4 | Superficial or obvious failure modes only. |
| 1-2 | No meaningful failure analysis. |

## Aggregate Interpretation

| Total Score | Interpretation |
|-------------|----------------|
| 45-50 | Excellent — the instruction file is unambiguous for this model |
| 38-44 | Good — minor clarity improvements would help |
| 30-37 | Adequate — model understood the intent but missed structural nuances |
| 20-29 | Concerning — significant comprehension gaps |
| < 20 | Critical — instruction file needs major restructuring for this model family |

## Cross-Model Consensus

When running multiple models, track **convergence**: findings that 2+ models independently identify are high-confidence issues. Findings from only 1 model may be model-specific artifacts or genuine blind spots worth investigating.
