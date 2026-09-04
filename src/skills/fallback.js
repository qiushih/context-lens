import { CATEGORIES } from "../shared/categories.js";
import { HOUSE_RULES, contextBlock } from "./prompt.js";

/**
 * The router falls back here for categories that do not have a dedicated
 * skill yet, and for selections the classifier could not label. It works, it
 * is just generic — a real skill beats it because it knows the shape of a good
 * answer for its own category.
 */
export default {
  category: CATEGORIES.UNKNOWN,
  label: "Selection",
  maxTokens: 700,

  system: `A reader selected something on a web page and wants to know what it is. Work out what kind of thing the selection is, then explain it the way that kind of thing deserves to be explained, using the surrounding page context.

${HOUSE_RULES}`,

  buildPrompt: (input) => contextBlock(input),
};
