/** Offline checks: heuristics, routing, prompt assembly, stream parsing. */
import { heuristicCategory } from "../src/background/classify.js";
import { skillFor, allShapes } from "../src/skills/index.js";
import { buildKnownCategoryPrompt, buildTriagePrompt } from "../src/skills/prompt.js";
import { CATEGORIES } from "../src/shared/categories.js";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const ctx = (over = {}) => ({
  pageTitle: "Rust Book", siteName: "doc.rust-lang.org", url: "https://doc.rust-lang.org/x",
  description: "", headings: ["Ownership"],
  surrounding: "A reference is like a pointer.",
  inCodeBlock: false, codeLanguage: null, math: null, ...over,
});

console.log("heuristic routing");
for (const [selection, context, expected] of [
  ["let x = &y;", ctx({ inCodeBlock: true }), CATEGORIES.CODE],
  ["\\frac{1}{2}mv^2", ctx(), CATEGORIES.FORMULA],
  ["∑ x_i / n", ctx(), CATEGORIES.FORMULA],
  ["(Vaswani et al., 2017)", ctx(), CATEGORIES.CITATION],
  ["[12]", ctx(), CATEGORIES.CITATION],
  ["doi: 10.1000/182", ctx(), CATEGORIES.CITATION],
  ["borrow checker", ctx(), null],
  ["Ada Lovelace", ctx(), null],
  ["ephemeral", ctx(), null],
  // A recovered formula source outranks every text pattern.
  ["𝐸 = 𝑚 𝑐 2", ctx({ math: { source: "E=mc^{2}", format: "latex" } }), CATEGORIES.FORMULA],
  ["let x = &y;", ctx({ inCodeBlock: true, math: { source: "x", format: "latex" } }), CATEGORIES.FORMULA],
]) {
  const got = heuristicCategory({ selection, context });
  check(`  ${JSON.stringify(selection)}`, got === expected, `got ${got}`);
}

console.log("\nprompts");
const known = buildKnownCategoryPrompt({ category: CATEGORIES.CODE, targetLanguage: "English" });
check("  known-category prompt omits the CATEGORY protocol", !known.expectsCategoryLine);
check("  known-category prompt carries only its own shape", !known.system.includes("technical_term:"));

const triage = buildTriagePrompt({ targetLanguage: "German" });
check("  triage prompt asks for the CATEGORY line", /CATEGORY: </.test(triage.system));
check("  triage prompt lists every category", allShapes().every((s) => triage.system.includes(s.category)));
check("  triage prompt resolves the language placeholder",
  triage.system.includes("German") && !triage.system.includes("{{LANG}}"));

console.log("\nskills");
check("  registered skill wins", skillFor(CATEGORIES.TECHNICAL_TERM).label === "Technical term");
check("  unregistered category still has a shape", Boolean(skillFor(CATEGORIES.CODE).shape));
check("  registered shape reaches the triage prompt",
  triage.system.includes("competent generalist"));

process.exit(failed ? 1 : 0);
