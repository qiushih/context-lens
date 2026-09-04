/**
 * Classifier — stage 3a. Two tiers, cheapest first:
 *
 *   1. Heuristics settle the cases the DOM and simple shape already answer
 *      (code blocks, LaTeX, citation markers). Free and instant.
 *   2. Anything left goes to a small Claude call that picks one label.
 *      This is where "technical term vs. vocabulary vs. person" gets decided —
 *      no regex separates those.
 *
 * The result is a label only. Choosing what to *do* with it is the router's job.
 */
import { CATEGORIES, ALL_CATEGORIES } from "../shared/categories.js";
import { CLASSIFY_MODEL, textOf } from "./anthropic.js";

const CITATION_PATTERNS = [
  /^\[\d{1,3}\]/,
  /\bet\s+al\.?/i,
  /\(\s*[A-Z][A-Za-z-]+(?:\s+(?:&|and)\s+[A-Z][A-Za-z-]+)?(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\s*\)/,
  /\b(?:doi|arxiv|isbn|pmid)\s*[:.]/i,
];

const FORMULA_PATTERNS = [
  /\\(?:frac|sum|int|sqrt|alpha|beta|theta|lambda|sigma|partial|cdot|times)\b/,
  /\$\$?[^$]+\$\$?/,
  /[∑∫√≈≤≥≠±∂∇∈∀∃⊂×·]/,
];

const CODE_PATTERNS = [
  /=>|::|->|\bdef\s+\w+\s*\(|\bfunction\s+\w*\s*\(|\bclass\s+\w+|\bimport\s+\w+|\bconst\s+\w+\s*=/,
  /^\s*[\w.]+\([^)]*\)\s*[;{]?\s*$/,
  /[{};]\s*$/m,
];

const any = (patterns, text) => patterns.some((re) => re.test(text));

/** Returns a category, or null when only the model can tell. */
export function heuristicCategory({ selection, context }) {
  if (context.inCodeBlock && selection.length > 2) return CATEGORIES.CODE;
  if (any(FORMULA_PATTERNS, selection)) return CATEGORIES.FORMULA;
  if (any(CITATION_PATTERNS, selection)) return CATEGORIES.CITATION;
  if (selection.includes("\n") && any(CODE_PATTERNS, selection)) return CATEGORIES.CODE;
  return null;
}

const SYSTEM = `You label a text selection a reader made on a web page, so the right kind of explanation can be produced.

Reply with JSON only, no prose, no code fences: {"category": "<label>", "confidence": <0-1>}

Labels:
- technical_term: jargon from a field — engineering, science, medicine, finance, law
- vocabulary: an ordinary word or phrase the reader may not know, including non-English words
- entity: a specific person, company, organisation, product or project
- formula: a mathematical or scientific expression
- citation: a reference to another work
- code: source code, a command, or an API signature

Judge the selection as it is used in the surrounding text, not in isolation.`;

/** Tier 2: ask the small model. Falls back to UNKNOWN if the reply is unusable. */
export async function classifyWithModel(client, { selection, context }) {
  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 256, // classification — a label and a number, nothing more
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Page: ${context.pageTitle} (${context.siteName})`,
          context.headings.length ? `Section: ${context.headings.join(" › ")}` : "",
          `Surrounding text: ${context.surrounding}`,
          ``,
          `Selection: ${selection}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const raw = textOf(response);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { category: CATEGORIES.UNKNOWN, confidence: 0, source: "model" };

  try {
    const parsed = JSON.parse(match[0]);
    const category = ALL_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : CATEGORIES.UNKNOWN;
    return { category, confidence: Number(parsed.confidence) || 0, source: "model" };
  } catch {
    return { category: CATEGORIES.UNKNOWN, confidence: 0, source: "model" };
  }
}

export async function classify(client, input) {
  const fromRules = heuristicCategory(input);
  if (fromRules) return { category: fromRules, confidence: 0.9, source: "heuristic" };
  return classifyWithModel(client, input);
}
