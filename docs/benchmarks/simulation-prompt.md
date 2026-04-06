# Instruction Simulation Prompt

> Copy this prompt verbatim when launching benchmark agents. Each agent should also be pointed at the full `agents/odin.agent.md` file and any skill files it references.

---

Read the file `agents/odin.agent.md` in full. Then read all skill files referenced by the agent spec — at minimum `skills/odin-review-prompts/SKILL.md`. Then answer these 5 questions:

1. **First-turn sequence**: If a user says "fix the login bug on the settings page", list the exact sequence of actions you would take, in order, before you write any code. Be specific — name the SQL queries, bash commands, tool calls, and gates you'd hit.

2. **Gate compliance**: List every 🚫 GATE in the file and for each one, state what command or query you'd run and what result you need to proceed.

3. **Failure modes**: What could go wrong? Where might an LLM skip a step or get confused? Identify the top 3 places where instruction compliance is most likely to break down.

4. **MANDATORY FIRST ACTIONS**: Does the file make it absolutely clear what must happen before anything else? Rate the clarity 1-10 and explain.

5. **Loop start reliability**: The owner reports that "the Odin loop is not always starting." Based on the instruction structure, what could cause this? Is the critical path from "receive user message" → "begin Odin Loop" unambiguous?

Be thorough and critical. This is a stress test of the instruction file's clarity and processability.
