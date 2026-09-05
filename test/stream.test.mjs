/**
 * The fused call's riskiest piece: pulling `CATEGORY: x` out of a token stream
 * whose deltas land mid-word, without ever swallowing prose.
 *
 * Also runs explain() end to end against a fake stream, so the whole
 * heuristic/triage split is exercised with no network.
 */
import { categoryLineFilter, explain } from "../src/background/explain.js";
import { CATEGORIES } from "../src/shared/categories.js";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Feeds deltas through the filter and returns [category, prose]. */
function run(deltas) {
  let category = "<none>";
  const filter = categoryLineFilter((c) => (category = c));
  const prose = deltas.map(filter).join("");
  return [category, prose];
}

console.log("category line parsing");

check(
  "  clean single delta",
  ...(() => {
    const [c, p] = run(["CATEGORY: vocabulary\n\nAn ordinary word meaning short-lived."]);
    return [c === CATEGORIES.VOCABULARY && p === "An ordinary word meaning short-lived.", `${c} / ${p}`];
  })(),
);

check(
  "  deltas split mid-token",
  ...(() => {
    const [c, p] = run(["CATE", "GORY:", " ent", "ity\n", "\nAda ", "Lovelace wrote..."]);
    return [c === CATEGORIES.ENTITY && p === "Ada Lovelace wrote...", `${c} / ${p}`];
  })(),
);

check(
  "  unknown label falls back without eating prose",
  ...(() => {
    const [c, p] = run(["CATEGORY: philosophy\n\nActually a school of thought."]);
    return [c === CATEGORIES.UNKNOWN && p === "Actually a school of thought.", `${c} / ${p}`];
  })(),
);

check(
  "  model ignores the protocol - first line kept as prose",
  ...(() => {
    const [c, p] = run(["A pointer with a lifetime.\nIt is checked at compile time."]);
    return [
      c === CATEGORIES.UNKNOWN && p.startsWith("A pointer with a lifetime."),
      `${c} / ${p}`,
    ];
  })(),
);

check(
  "  no newline at all - gives up rather than holding output",
  ...(() => {
    const [c, p] = run([`${"x".repeat(100)}`]);
    return [c === CATEGORIES.UNKNOWN && p.length === 100, `${c} / ${p.length} chars`];
  })(),
);

console.log("\nexplain() over a fake stream");

/** Minimal stand-in for the SDK's MessageStream. */
function fakeClient(chunks, { stopReason = "end_turn" } = {}) {
  return {
    lastRequest: null,
    messages: {
      stream(params) {
        this.parent.lastRequest = params;
        const handlers = [];
        return {
          on(event, cb) {
            if (event === "text") handlers.push(cb);
            return this;
          },
          abort() {},
          async finalMessage() {
            for (const chunk of chunks) handlers.forEach((h) => h(chunk));
            return { stop_reason: stopReason, content: [] };
          },
        };
      },
    },
  };
}
const makeClient = (chunks, opts) => {
  const c = fakeClient(chunks, opts);
  c.messages.parent = c;
  return c;
};

const context = {
  pageTitle: "Rust Book", siteName: "doc.rust-lang.org", url: "https://x",
  description: "", headings: [], surrounding: "prose", inCodeBlock: false, codeLanguage: null,
};

{
  const client = makeClient(["CATEGORY: technical_term\n\n", "The compiler pass ", "that enforces borrowing."]);
  const events = [];
  const result = await explain({
    client,
    input: { selection: "borrow checker", context },
    modelTier: "fast",
    targetLanguage: "English",
    onEvent: (e) => events.push(e),
  });
  check("  ambiguous selection makes exactly one call", client.lastRequest !== null);
  check("  uses the default fast model", client.lastRequest.model === "claude-haiku-4-5");
  check("  sends no effort param to Haiku", !("output_config" in client.lastRequest));
  check("  category event precedes any prose", events[0]?.type === "category", events[0]?.type);
  check("  category came from the model", events[0]?.source === "model");
  check("  prose excludes the protocol line", result.explanation === "The compiler pass that enforces borrowing.");
}

{
  const client = makeClient(["Creates a growable String ", "and binds it mutably."]);
  const events = [];
  await explain({
    client,
    input: { selection: "let mut s = String::from(\"hi\");", context: { ...context, inCodeBlock: true } },
    modelTier: "fast",
    targetLanguage: "English",
    onEvent: (e) => events.push(e),
  });
  check("  heuristic hit labels before the network", events[0]?.source === "heuristic");
  check("  heuristic category is code", events[0]?.category === CATEGORIES.CODE);
  check("  no CATEGORY protocol in the prompt", !client.lastRequest.system.includes("Your first line"));
}

{
  const client = makeClient(["ignored"], { stopReason: "refusal" });
  let threw = false;
  try {
    await explain({
      client, input: { selection: "x", context },
      modelTier: "fast", targetLanguage: "English", onEvent: () => {},
    });
  } catch {
    threw = true;
  }
  check("  refusal stop_reason raises", threw);
}

process.exit(failed ? 1 : 0);
