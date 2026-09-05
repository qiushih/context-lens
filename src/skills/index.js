/**
 * Router — stage 3b. Category in, skill out.
 *
 * A skill is `{ category, label, maxTokens, shape }`. Registering one here
 * replaces its placeholder shape everywhere: in the known-category prompt and
 * in the triage prompt, which is assembled from every shape.
 */
import { CATEGORIES, CATEGORY_LABELS } from "../shared/categories.js";
import { SHAPES } from "./shapes.js";
import technicalTerm from "./technical-term.js";

const REGISTRY = {
  [CATEGORIES.TECHNICAL_TERM]: technicalTerm,
};

const DEFAULT_MAX_TOKENS = 500;

/** The skill for a category, synthesised from its shape when none is registered. */
export function skillFor(category) {
  const registered = REGISTRY[category];
  if (registered) return registered;
  return {
    category,
    label: CATEGORY_LABELS[category] ?? CATEGORY_LABELS[CATEGORIES.UNKNOWN],
    maxTokens: DEFAULT_MAX_TOKENS,
    shape: SHAPES[category] ?? null,
  };
}

/** Every category's shape, registered skills taking precedence. Used by triage. */
export function allShapes() {
  return Object.keys(SHAPES).map((category) => ({
    category,
    shape: REGISTRY[category]?.shape ?? SHAPES[category],
  }));
}

/** Worst-case budget for a triage call, which could answer as any category. */
export const TRIAGE_MAX_TOKENS = Math.max(
  DEFAULT_MAX_TOKENS,
  ...Object.values(REGISTRY).map((s) => s.maxTokens),
);
