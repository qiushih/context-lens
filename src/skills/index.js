/**
 * Router — stage 3b. Category in, skill out.
 *
 * To add a category: write a skill module next to this file and register it
 * below. Nothing else in the pipeline changes.
 */
import { CATEGORIES, CATEGORY_LABELS } from "../shared/categories.js";
import technicalTerm from "./technical-term.js";
import fallback from "./fallback.js";

const REGISTRY = {
  [CATEGORIES.TECHNICAL_TERM]: technicalTerm,
  // Not implemented yet — the fallback skill answers these for now.
  [CATEGORIES.VOCABULARY]: null,
  [CATEGORIES.ENTITY]: null,
  [CATEGORIES.FORMULA]: null,
  [CATEGORIES.CITATION]: null,
  [CATEGORIES.CODE]: null,
};

export function routeToSkill(category) {
  const skill = REGISTRY[category];
  if (skill) return skill;
  // Keep the classifier's label in the popup header even when the generic
  // skill answers — it tells the user what the router thought it saw.
  return { ...fallback, label: CATEGORY_LABELS[category] ?? fallback.label };
}
