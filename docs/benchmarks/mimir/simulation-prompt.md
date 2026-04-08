# Mimir Instruction Simulation Prompt

> Copy this prompt verbatim when launching benchmark agents. Each agent should also be pointed at the full `agents/mimir.agent.md` file and the companion skill `skills/mimir-heuristics/SKILL.md`.

---

Read the file `agents/mimir.agent.md` in full. Then read the companion skill `skills/mimir-heuristics/SKILL.md`. Then answer these 5 questions:

**Scenario:** You are reviewing a staged diff containing 4 files in a .NET project:
- `Controllers/AuthController.cs` — new `POST /api/auth/reset-password` endpoint
- `Services/UserService.cs` — new `ResetPasswordAsync` method
- `Tests/UserServiceTests.cs` — new test file for the service
- `appsettings.json` — new `UserService:MaxRetryCount` config key

You receive: `review_context=panel, panel_reviewers=tyr,mimir`

1. **Review process execution**: Walk through your exact review sequence for this diff — every step, in order, from receiving the prompt to producing the final verdict. Name the specific checks, analyses, skill loads, and output sections you'd produce. What changes in your process because this is panel mode vs standalone?

2. **Lane deference and mode behavior**: (a) In this Medium task (Tyr + Mimir only), what do you own vs defer to Tyr? (b) How would your scope change in a Large task with Heimdall/Thor/Loki active? (c) Explain the panel confidence filter — what gets reported, what gets suppressed, and why.

3. **CCA heuristic integration**: (a) When exactly do you load the companion skill? (b) What happens if `skill("mimir-heuristics")` fails? (c) Which specific CCA heuristics (by ID) would fire on this diff and why? Which wouldn't, and why not?

4. **Signal quality and depth calibration**: (a) What review effort score would you assign to this diff and why? (b) How does the `Controllers/Auth*` path pattern affect your risk assessment, exploration budget, and CCA depth? (c) Give a concrete example of a 🔴 finding you'd report — explain what confidence level (High/Medium/Low) drove the inclusion decision. Then give a 🟡 finding where the confidence level matters for panel filtering. (d) Give an example of a finding you'd suppress in panel mode but report in standalone.

5. **Failure modes and structural analysis**: What are the top 3 ways the instruction file could lead Mimir to produce a bad review (false negatives or false positives)? For each, identify the structural cause in the instruction file and explain why it creates risk. Then: how does the companion skill architecture (loading CCA heuristics from a separate file) affect review reliability?

Be thorough and critical. This is a stress test of the instruction file's clarity and processability.
