/**
 * Shared labeling logic for the PR review feedback corpus.
 *
 * Extracted so the extractor and the re-labeler apply byte-identical rules — a corpus
 * relabeled by a drifted copy of these heuristics is not comparable to the run it is
 * scored against, and the drift would be invisible.
 *
 * Pure functions only: no network, no filesystem. Everything here is a function of a
 * comment body and its path.
 */

/** Keyword → category map. First match wins, so order is specific → general. */
const CATEGORY_RULES = [
  ['security', /\b(injection|sql\s*inject|xss|csrf|ssrf|auth(oriz|entic)|bypass|secret|credential|hardcoded\s+(key|password|token)|sanitiz|vulnerab|path\s+traversal)\b/i],
  ['resource-leak', /\b(dispose|disposed|leak|unsubscrib|stopListening|memory\s+leak|not\s+closed|close\s+the|using\s+statement|try-with-resources)\b/i],
  ['concurrency', /\b(race\s+condition|thread[-\s]?safe|deadlock|lock\b|concurren|cancellation\s*token|goroutine|atomic)\b/i],
  ['null-safety', /\b(null\s*(ref|pointer|check|able)?|undefined|NPE|optional\.get|unwrap)\b/i],
  ['error-handling', /\b(error\s+handling|swallow|catch\s*\(|exception|try\/catch|rethrow|retry|fail\s+silently|unhandled)\b/i],
  ['breaking-change', /\b(breaking\s+change|backward[s]?\s+compat|signature\s+change|contract\s+change|public\s+api)\b/i],
  ['omission', /\b(also\s+(need|update|add)|missing\s+(from|in|a|the)|forgot|(didn't|does\s*not|doesn't|no\s+longer)\s+(update|match|reflect)|not\s+updated|other\s+call\s*sites?|remaining\s+(usages?|references?)|all\s+(implementors|consumers|environments|call\s*sites)|stale\b|out\s+of\s+(date|sync)|inconsisten|drifted)\b/i],
  ['test-gap', /\b(test\s+(coverage|case|for\s+this)|no\s+tests?|add\s+a?\s*test|assert(ion)?s?\s+(don't|do\s+not|should))\b/i],
  ['config', /\b(appsettings|config(uration)?\s+(key|value|file)|environment\s+variable|\.env\b|helm|values\.yaml)\b/i],
  ['logic', /\b(off[-\s]by[-\s]one|incorrect(ly)?|wrong|bug\b|edge\s+case|always\s+(true|false|match)|inverted|negat(e|ion)|boundary|false\s+positive|unintended|will\s+(also\s+)?(fail|match|break)|won't\s+(work|match|fire)|(breaks?|fails?)\s+(when|if)|never\s+(fires?|runs?|matches)|double[-\s]count|short[-\s]circuit)\b/i],
  ['performance', /\b(n\+1|performance|O\(n|slow\b|inefficient|allocat|hot\s+path)\b/i],
  ['style-nit', /\b(nit\b|nitpick|typo|naming|rename|formatting|indentation|whitespace|readab|prefer\s+to|consider\s+using|style|wording|grammar)\b/i],
  ['clarity', /\b(unclear|ambiguous|confus|hard\s+to\s+follow|document\s+this|clarif)\b/i],
];

/** Mimir's lane: findings that span files/boundaries rather than being visible in one hunk. */
const CROSS_CUTTING_CATEGORIES = new Set([
  'omission', 'breaking-change', 'config', 'test-gap', 'concurrency', 'data-integrity',
]);

/**
 * Categories Mimir deliberately does not report — never valid recall targets.
 * `discussion` covers reviewer questions and opinions ("why not use the enum here?").
 * The file often changes afterwards, so they pass the acted-on test, but they describe a
 * conversation rather than a defect and would train Mimir to emit speculation.
 */
const NON_ACTIONABLE_CATEGORIES = new Set(['style-nit', 'clarity', 'discussion', 'preference']);

/**
 * Some automated reviewers prefix a comment with italic marker segments carrying their own
 * category and severity, e.g. `_⚠️ Potential issue_ | _🟠 Major_`. When present these are
 * far more reliable than keyword matching, so they win.
 */
const MARKER_CATEGORIES = [
  ['security', /security|vulnerab/i],
  ['data-integrity', /data\s*integrity|integration/i],
  ['performance', /performance|efficiency/i],
  ['error-handling', /error\s*handling|robustness/i],
  ['test-gap', /test(ing)?\s*(coverage|gap)?/i],
  ['style-nit', /nitpick|refactor\s*suggestion|maintainab|readabil|style/i],
  ['logic', /potential\s*issue|functional\s*correctness|correctness|logic|bug/i],
];

/**
 * Severity from the same marker segments, when present. Automated reviewers grade their
 * own findings, and the low grade is mostly convention and metadata polish that Mimir
 * deliberately does not report — so scoring recall against it understates the agent.
 */
const MARKER_SEVERITIES = [
  ['critical', /critical|blocker/i],
  ['major', /major|\bhigh\b/i],
  ['minor', /minor|\blow\b|nitpick/i],
];

function parseSeverity(body) {
  const firstLine = String(body || '').split('\n').find((l) => l.trim()) || '';
  const segments = firstLine.match(/_([^_]+)_/g);
  if (!segments) return null;
  const text = segments.join(' ');
  for (const [severity, re] of MARKER_SEVERITIES) {
    if (re.test(text)) return severity;
  }
  return null;
}

function parseMarkers(body) {
  const firstLine = String(body || '').split('\n').find((l) => l.trim()) || '';
  const segments = firstLine.match(/_([^_]+)_/g);
  if (!segments) return null;
  const text = segments.join(' ');
  // Nitpick markers must win over any correctness-sounding sibling segment.
  if (/nitpick|refactor\s*suggestion/i.test(text)) return 'style-nit';
  for (const [category, re] of MARKER_CATEGORIES) {
    if (re.test(text)) return category;
  }
  return null;
}

/**
 * The substantive claim, if the comment has one. Automated reviewers put it in a bold
 * headline; humans usually lead with it. Classifying on this instead of the whole body
 * keeps collapsed analysis blocks and tool boilerplate out of the decision.
 */
function extractHeadline(body) {
  const cleaned = stripQuotedMarkup(body);
  const bold = cleaned.match(/\*\*([^*]{12,})\*\*/);
  if (bold) return bold[1].trim();
  return cleaned.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
}

/**
 * First-person opinion and scope feedback — "I would not do demo schools", "I think we can
 * just remove all the demo stuff". Frequently acted on, but it expresses what the reviewer
 * wants rather than a defect in the code, and no static reviewer could derive it.
 */
function isPreference(text) {
  const t = text.trim();
  if (/nothing to do here/i.test(t)) return true;
  return /^(i|we)\s+(would|think|thought|prefer|was\s+thinking|don't|do\s+not)\b/i.test(t);
}

/**
 * A question with no accompanying assertion is a conversation opener, not a finding.
 * Requires the whole comment to be short — a long comment that happens to end in a
 * question mark usually states a problem first.
 */
function isDiscussion(text) {
  const t = text.trim();
  if (!t.includes('?')) return false;
  if (t.length > 220) return false;
  return /\?/.test(t) && !/\b(must|should\s+be\s+\w+ed|will\s+(fail|break|throw)|causes?|breaks?)\b/i.test(t);
}

function classify(body) {
  const marker = parseMarkers(body);
  if (marker) return marker;

  const headline = extractHeadline(body);
  const text = stripQuotedMarkup(body);
  for (const [category, re] of CATEGORY_RULES) {
    if (re.test(headline)) return category;
  }
  if (isPreference(headline) || isPreference(text)) return 'preference';
  if (isDiscussion(text)) return 'discussion';
  for (const [category, re] of CATEGORY_RULES) {
    if (re.test(text)) return category;
  }
  return 'other';
}

/** Strip code fences and blockquotes so template boilerplate doesn't drive classification. */
function stripQuotedMarkup(body) {
  return String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<details>[\s\S]*?<\/details>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^>.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/* ------------------------------------------------------------------ *
 * Defect class
 * ------------------------------------------------------------------ */

/**
 * What *kind* of claim the comment makes — orthogonal to `category`, which describes the
 * subject matter (null-safety, concurrency, ...). Category says what the comment is about;
 * defect class says whether Mimir should have reported it at all.
 *
 * This exists because severity turned out to be unusable as that filter. Automated
 * reviewers grade `.vscode/launch.json` drift `major` while grading "this test asserts
 * nothing" and "these generated IDs can collide" `minor` — the grade tracks how easy the
 * fix is, not how much the defect matters. Filtering recall on severity therefore deletes
 * the strongest evidence and keeps the noise. Filtering on defect class does the opposite.
 *
 *   behavioral      the code does the wrong thing at runtime. The core recall target.
 *   contract-drift  a published contract artifact disagrees with the source that generates
 *                   it. Real, and Mimir is expected to report it — but anchored on the
 *                   source file, which is why the scorer needs the `cross-ref` tier.
 *   convention      the code works but doesn't match a codebase pattern, attribute
 *                   baseline, or doc wording. Mimir's prompt scopes it out ("findings that
 *                   would block or delay a merge"), so counting it is scoring the agent
 *                   against instructions it was told not to follow.
 *   tooling         developer tooling and editor config. Same reasoning as convention.
 */
export const DEFECT_CLASSES = ['behavioral', 'contract-drift', 'convention', 'tooling'];

/** Classes counted as recall targets unless the caller overrides. */
export const DEFAULT_RECALL_CLASSES = ['behavioral', 'contract-drift'];

/** Developer tooling and editor config — never shipped, never a merge blocker. */
const TOOLING_PATHS = [
  /(^|\/)\.vscode\//i, /(^|\/)\.idea\//i, /(^|\/)\.editorconfig$/i,
  /(^|\/)\.devcontainer\//i, /(^|\/)\.vs\//i, /\.filenesting\.json$/i,
];

/**
 * Committed artifacts that are generated from source but published as a contract.
 * Path is the strongest available signal here and needs no prose matching.
 */
const CONTRACT_ARTIFACT_PATHS = [
  /(^|\/)openapi\//i, /(^|\/)swagger[^/]*\.json$/i, /\.proto$/i,
  /\.graphql$/i, /\.graphqls$/i, /(^|\/)schema\.json$/i,
];

/**
 * Contract drift reported against the *source* rather than the artifact. These comments
 * live in a controller or model but are still talking about the published surface, so the
 * path test alone misses them. Requires an explicit reference to the artifact or to
 * regeneration — "example" on its own is far too common to be evidence.
 */
const CONTRACT_SIGNALS = [
  /\bregenerate\b/i,
  /\b(published|openapi|swagger)\s+(spec|specification|contract|document)/i,
  /\b(api|published)\s+contract\b/i,
  /\b(response|conflict|error|validation)\s+examples?\b/i,
  /\bexample\s+provider\b/i,
  /\bspec(ification)?\b[^.]{0,40}\b(match|mismatch|stale|out\s+of\s+(date|sync)|disagree)/i,
];

/**
 * Consistency-with-the-codebase claims. The tell is that the comment argues from a
 * pattern, a baseline, or the wording of a description rather than from an observable
 * runtime outcome.
 */
const CONVENTION_SIGNALS = [
  /\bkeep\b[^.]{0,40}\bconsistent\b/i,
  /\b(consistent|inconsistent)\s+with\s+(the\s+)?(rest|other|existing|our|your|this\s+service)/i,
  /\b(convention|baseline|house\s+style|code\s+style)\b/i,
  /\b(add|include|missing)\s+`?\[[A-Za-z]\w+\]`?/i,        // missing attribute, e.g. [ApiController]
  /\b(include|add|provide)\s+`?Summary`?\b/i,              // metadata completeness
  /\b(describe|document|reword|rephrase|clarify\s+the\s+wording)\b[^.]{0,60}\b(as|to\s+say|in\s+the\s+(description|summary|doc))/i,
  /\b(description|doc\s*comment|xml\s+doc|summary\s+text)\b[^.]{0,50}\b(implies|says|claims|is\s+(wrong|misleading|inaccurate))/i,
];

/**
 * Runtime consequences that override any consistency phrasing in the same comment.
 *
 * Consistency language is extremely common *inside* real defect reports — "returns 200 on
 * failure, which is inconsistent with the other endpoints and breaks client retry logic"
 * is a behavioral bug that merely mentions consistency. Without an override the convention
 * branch wins on that sentence and the row silently leaves the denominator, which inflates
 * recall. Misclassifying the other direction only adds a visible row to the miss list, so
 * the asymmetry is resolved deliberately in favour of `behavioral`.
 *
 * Matching an authorization attribute is called out separately: a missing `[Authorize]` is
 * an auth bypass, not house style, even though it is phrased as a missing attribute.
 */
const BEHAVIORAL_OVERRIDES = [
  /\bbreaks?\s+(client|consumer|caller|downstream|retry|backward)/i,
  /\b(dropped|lost|discarded|swallowed|fails?)\s+silently\b/i,
  /\bsilently\s+(dropped|lost|discarded|swallowed|fails?|ignored)\b/i,
  /\b(anonymous|unauthenticated|unauthorised|unauthorized)\s+(caller|user|request|access)/i,
  /\[Authoriz\w*\]/i,
  /\b(data\s+loss|corrupt\w*|collision|underflow|overflow|race\s+condition|deadlock|memory\s+leak|null\s+reference|NRE)\b/i,
  /\b(returns?|throws?|emits?|responds?\s+with)\s+`?\d{3}\b/i,
];

function anyMatch(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * Order matters and is deliberate. Path evidence is objective, so it is consulted before
 * any prose matching. Contract signals outrank convention signals because a comment can
 * legitimately say "the description claims X" *about a published contract* — that is
 * drift, not wording. Behavioral overrides outrank convention because a stated runtime
 * consequence is stronger evidence than incidental consistency phrasing.
 */
export function defectClass(body, filePath) {
  const p = String(filePath || '');
  if (anyMatch(TOOLING_PATHS, p)) return 'tooling';
  if (anyMatch(CONTRACT_ARTIFACT_PATHS, p)) return 'contract-drift';

  const text = stripQuotedMarkup(body);
  const headline = extractHeadline(body);
  const subject = `${headline}\n${text}`;

  if (anyMatch(CONTRACT_SIGNALS, subject)) return 'contract-drift';
  if (anyMatch(BEHAVIORAL_OVERRIDES, subject)) return 'behavioral';
  if (anyMatch(CONVENTION_SIGNALS, subject)) return 'convention';
  return 'behavioral';
}

/* ------------------------------------------------------------------ *
 * Defect-level dedupe
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these',
  'those', 'it', 'its', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'not', 'no',
  'with', 'as', 'at', 'by', 'from', 'can', 'will', 'would', 'should', 'may', 'still',
  'here', 'there', 'if', 'when', 'which', 'you', 'your', 'we', 'our', 'use', 'using',
]);

/**
 * Crude singularisation. A re-raise is usually a reworded restatement, and the rewording
 * routinely flips number — "risks ID collisions" becomes "collision risk". Without this,
 * the two halves of a restated defect share almost no tokens and the pair scores as
 * unrelated. Deliberately conservative: it only strips a trailing plural `s`, so it cannot
 * collapse two genuinely different words into one.
 */
function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function contentTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Headline similarity at or above this counts as the same defect restated. */
const DUPLICATE_THRESHOLD = 0.4;

/**
 * Backticked identifiers in a comment. These are the tokens that actually distinguish one
 * instance of a repeated defect from another, and prose similarity cannot see them:
 * `contentTokens` strips punctuation, so "null `order`" and "null `customer`" differ by a
 * single ordinary word and score far above the threshold despite being separate defects.
 */
function codeSpans(text) {
  return new Set(
    [...String(text || '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim().toLowerCase()),
  );
}

/**
 * One defect commented twice inflates the denominator and makes recall look worse than it
 * is. The common shape is a re-raise across review rounds — "X risks collisions" on round
 * one, "X collision risk still unaddressed" on round two. Two comment ids, two corpus
 * rows, one defect; an agent that reports it once can never score better than 50% on it.
 *
 * The opposite error is worse. Merging two *distinct* defects deletes a real recall target
 * from the denominator, and nothing downstream can see that it happened — the row is
 * simply gone. Repeated-pattern defects ("guard null `order`", "guard null `customer`")
 * are the most common thing a reviewer flags several times in one file and are exactly
 * what naive prose similarity collapses. So when both comments name code symbols, they
 * must share at least one before they can be called the same defect.
 *
 * Scoped to the same PR and the same file, so unrelated files that happen to share
 * vocabulary cannot collide. Rows with no path are skipped entirely rather than being
 * grouped together — a null path is unknown, not a shared location. Returns a map of
 * comment_id → the earliest comment_id describing the same defect.
 */
export function findDuplicates(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.path) continue;
    const key = `${r.repo}#${r.pr}#${r.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const duplicateOf = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const kept = [];
    for (const row of ordered) {
      const tokens = contentTokens(extractHeadline(row.body));
      const spans = codeSpans(row.body);
      const twin = kept.find((k) => {
        if (jaccard(k.tokens, tokens) < DUPLICATE_THRESHOLD) return false;
        // Symbols disagree ⇒ different instances of the same pattern, not a restatement.
        if (k.spans.size > 0 && spans.size > 0) {
          return [...spans].some((s) => k.spans.has(s));
        }
        return true;
      });
      if (twin) duplicateOf.set(row.comment_id, twin.row.comment_id);
      else kept.push({ row, tokens, spans });
    }
  }
  return duplicateOf;
}

export {
  CROSS_CUTTING_CATEGORIES,
  NON_ACTIONABLE_CATEGORIES,
  classify,
  parseSeverity,
  extractHeadline,
  stripQuotedMarkup,
};
