import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession } from "@github/copilot-sdk/extension";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIMIR_PATH = join(__dirname, "..", "..", "agents", "mimir.agent.md");

/**
 * Extract existing CCA heuristics from mimir.agent.md.
 * Returns an array of { id, name, principle, lookFor[], source }.
 */
function extractHeuristics() {
  let content;
  try {
    content = readFileSync(MIMIR_PATH, "utf-8");
  } catch {
    return { error: "Could not read mimir.agent.md — are you in the asgard repo?" };
  }

  const heuristics = [];
  const regex = /####\s+(CCA-\d+)\s+·\s+(.+)\n\n([\s\S]*?)(?=####\s+CCA-|---\n|$)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, id, name, body] = match;

    // Extract principle (first paragraph)
    const principle = body.split("\n\n")[0].trim();

    // Extract "Look for" bullets
    const lookForMatch = body.match(/\*\*Look for:\*\*\n([\s\S]*?)(?=\n<!--|\n\n|$)/);
    const lookFor = lookForMatch
      ? lookForMatch[1].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim())
      : [];

    // Extract source comment
    const sourceMatch = body.match(/<!--\s*Source:\s*(.+?)\s*-->/);
    const source = sourceMatch ? sourceMatch[1].trim() : null;

    heuristics.push({ id, name, principle, lookFor, source });
  }

  return { heuristics, count: heuristics.length };
}

/**
 * Determine the next CCA ID from existing heuristics.
 */
function nextCcaId(heuristics) {
  if (!heuristics.length) return "CCA-001";
  const maxNum = Math.max(...heuristics.map((h) => parseInt(h.id.replace("CCA-", ""), 10)));
  return `CCA-${String(maxNum + 1).padStart(3, "0")}`;
}

const session = await joinSession({
  tools: [
    {
      name: "mimir_list_heuristics",
      description:
        "List all existing Mimir Cross-Cutting Analysis (CCA) heuristics from mimir.agent.md. " +
        "Returns each heuristic's ID, name, principle, look-for patterns, and source PR. " +
        "Use this to check what Mimir already covers before proposing new heuristics.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        const result = extractHeuristics();
        if (result.error) return result.error;
        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: "mimir_propose_heuristic",
      description:
        "Generate a formatted CCA heuristic block ready to insert into mimir.agent.md. " +
        "Provide a name, principle, look-for patterns, and source PR. " +
        "Returns markdown with the next available CCA-NNN ID. " +
        "Use after reviewing a PR to capture a new pattern Mimir should check for.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short name for the heuristic (2-4 words, e.g., 'Stale Cache Invalidation')",
          },
          principle: {
            type: "string",
            description:
              "1-2 sentence description of the cross-cutting pattern. " +
              "Explain what to look for across files/methods, not a single-file check.",
          },
          lookFor: {
            type: "array",
            items: { type: "string" },
            description: "3-5 specific patterns to search for in a diff",
          },
          sourcePr: {
            type: "string",
            description: "Source PR reference (e.g., 'PR #42 — filter state desync')",
          },
        },
        required: ["name", "principle", "lookFor", "sourcePr"],
      },
      handler: async (args) => {
        const existing = extractHeuristics();
        if (existing.error) return existing.error;
        const { heuristics } = existing;
        const id = nextCcaId(heuristics);

        // Check for duplicate name
        const duplicate = heuristics.find(
          (h) => h.name.toLowerCase() === args.name.toLowerCase()
        );
        if (duplicate) {
          return `⚠️ A heuristic with a similar name already exists: ${duplicate.id} · ${duplicate.name}. Consider extending it instead of creating a new one.`;
        }

        const bullets = args.lookFor.map((l) => `- ${l}`).join("\n");
        const block = [
          `#### ${id} · ${args.name}`,
          "",
          args.principle,
          "",
          "**Look for:**",
          bullets,
          "",
          `<!-- Source: ${args.sourcePr} -->`,
        ].join("\n");

        return [
          `## Proposed Heuristic`,
          "",
          "Insert this block into the `## Cross-Cutting Analysis > ### Heuristics` section",
          `of \`agents/mimir.agent.md\`, before the closing \`---\`:`,
          "",
          "```markdown",
          block,
          "```",
          "",
          `Next ID after this: CCA-${String(parseInt(id.replace("CCA-", ""), 10) + 1).padStart(3, "0")}`,
        ].join("\n");
      },
    },
    {
      name: "mimir_gap_analysis",
      description:
        "Compare a list of PR review findings against existing Mimir CCA heuristics " +
        "to identify gaps — findings that no existing heuristic would catch. " +
        "Provide findings as an array of { title, description, category }. " +
        "Returns which findings are covered, which are gaps, and suggestions for new heuristics.",
      parameters: {
        type: "object",
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short title of the finding" },
                description: { type: "string", description: "What the reviewer flagged" },
                category: {
                  type: "string",
                  description: "Category (e.g., 'data flow', 'accessibility', 'null handling', 'security')",
                },
              },
              required: ["title", "description"],
            },
            description: "Array of PR review findings to analyze",
          },
          prReference: {
            type: "string",
            description: "PR or issue reference for tracking (e.g., 'PR #42')",
          },
        },
        required: ["findings"],
      },
      handler: async (args) => {
        const existing = extractHeuristics();
        if (existing.error) return existing.error;

        const { heuristics } = existing;
        const covered = [];
        const gaps = [];

        for (const finding of args.findings) {
          const keywords = [
            finding.title.toLowerCase(),
            (finding.description || "").toLowerCase(),
            (finding.category || "").toLowerCase(),
          ].join(" ");

          // Score all heuristics by keyword overlap, pick the best match
        const STOP_WORDS = new Set([
          "that", "this", "with", "from", "have", "been", "will", "when",
          "where", "which", "their", "field", "value", "values", "data",
          "code", "file", "files", "should", "does", "also", "same",
        ]);
        const fWords = keywords
          .split(/\W+/)
          .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

        let bestMatch = null;
        let bestScore = 0;

        for (const h of heuristics) {
          const heuristicKeywords = [
            h.name.toLowerCase(),
            h.principle.toLowerCase(),
            ...h.lookFor.map((l) => l.toLowerCase()),
          ].join(" ");

          const hWords = new Set(
            heuristicKeywords.split(/\W+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w))
          );
          const overlap = fWords.filter((w) => hWords.has(w)).length;
          if (overlap > bestScore) {
            bestScore = overlap;
            bestMatch = h;
          }
        }

        if (bestMatch && bestScore >= 2) {
          covered.push({
            finding: finding.title,
            coveredBy: `${bestMatch.id} · ${bestMatch.name}`,
            score: bestScore,
          });
        } else {
          gaps.push(finding);
        }
        }

        const result = {
          summary: `${covered.length} covered, ${gaps.length} gaps out of ${args.findings.length} findings`,
          prReference: args.prReference || "unknown",
          covered,
          gaps,
          suggestion:
            gaps.length > 0
              ? `Use mimir_propose_heuristic to create CCA entries for the ${gaps.length} gap(s).`
              : "All findings are covered by existing heuristics. No new entries needed.",
        };

        return JSON.stringify(result, null, 2);
      },
    },
  ],
  hooks: {
    onSessionStart: async () => {
      await session.log("Mimir feedback tools loaded (mimir_list_heuristics, mimir_propose_heuristic, mimir_gap_analysis)");
    },
  },
});
