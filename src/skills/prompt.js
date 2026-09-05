/**
 * Prompt assembly. Two shapes of request:
 *
 *   buildKnownCategoryPrompt — the heuristics already named the category, so the
 *     model spends none of its output identifying it and the popup can render
 *     the label at 0 ms.
 *
 *   buildTriagePrompt — the category is ambiguous. Classification and
 *     explanation happen in ONE call: the model emits `CATEGORY: <label>` as
 *     its first line, then the explanation. That line arrives in the first few
 *     tokens, so the popup still labels itself almost immediately, and we save
 *     a whole sequential round trip.
 */
import { CATEGORY_LABELS } from "../shared/categories.js";
import { skillFor, allShapes } from "./index.js";

export const CATEGORY_LINE = /^CATEGORY:\s*([a-z_]+)\s*$/im;

const HOUSE_RULES = `Output rules:
- Plain prose plus, at most, one short bullet list. No headings, no code fences.
- 90 words or fewer. The answer appears in a small popup next to the reader's cursor.
- Never restate the selection or open with "This term refers to". Start with the substance.
- If the page context does not settle the meaning, give the most likely reading and say in one short final sentence what else it could be.
- Latency-sensitive; begin your visible answer immediately.`;

const withLang = (shape, lang) => shape.replaceAll("{{LANG}}", lang);

const FORMAT_NOTE = {
  latex: "the page's own LaTeX source for this formula",
  mathml: "the page's own MathML for this formula",
  speech: "the renderer's structural reading of this formula (no source was published)",
};

/**
 * Rendered math, when the page kept its source. This is authoritative and the
 * selection is not: selecting rendered math commonly drops superscripts,
 * flattens fractions, or duplicates glyphs. See content/math.js.
 */
function formulaBlock(math) {
  if (!math?.source) return null;
  return [
    ``,
    `<formula_source format="${math.format}">`,
    math.source,
    `</formula_source>`,
    `The block above is ${FORMAT_NOTE[math.format] ?? "the page's own source"}. Explain it, not the selected text.`,
    math.selectionWasPartial
      ? `The reader selected only part of it; explain the whole formula.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Renders the extracted page context into the user turn. */
export function contextBlock({ selection, context }) {
  return [
    `<page title="${context.pageTitle}" site="${context.siteName}">`,
    context.headings.length ? `Section: ${context.headings.join(" › ")}` : null,
    context.description ? `About this page: ${context.description}` : null,
    context.codeLanguage ? `Code language: ${context.codeLanguage}` : null,
    `</page>`,
    ``,
    `<surrounding_text>`,
    context.surrounding,
    `</surrounding_text>`,
    ``,
    `<selection>`,
    selection,
    `</selection>`,
    formulaBlock(context.math),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildKnownCategoryPrompt({ category, targetLanguage }) {
  const skill = skillFor(category);
  const kind = (CATEGORY_LABELS[category] ?? "selection").toLowerCase();
  return {
    skill,
    expectsCategoryLine: false,
    maxTokens: skill.maxTokens,
    system: `A reader selected ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} on a web page and wants to know what it is. The page it came from is given below.

Answer in this shape: ${withLang(skill.shape, targetLanguage)}

${HOUSE_RULES}`,
  };
}

export function buildTriagePrompt({ targetLanguage }) {
  const shapes = allShapes()
    .map(({ category, shape }) => ` - ${category}: ${withLang(shape, targetLanguage)}`)
    .join("\n");

  return {
    expectsCategoryLine: true,
    system: `A reader selected something on a web page and wants to know what it is.

Your first line must be exactly:
CATEGORY: <one of ${allShapes().map((s) => s.category).join(" | ")}>

Then a blank line, then the explanation — no other preamble.

Decide the category from how the selection is used in the surrounding text, not from the selection alone, and answer in that category's shape:
${shapes}

${HOUSE_RULES}`,
  };
}
