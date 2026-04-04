# Scoring Rubric

Each model response is scored on 5 dimensions. Score 1-10 per dimension. Total possible: 50.

## Dimensions

### 1. Sequence Accuracy (1-10)

Did the model identify the correct pre-code action sequence?

| Score | Criteria |
|-------|----------|
| 9-10 | Every step in correct order, including sub-steps (0b checks, 1b recall queries, 2b signal). Named specific SQL/bash commands. |
| 7-8 | Correct major steps in order, minor sub-steps missing or out of order. |
| 5-6 | Most steps present but significant ordering errors or missing gates. |
| 3-4 | Partial sequence, skipped MANDATORY FIRST ACTIONS or jumped to implementation. |
| 1-2 | Fundamentally wrong — started coding before planning, or missed the loop entirely. |

### 2. Gate Identification (1-10)

Did the model find and correctly describe all gates?

| Score | Criteria |
|-------|----------|
| 9-10 | All 8 gates found, notes which have explicit SQL vs prose-only checks |
| 7-8 | Most gates found, queries mostly correct, missed 1-2 gates or had minor query errors. |
| 5-6 | Found the major gates (Frigg, 5c, 8) but missed plan file or baseline gates. |
| 3-4 | Only found 2-3 gates. |
| 1-2 | Gates not identified or fundamentally misunderstood. |

### 3. Failure Mode Quality (1-10)

Were the identified failure modes insightful and actionable?

| Score | Criteria |
|-------|----------|
| 9-10 | Identified non-obvious failure modes with root cause analysis. Pointed to specific structural issues in the instruction file. Gave actionable fixes. |
| 7-8 | Good failure modes with reasonable analysis. At least one non-obvious insight. |
| 5-6 | Generic failure modes (e.g., "might skip steps") without structural analysis. |
| 3-4 | Superficial or obvious failure modes only. |
| 1-2 | No meaningful failure analysis. |

### 4. MANDATORY FIRST ACTIONS Clarity Rating (1-10)

Does the model's rating and reasoning show deep understanding of instruction processing?

| Score | Criteria |
|-------|----------|
| 9-10 | Rating is well-justified with specific structural observations about attention patterns, section proximity, and competing directives. Gave concrete improvement suggestions. |
| 7-8 | Reasonable rating with some structural observations. |
| 5-6 | Rating given but reasoning is surface-level ("it's clear" or "it could be clearer"). |
| 3-4 | Rating without meaningful justification. |
| 1-2 | No rating or completely off-base assessment. |

### 5. Loop Start Diagnosis (1-10)

Did the model correctly diagnose why the loop might not start?

| Score | Criteria |
|-------|----------|
| 9-10 | Identified multiple specific causes: runtime gate blocking, helpfulness override, ambiguity between "new task" and "continuation", silent steps creating perception of non-start. Structural recommendations. |
| 7-8 | Identified 2+ causes with reasonable analysis. |
| 5-6 | Identified 1 cause but missed the structural/attention issues. |
| 3-4 | Vague diagnosis ("might not follow instructions"). |
| 1-2 | No useful diagnosis. |

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
