# Compaction Retrospective — v0.10.9 through v0.10.14

**Date:** 2026-04-13
**Branch:** `odin/start-odin-compaction-work` (shelved, not merged)
**Baseline:** v0.10.8 on `main` (avg 46.25/50)

## Summary

Six versions of benchmark-driven Odin spec refinement were attempted. Despite targeted changes informed by model feedback, scores declined from the v0.10.8 baseline of 46.25 to 44.75. The work is shelved for analysis. **Key finding: more explanatory prose does not improve LLM instruction compliance — it makes it worse.**

## What Was Tried

### v0.10.9–v0.10.12: Structural Changes
- **MFA compaction**: Renamed MFA steps 1–5 to `Startup-1` through `Startup-5` (later reverted to numbered steps 1–5 with clear labels)
- **Startup corridor simplification**: Removed separate "Startup handoff" concept, integrated into MFA flow
- **Continuation recovery relocation**: Moved the recovery table out of MFA into a separate section
- **Restart-from-top semantics**: Standardized all recovery language
- **5e Evidence Bundle gate**: Cleaned up exclusion list
- **Review prompts skill**: Added mixed code+spec classification for file-type detection

### v0.10.13: Codex Startup Refinement
- Targeted Codex-specific startup issues from three-arm benchmarks
- Simplified first-batch isolation language
- Clarified beacon rule (status lines are not pause points)

