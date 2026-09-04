/** Shared prompt scaffolding for every skill. */

/** The house style every skill inherits: short, popup-sized, no preamble. */
export const HOUSE_RULES = `Output rules:
- Plain prose plus, at most, one short bullet list. No headings, no code fences.
- 90 words or fewer. The answer appears in a small popup next to the reader's cursor.
- Never restate the selection or open with "This term refers to". Start with the substance.
- If the page context does not settle the meaning, give the most likely reading and say in a final short sentence what else it could be.
- Latency-sensitive; begin your visible answer immediately.`;

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
  ]
    .filter((line) => line !== null)
    .join("\n");
}
