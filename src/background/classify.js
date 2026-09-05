/**
 * Classifier — stage 3a, now heuristics only.
 *
 * These rules cover the cases the DOM and simple shape already answer, for
 * free and at 0 ms: code blocks, LaTeX, citation markers. Everything else used
 * to cost a second model round trip; it is now folded into the explanation
 * call itself (see skills/prompt.js → buildTriagePrompt).
 *
 * A hit here is worth more than the round trip it saves: the popup can render
 * the category label before the network is even touched.
 */
import { CATEGORIES } from "../shared/categories.js";

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

/** A category, or null when only the model can tell. */
export function heuristicCategory({ selection, context }) {
  if (context.inCodeBlock && selection.length > 2) return CATEGORIES.CODE;
  if (any(FORMULA_PATTERNS, selection)) return CATEGORIES.FORMULA;
  if (any(CITATION_PATTERNS, selection)) return CATEGORIES.CITATION;
  if (selection.includes("\n") && any(CODE_PATTERNS, selection)) return CATEGORIES.CODE;
  return null;
}
