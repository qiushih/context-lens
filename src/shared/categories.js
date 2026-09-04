/**
 * The categories the router knows about. Adding a category means:
 *   1. an entry here,
 *   2. a heuristic or classifier prompt line in background/classify.js,
 *   3. a skill module registered in skills/index.js.
 */
export const CATEGORIES = {
  TECHNICAL_TERM: "technical_term",
  VOCABULARY: "vocabulary",
  ENTITY: "entity", // people / companies / products
  FORMULA: "formula",
  CITATION: "citation",
  CODE: "code",
  UNKNOWN: "unknown",
};

export const CATEGORY_LABELS = {
  [CATEGORIES.TECHNICAL_TERM]: "Technical term",
  [CATEGORIES.VOCABULARY]: "Vocabulary",
  [CATEGORIES.ENTITY]: "Person / company",
  [CATEGORIES.FORMULA]: "Formula",
  [CATEGORIES.CITATION]: "Citation",
  [CATEGORIES.CODE]: "Code",
  [CATEGORIES.UNKNOWN]: "Selection",
};

export const ALL_CATEGORIES = Object.values(CATEGORIES).filter(
  (c) => c !== CATEGORIES.UNKNOWN,
);
