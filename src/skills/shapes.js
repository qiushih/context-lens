/**
 * What a good answer looks like, per category.
 *
 * These fragments are the one source of truth for answer shape. They are used
 * twice: on their own when the category is already known (heuristic hit), and
 * concatenated into the triage prompt when it is not. A dedicated skill module
 * overrides its own entry with something longer — see skills/index.js.
 *
 * The five one-liners below are placeholders until each gets a real skill.
 */
import { CATEGORIES } from "../shared/categories.js";

export const SHAPES = {
  [CATEGORIES.TECHNICAL_TERM]:
    "what it is in one sentence a competent generalist understands, then why this page is using it.",
  [CATEGORIES.VOCABULARY]:
    "a plain definition, then the sense in play here. If the selection is not in {{LANG}}, give the {{LANG}} translation first.",
  [CATEGORIES.ENTITY]:
    "who or what it is, what it is known for, and its connection to this page.",
  [CATEGORIES.FORMULA]:
    "what the expression computes, then each symbol in order, then when it is used. If a formula_source block is present it is authoritative - explain that, and ignore the selected glyphs.",
  [CATEGORIES.CITATION]:
    "what work is being cited and what that work claims. Name authors, year and venue if you can identify it; say plainly that you cannot if you cannot.",
  [CATEGORIES.CODE]:
    "what this code does, then the one part that matters for the surrounding text.",
};
