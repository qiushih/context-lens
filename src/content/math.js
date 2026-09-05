/**
 * Recovering a formula's source from rendered math.
 *
 * `getSelection().toString()` over rendered math is not a lesser version of
 * the formula - it is frequently a wrong one. Measured on real pages:
 *
 *   KaTeX      \KaTeX              selects as "KaTeX K A T E ​ X"  (doubled,
 *                                  because both the MathML and HTML branches
 *                                  are in the DOM, plus a zero-width space)
 *   Wikipedia  E=mc^{2}            selects as "𝐸 = 𝑚 𝑐 2"  (superscript lost)
 *   MathJax    \frac{-b\pm\sqrt{..}}{2a}
 *                                  selects as "𝑥=−𝑏±√𝑏2−4⁢𝑎⁢𝑐2⁢𝑎"
 *                                  (fraction flattened - numerator and
 *                                  denominator run together)
 *
 * So this is not only about partial selections. Wherever the page kept the
 * source, we use the source and ignore what was selected.
 *
 * Coverage is a ladder, best first. TeX is available from KaTeX, Wikipedia,
 * LaTeXML/arXiv, MathJax v2, and any MathML carrying a TeX annotation. MathJax
 * v3/v4 with CHTML output and no assistive MathML keeps no TeX in the DOM at
 * all; there the accessibility attributes are the best available source, and
 * they are unambiguous even though they are prose.
 */

/** Anything that looks like a rendered-math root. */
const MATH_CONTAINERS = [
  ".katex",
  ".katex-display",
  "mjx-container",
  ".MathJax",
  ".MathJax_Display",
  ".mwe-math-element",
  "math",
  "[data-latex]",
  "[data-tex]",
].join(", ");

/** Wikipedia and LaTeXML wrap everything in a rendering directive. */
function unwrapDisplayStyle(tex) {
  const trimmed = tex.trim();
  const match = trimmed.match(/^\{\\(?:display|text|script)style\s*([\s\S]*)\}$/);
  return (match ? match[1] : trimmed).trim();
}

/** The nearest rendered-math root containing `el`, or null. */
export function findMathContainer(el) {
  const container = el?.closest?.(MATH_CONTAINERS);
  if (!container) return null;
  // A <math> inside a .katex/.mwe-math-element is the inner half of the same
  // formula; prefer the outermost root so we see every available source.
  return container.parentElement?.closest?.(MATH_CONTAINERS) ?? container;
}

/**
 * @returns {{source: string, format: "latex"|"mathml"|"speech", origin: string}|null}
 */
export function extractMathSource(container) {
  if (!container) return null;

  const self = (selector) =>
    container.matches?.(selector) ? container : container.querySelector?.(selector);

  // 1. TeX annotation - KaTeX, Wikipedia, LaTeXML, MathML-output MathJax.
  const annotation = container.querySelector?.('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent?.trim()) {
    return { source: unwrapDisplayStyle(annotation.textContent), format: "latex", origin: "annotation" };
  }

  // 2. alttext on the <math> element - Wikipedia, LaTeXML.
  const alttext = self("math[alttext]")?.getAttribute("alttext");
  if (alttext?.trim()) {
    return { source: unwrapDisplayStyle(alttext), format: "latex", origin: "alttext" };
  }

  // 3. MathJax v2 leaves the original TeX in a script tag beside the output.
  const script =
    container.querySelector?.('script[type^="math/tex"]') ??
    (container.nextElementSibling?.matches?.('script[type^="math/tex"]')
      ? container.nextElementSibling
      : null);
  if (script?.textContent?.trim()) {
    return { source: unwrapDisplayStyle(script.textContent), format: "latex", origin: "mathjax-v2-script" };
  }

  // 4. Renderers that stamp the source onto the element.
  const dataTex = container.getAttribute?.("data-latex") ?? container.getAttribute?.("data-tex");
  if (dataTex?.trim()) {
    return { source: unwrapDisplayStyle(dataTex), format: "latex", origin: "data-attribute" };
  }

  // 5. Wikipedia's image fallback carries the TeX in alt text.
  const imgAlt = container.querySelector?.("img[alt]")?.getAttribute("alt");
  if (imgAlt?.trim() && /[\\^_{}]/.test(imgAlt)) {
    return { source: unwrapDisplayStyle(imgAlt), format: "latex", origin: "image-alt" };
  }

  // 6. No TeX anywhere, but MathML is structured and unambiguous.
  const mathml = self("mjx-assistive-mml")?.innerHTML ?? self("math")?.outerHTML;
  if (mathml?.trim()) {
    return { source: mathml.replace(/\s+/g, " ").trim(), format: "mathml", origin: "mathml" };
  }

  // 7. MathJax v3/v4 CHTML: no source in the DOM, but the accessibility layer
  //    describes the structure exactly - better than flattened Unicode.
  const speech =
    container.getAttribute?.("data-semantic-speech-none") ??
    container.getAttribute?.("aria-label");
  if (speech?.trim()) {
    return { source: speech.trim(), format: "speech", origin: "semantic-speech" };
  }

  return null;
}

/**
 * Formula source for a selection, if it landed in rendered math.
 * Always describes the whole formula, never the fragment that was selected.
 */
export function formulaSourceFor(element, selectedText) {
  const container = findMathContainer(element);
  if (!container) return null;

  const extracted = extractMathSource(container);
  if (!extracted) return null;

  const rendered = (container.textContent ?? "").replace(/\s+/g, " ").trim();
  return {
    ...extracted,
    // Tells the prompt whether the reader grabbed only part of the formula.
    selectionWasPartial: Boolean(selectedText) && rendered.length > selectedText.trim().length,
  };
}
