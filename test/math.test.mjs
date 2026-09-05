/**
 * The formula-source ladder. Each rung corresponds to a renderer measured on a
 * live page; the ordering matters, because several renderers publish more than
 * one source and they are not equally good.
 */
import { extractMathSource, formulaSourceFor, findMathContainer } from "../src/content/math.js";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * Minimal stand-in for an element. math.js reaches for DOM methods through
 * optional chaining, so only what it actually calls has to exist.
 */
function el({ attrs = {}, query = {}, matchesSelectors = [], text = "", next = null, parent = null }) {
  return {
    attrs,
    textContent: text,
    innerHTML: attrs.__innerHTML ?? "",
    outerHTML: attrs.__outerHTML ?? "",
    nextElementSibling: next,
    parentElement: parent,
    getAttribute: (name) => attrs[name] ?? null,
    matches: (sel) => matchesSelectors.includes(sel),
    querySelector: (sel) => query[sel] ?? null,
    closest: (sel) => (matchesSelectors.includes(sel) ? this : null),
  };
}

const TEX = 'annotation[encoding="application/x-tex"]';

console.log("source ladder");

{
  // KaTeX, Wikipedia, LaTeXML, MathML-output MathJax.
  const got = extractMathSource(el({ query: { [TEX]: { textContent: "\\KaTeX" } } }));
  check("  TeX annotation wins", got?.format === "latex" && got.source === "\\KaTeX", JSON.stringify(got));
}

{
  // Wikipedia publishes annotation, alttext and img alt for the same formula.
  const container = el({
    query: {
      [TEX]: { textContent: "{\\displaystyle E=mc^{2}.}" },
      "math[alttext]": { getAttribute: () => "{\\displaystyle WRONG}" },
      "img[alt]": { getAttribute: () => "{\\displaystyle ALSO WRONG}" },
    },
  });
  const got = extractMathSource(container);
  check("  annotation beats alttext and img alt", got.source === "E=mc^{2}.", got.source);
  check("  \\displaystyle wrapper removed", !got.source.includes("displaystyle"));
}

{
  const container = el({
    attrs: { alttext: "{\\displaystyle \\int_0^1 x^2 dx}" },
    matchesSelectors: ["math[alttext]"],
  });
  container.getAttribute = (n) => (n === "alttext" ? "{\\displaystyle \\int_0^1 x^2 dx}" : null);
  const got = extractMathSource(container);
  check("  alttext used when no annotation", got?.source === "\\int_0^1 x^2 dx", got?.source);
}

{
  // MathJax v2 leaves the TeX in a script tag.
  const got = extractMathSource(
    el({ query: { 'script[type^="math/tex"]': { textContent: "a^2 + b^2 = c^2" } } }),
  );
  check("  MathJax v2 script tag", got?.source === "a^2 + b^2 = c^2" && got.origin === "mathjax-v2-script");
}

{
  const container = el({ attrs: { "data-latex": "\\sum_{i=1}^n i" } });
  const got = extractMathSource(container);
  check("  data-latex attribute", got?.source === "\\sum_{i=1}^n i" && got.origin === "data-attribute");
}

{
  // An img alt is only TeX if it looks like TeX; plain prose alt text is not.
  const prose = extractMathSource(el({ query: { "img[alt]": { getAttribute: () => "a diagram" } } }));
  check("  prose img alt is not mistaken for TeX", prose === null, JSON.stringify(prose));

  const tex = extractMathSource(el({ query: { "img[alt]": { getAttribute: () => "E=mc^{2}" } } }));
  check("  TeX-shaped img alt is accepted", tex?.origin === "image-alt");
}

{
  // MathML when no TeX exists anywhere.
  const mml = el({ matchesSelectors: ["math"] });
  mml.outerHTML = "<math><mi>x</mi></math>";
  const container = el({ query: { math: mml } });
  const got = extractMathSource(container);
  check("  MathML fallback", got?.format === "mathml" && got.source.includes("<mi>x</mi>"), got?.source);
}

{
  // MathJax v3/v4 CHTML publishes no source; the accessibility layer is all
  // there is, and it is unambiguous.
  const got = extractMathSource(
    el({ attrs: { "data-semantic-speech-none": "x equals the fraction with numerator negative b" } }),
  );
  check("  semantic speech is the last rung", got?.format === "speech" && got.origin === "semantic-speech");
}

{
  check("  nothing available returns null", extractMathSource(el({})) === null);
  check("  no container returns null", extractMathSource(null) === null);
}

console.log("\npartial selections");
{
  const container = el({
    query: { [TEX]: { textContent: "\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" } },
    text: "x=−b±b2−4ac2a",
    matchesSelectors: [".katex"],
  });
  const anchor = { closest: (sel) => (sel.includes(".katex") ? container : null) };

  const partial = formulaSourceFor(anchor, "b2−4ac");
  check("  recovers the whole formula from a fragment",
    partial?.source === "\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", partial?.source);
  check("  flags the selection as partial", partial?.selectionWasPartial === true);

  const whole = formulaSourceFor(anchor, "x=−b±b2−4ac2a");
  check("  a full selection is not flagged partial", whole?.selectionWasPartial === false);
}

console.log("\nnon-math selections are untouched");
{
  const plain = { closest: () => null };
  check("  no math container found", findMathContainer(plain) === null);
  check("  no formula source produced", formulaSourceFor(plain, "borrow checker") === null);
}

process.exit(failed ? 1 : 0);
