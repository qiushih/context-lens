/**
 * Context extraction: everything the classifier and the skills need to know
 * about *where* the selection came from. Cheap, synchronous, DOM-only.
 */

import { formulaSourceFor } from "./math.js";

const WINDOW_CHARS = 700; // characters of surrounding prose, split around the selection
const BLOCK_SELECTOR =
  "p, li, td, th, blockquote, pre, figcaption, dd, dt, h1, h2, h3, h4, h5, h6, section, article, div";

function elementOf(node) {
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

/** Nearest ancestor that reads as a paragraph-sized unit. */
function nearestBlock(el) {
  const block = el?.closest(BLOCK_SELECTOR);
  return block ?? document.body;
}

/** h1–h6 trail above the selection, outermost first. */
function headingTrail(el) {
  const headings = [];
  let node = el;
  while (node && node !== document.body) {
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (/^H[1-6]$/.test(sib.tagName)) {
        headings.push(sib.innerText.trim());
        break;
      }
    }
    node = node.parentElement;
  }
  return headings.reverse().filter(Boolean).slice(-3);
}

/** Language hint from highlight.js / Prism / GitHub style class names. */
function codeLanguage(el) {
  const holder = el?.closest("pre, code");
  if (!holder) return null;
  const classes = `${holder.className} ${holder.parentElement?.className ?? ""}`;
  const match = classes.match(/(?:language|lang|highlight-source)-([\w+#-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Text around the selection, centred on it and clipped to a budget. */
function surroundingText(block, selectionText) {
  const full = (block.innerText ?? block.textContent ?? "").replace(/\s+\n/g, "\n").trim();
  if (full.length <= WINDOW_CHARS * 2) return full;

  const at = full.indexOf(selectionText);
  if (at === -1) return full.slice(0, WINDOW_CHARS * 2);

  const start = Math.max(0, at - WINDOW_CHARS);
  const end = Math.min(full.length, at + selectionText.length + WINDOW_CHARS);
  return (start > 0 ? "…" : "") + full.slice(start, end) + (end < full.length ? "…" : "");
}

export function extractContext({ text, range }) {
  const el = elementOf(range.commonAncestorContainer);
  const block = nearestBlock(el);
  const inCodeBlock = Boolean(el?.closest("pre, code, kbd, samp"));
  // Rendered math keeps its own source; what was selected is often a mangled
  // or partial rendering of it. See math.js.
  const math = formulaSourceFor(el, text);

  return {
    math,
    pageTitle: document.title,
    url: location.href,
    siteName: location.hostname,
    description:
      document.querySelector('meta[name="description"]')?.content?.trim() ?? "",
    headings: headingTrail(block),
    surrounding: surroundingText(block, text),
    inCodeBlock,
    codeLanguage: codeLanguage(el),
    // Cheap signal for the citation skill: reference lists live in these.
    nearReferenceList: Boolean(
      el?.closest("ol, ul, table")?.textContent?.match(/\b(doi|arXiv|et al\.)\b/i),
    ),
  };
}
