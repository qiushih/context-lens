/**
 * Per-stage latency measurement, old architecture vs. new.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node bench/latency.mjs [--runs 3]
 *
 * Path A reproduces the original shape: a Haiku classification call, then a
 * non-streaming Opus 5 explanation. Path B is what the extension does now: one
 * streamed call, with the category either free (heuristic) or arriving in the
 * first tokens.
 *
 * This makes real API calls and costs real money - roughly a cent per run of
 * the full matrix at the time of writing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { explain } from "../src/background/explain.js";
import { heuristicCategory } from "../src/background/classify.js";
import { MODELS } from "../src/shared/models.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "Set ANTHROPIC_API_KEY to run this benchmark.\n" +
      "It makes live API calls; nothing is mocked.",
  );
  process.exit(1);
}

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;
const client = new Anthropic({ apiKey, maxRetries: 1 });

const SAMPLES = [
  {
    name: "technical term (ambiguous)",
    selection: "borrow checker",
    context: {
      pageTitle: "References and Borrowing - The Rust Programming Language",
      url: "https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html",
      siteName: "doc.rust-lang.org",
      description: "",
      headings: ["References and Borrowing"],
      surrounding:
        "A reference is like a pointer in that it is an address we can follow to access the data stored at that address; that data is owned by some other variable. Unlike a pointer, a reference is guaranteed to point to a valid value of a particular type for the life of that reference. At compile time the compiler rejects programs that would leave a reference dangling.",
      inCodeBlock: false,
      codeLanguage: null,
    },
  },
  {
    name: "entity (ambiguous)",
    selection: "Ada Lovelace",
    context: {
      pageTitle: "Analytical Engine - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Analytical_Engine",
      siteName: "en.wikipedia.org",
      description: "",
      headings: ["Analytical Engine", "Programming"],
      surrounding:
        "Between 1842 and 1843 the notes on the engine were translated and heavily annotated, including a method for calculating Bernoulli numbers with the machine, which is considered by some to be the first published computer program.",
      inCodeBlock: false,
      codeLanguage: null,
    },
  },
  {
    name: "code (heuristic hit)",
    selection: "let mut s = String::from(\"hello\");",
    context: {
      pageTitle: "References and Borrowing - The Rust Programming Language",
      url: "https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html",
      siteName: "doc.rust-lang.org",
      description: "",
      headings: ["References and Borrowing", "Mutable References"],
      surrounding:
        "First we change s to be mut. Then we create a mutable reference with &mut s where we call the change function, and update the function signature to accept a mutable reference.",
      inCodeBlock: true,
      codeLanguage: "rust",
    },
  },
];

// ---------------------------------------------------------------- path A

const OLD_CLASSIFY_SYSTEM = `You label a text selection a reader made on a web page, so the right kind of explanation can be produced.

Reply with JSON only, no prose, no code fences: {"category": "<label>", "confidence": <0-1>}

Labels:
- technical_term: jargon from a field - engineering, science, medicine, finance, law
- vocabulary: an ordinary word or phrase the reader may not know, including non-English words
- entity: a specific person, company, organisation, product or project
- formula: a mathematical or scientific expression
- citation: a reference to another work
- code: source code, a command, or an API signature

Judge the selection as it is used in the surrounding text, not in isolation.`;

const OLD_EXPLAIN_SYSTEM = `You explain technical terms to a reader who is part-way through a page and hit a word they do not know.

Answer in this shape:
1. What it is, in one sentence a competent generalist understands.
2. Why it is being mentioned here.
3. Only if it earns the space: the one contrast that prevents the usual confusion.

Output rules:
- Plain prose plus, at most, one short bullet list. No headings, no code fences.
- 90 words or fewer.
- Never restate the selection. Start with the substance.`;

async function pathA({ selection, context }) {
  const t0 = performance.now();
  const heuristic = heuristicCategory({ selection, context });

  let classifyMs = 0;
  if (!heuristic) {
    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: OLD_CLASSIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Page: ${context.pageTitle}\nSurrounding text: ${context.surrounding}\n\nSelection: ${selection}`,
        },
      ],
    });
    classifyMs = performance.now() - t0;
  }

  const t1 = performance.now();
  await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 700,
    output_config: { effort: "low" },
    system: OLD_EXPLAIN_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<page title="${context.pageTitle}">\n${context.surrounding}\n</page>\n<selection>${selection}</selection>`,
      },
    ],
  });

  const total = performance.now() - t0;
  // Non-streaming: nothing is on screen until the whole response lands.
  return { classifyMs, explainMs: performance.now() - t1, firstPaint: total, total };
}

// ---------------------------------------------------------------- path B

async function pathB(sample, modelTier) {
  const t0 = performance.now();
  let firstPaint = null;
  let categoryAt = null;

  await explain({
    client,
    input: { selection: sample.selection, context: sample.context },
    modelTier,
    targetLanguage: "English",
    onEvent: (event) => {
      if (event.type === "category" && categoryAt === null) categoryAt = performance.now() - t0;
      if (event.type === "delta" && firstPaint === null) firstPaint = performance.now() - t0;
    },
  });

  return { classifyMs: 0, categoryAt, firstPaint, total: performance.now() - t0 };
}

// ---------------------------------------------------------------- driver

const ms = (n) => (n === null || n === undefined ? "    -" : `${Math.round(n)}`.padStart(5));

function summarise(label, samples) {
  const avg = (field) => {
    const values = samples.map((s) => s[field]).filter((v) => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  console.log(
    `${label.padEnd(34)} ${ms(avg("categoryAt"))}  ${ms(avg("firstPaint"))}  ${ms(avg("total"))}`,
  );
}

console.log(`${runs} run(s) per cell, live API calls.\n`);
console.log(`${"".padEnd(34)} ${"  cat".padStart(5)}  ${"first".padStart(5)}  ${"total".padStart(5)}`);
console.log("-".repeat(56));

for (const sample of SAMPLES) {
  console.log(`\n${sample.name}`);

  const a = [];
  for (let i = 0; i < runs; i++) a.push(await pathA(sample));
  summarise("  A: classify + Opus, no stream", a);

  for (const tier of Object.keys(MODELS)) {
    const b = [];
    for (let i = 0; i < runs; i++) b.push(await pathB(sample, tier));
    summarise(`  B: single stream, ${tier}`, b);
  }
}

console.log(
  "\ncat        = category label on screen" +
    "\nfirst      = first explanation token on screen" +
    "\ntotal      = full answer complete",
);
