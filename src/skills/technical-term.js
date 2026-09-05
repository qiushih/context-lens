import { CATEGORIES } from "../shared/categories.js";

/**
 * Skill — stage 4, for jargon from a field. A skill owns the answer shape for
 * its category and, when it needs to, a different token budget. Everything
 * else (house rules, page context, model choice) is shared.
 */
export default {
  category: CATEGORIES.TECHNICAL_TERM,
  label: "Technical term",
  maxTokens: 500, // ~90 words of prose, with headroom

  shape: `1. what it is, in one sentence a competent generalist understands.
   2. why it is being mentioned here — connect it to what the surrounding text is doing with it.
   3. only if it earns the space: the one contrast that prevents the usual confusion.
   Pitch the depth at the page: on an API reference be precise; in a news article give the working intuition instead.`,
};
