import { CATEGORIES } from "../shared/categories.js";
import { HOUSE_RULES, contextBlock } from "./prompt.js";

/**
 * Skill — stage 4, for jargon from a field. The point of a skill is that it
 * knows what a *good* answer to its own category looks like; the router only
 * has to pick one.
 */
export default {
  category: CATEGORIES.TECHNICAL_TERM,
  label: "Technical term",
  maxTokens: 700, // deliberately short output — this renders in a popup

  system: `You explain technical terms to a reader who is part-way through a page and hit a word they do not know.

Answer in this shape:
1. What it is, in one sentence a competent generalist understands.
2. Why it is being mentioned here — connect it to what the surrounding text is actually doing with it.
3. Only if it earns the space: the one contrast that prevents the usual confusion (what it is often mixed up with).

Pitch the depth at the page. A term on an API reference gets a precise answer; the same term in a news article gets the working intuition instead.

${HOUSE_RULES}`,

  buildPrompt: (input) => contextBlock(input),
};