### v0.10.14: Cross-Model Consensus Fixes
- Analyzed what all 4 models agreed was wrong (not just one model's opinion)
- Four targeted fixes based on universal consensus:
  1. First-batch isolation rationale (why it exists)
  2. Beacon rule consolidation (one authoritative rule at loop top)
  3. MFA step renaming to avoid collision with Loop step numbers
  4. Recovery language standardization

## Benchmark Scores

### Three-Arm Benchmarks (Arm C = candidate, 3 models)

| Version | Sonnet 4.6 | GPT-5.4 | Codex | Avg |
|---------|-----------|---------|-------|-----|
| v0.10.8 (baseline) | 47 | 46 | 44 | 45.67 |
| v0.10.9 | 45 | 46 | 43 | 44.67 |
| v0.10.10 | 46 | 46 | 44 | 45.33 |
| v0.10.11 | 46 | 47 | 45 | 46.00 |
| v0.10.12 | 46 | 47 | 44 | 45.67 |
| v0.10.13 | 45 | 45 | 45 | 45.00 |

### Release Benchmarks (4 models, full protocol)

| Version | Opus 4.6 | Sonnet 4.6 | GPT-5.4 | Codex | Avg |
|---------|---------|-----------|---------|-------|-----|
| v0.10.8 (baseline) | 48 | 47 | 46 | 44 | **46.25** |
| v0.10.13 | 46 | 43 | 45 | 46 | **45.00** |
| v0.10.14 | 45 | 44 | 45 | 45 | **44.75** |

### Score Trend

```
48 ·
47 · ·
46 · · · ·   ·               ·
45 ·   · · · · · ·   · · · · · ·
44 ·       ·       ·       · · ·
43 ·               ·
     Opus Son GPT Cdx  .09  .10  .11  .12  .13  .14
     ---- baseline ---  ---------- candidates -------
```

## What All 4 Models Consistently Flagged

These issues appeared in **every benchmark run across all 4 model families**. They are structural, not wording problems.

### 1. First-Batch Isolation Fights Model Priors (MFA Clarity: 8/10 ceiling)
Every model rates MFA clarity at exactly 8/10. The constraint "first batch = report_intent + SELECT 1, nothing else" is clear on paper but fights the model's instinct to parallelize. Models are trained to be helpful and efficient — restricting the first batch to two calls is unnatural. No amount of explaining *why* it exists changes the 8/10 rating.

**Implication:** This is a design tradeoff, not a bug. The first-batch constraint exists for UI visibility (user sees "Initializing Odin" before work starts). Removing it would improve benchmark scores but degrade UX. Accept the 8/10 ceiling.

### 2. Continuation/Recovery Complexity
The continuation detection in MFA step 3 requires a multi-step decision tree: query for latest `loop-entry`, check completion, evaluate scope continuity, then if continuing, parse all ledger rows to determine resume point. Models flag this as the highest-risk compliance failure point. The recovery table (which maps ledger state to resume step) compounds the complexity.

**Implication:** Continuation is the least-used path (most tasks are new) but the most complex to specify. Consider simplifying to "query the ledger, find where you left off" without the elaborate decision tree. Or accept that continuation will occasionally misclassify.

### 3. Beacon Rule / Yield-After-Status Confusion
Models trained on chat data associate "showed something to the user" with "yield and wait for response." The startup status lines (`🔁 Starting...`, `🔮 Plan drafted...`, `⚔️ Launching reviewers...`) look like conversation turns. The instruction "these are beacons, not pause points" is stated clearly, but every model flags it as a compliance risk because it fights chat-trained behavior.

**Implication:** The beacon rule is repeatedly stated and understood. The problem is behavioral, not instructional. Models *know* they shouldn't pause but their training makes them want to. Further instruction changes won't help.

### 4. Bookkeeping Density (10 Gates)
The spec has 10 formal `🚫 GATE` checkpoints, each requiring an INSERT then a SELECT to verify. Models describe this as "procedurally fragile" — they understand each gate but worry about procedural compliance across all 10 in sequence. Missing one INSERT means the gate query fails, which triggers a recovery loop.

**Implication:** Gates prevent hallucinated verification (the core value prop). Reducing gate count would reduce bookkeeping but increase the risk of skipped steps. The current count is appropriate for the agent's purpose.

## Why Scores Declined Despite "Improvements"

1. **File length increased**: v0.10.8 was 710 lines. By v0.10.14 it was 773 lines. Every "clarification" added words. More words = harder to process for LLMs, even when each individual sentence is clearer.

2. **Explanatory prose has negative ROI at this length**: Adding "why this rule exists" or "this is a beacon, not a pause point" helps human readers but doesn't measurably help LLMs. The models already understood the rules — they just flagged compliance risk.

3. **Renaming without simplifying is neutral-to-negative**: Changing "MFA steps 1–5" to "Startup-1 through Startup-5" didn't reduce complexity — it just changed labels. The underlying decision tree remained the same.

4. **The benchmark measures comprehension, not compliance**: A model scoring 45/50 means it *understands* 90% of the spec. The remaining 10% is structural complexity that can't be explained away. Real-world compliance testing (running Odin on actual tasks) would measure the other dimension.

## Lessons Learned

1. **Prose compression > prose expansion.** v0.10.8 scored highest partly because it was the shortest (710 lines). Future optimization should remove words, not add them.

2. **Don't optimize for benchmarks — optimize for real-world use.** The benchmark tests "can you understand these instructions?" Models understand them fine (88-96%). The question should be "does the agent produce good results on real tasks?"

3. **Structural simplification requires design changes, not wording changes.** The models' top complaints (continuation complexity, gate density, first-batch isolation) are design decisions. Changing them means changing how Odin works, not how the spec reads.

4. **Cross-model consensus analysis is valuable.** Asking "what do ALL models agree is wrong?" filters out model-specific quirks and reveals real structural issues. Use this technique for future analysis.

5. **The three-arm benchmark protocol works for A/B testing.** It correctly showed that most changes were score-neutral, saving time vs. running full 4-model releases on every version.

## Recommendations for Future Work

1. **Focus on real-world testing.** Run Odin on actual coding tasks across model families and measure: Does the loop start? Does it complete? Does it produce correct code? Does it skip steps?

2. **If spec changes are needed, subtract — don't add.** Target: get back under 710 lines. Candidates for removal/compression:
   - Continuation recovery table (replace with simpler "query ledger, resume" logic)
   - Plan review exception paragraph (edge case, rarely triggered)
   - Duplicate explanations of the same concept across sections
   - Examples that restate what the instruction already says

3. **Accept the 8/10 MFA clarity ceiling.** It's a design tradeoff. The alternative (removing first-batch isolation) would hurt UX.

4. **Consider continuation simplification as a design change.** The current 5-step decision tree could become: "Query the ledger. If the last task isn't done, show the user what's pending and ask if they want to continue or start fresh." This loses automatic resume-point detection but gains clarity and reliability.

## Branch Reference

All shelved work is on `odin/start-odin-compaction-work` at commit `2208d36`. The branch contains:
- 12 benchmark result files (three-arm and release)
- Agent spec changes (v0.10.9–v0.10.14)
- Skill file updates (review-prompts, evidence-bundle)
- CHANGELOG entries for all versions
