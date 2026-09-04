import { heuristicCategory } from "../src/background/classify.js";
import { routeToSkill } from "../src/skills/index.js";
import { CATEGORIES } from "../src/shared/categories.js";

const ctx = (over = {}) => ({
  pageTitle: "Rust Book — Ownership", siteName: "doc.rust-lang.org",
  description: "", headings: ["Ownership", "Borrowing"],
  surrounding: "A reference is like a pointer in that it's an address we can follow.",
  inCodeBlock: false, codeLanguage: null, nearReferenceList: false, ...over,
});

const cases = [
  ["let x = &y;", ctx({ inCodeBlock: true }), CATEGORIES.CODE],
  ["\\frac{1}{2}mv^2", ctx(), CATEGORIES.FORMULA],
  ["∑ x_i / n", ctx(), CATEGORIES.FORMULA],
  ["(Vaswani et al., 2017)", ctx(), CATEGORIES.CITATION],
  ["[12]", ctx(), CATEGORIES.CITATION],
  ["doi: 10.1000/182", ctx(), CATEGORIES.CITATION],
  ["borrow checker", ctx(), null],
  ["Ada Lovelace", ctx(), null],
  ["ephemeral", ctx(), null],
];

let failed = 0;
for (const [selection, context, expected] of cases) {
  const got = heuristicCategory({ selection, context });
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(selection).padEnd(28)} -> ${got} (expected ${expected})`);
}

const skill = routeToSkill(CATEGORIES.TECHNICAL_TERM);
console.log(`\nrouted: ${skill.label} / maxTokens=${skill.maxTokens}`);
console.log(`fallback for code: ${routeToSkill(CATEGORIES.CODE).label}`);
console.log("\n--- user turn ---\n" + skill.buildPrompt({ selection: "borrow checker", context: ctx() }));
process.exit(failed ? 1 : 0);
