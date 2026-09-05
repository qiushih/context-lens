/**
 * Stage 4 — runs the one model call and streams it back out.
 *
 * There is exactly one call per explanation, whichever path we took:
 *   heuristic hit  → known-category prompt, category emitted locally at 0 ms
 *   heuristic miss → triage prompt, category arrives in the first tokens
 */
import { CATEGORIES, CATEGORY_LABELS } from "../shared/categories.js";
import { heuristicCategory } from "./classify.js";
import { skillFor, TRIAGE_MAX_TOKENS } from "../skills/index.js";
import {
  buildKnownCategoryPrompt,
  buildTriagePrompt,
  contextBlock,
} from "../skills/prompt.js";
import { RefusalError } from "./anthropic.js";
import { modelConfig } from "../shared/models.js";

/**
 * Strips a leading `CATEGORY: x` line out of a token stream.
 *
 * Deltas arrive mid-word, so this buffers only until the first newline and
 * then gets out of the way. If the model ignores the format, we give up after
 * a short prefix and treat everything as prose rather than swallowing output.
 */
export function categoryLineFilter(onCategory) {
  const GIVE_UP_AFTER = 80;
  let buffer = "";
  let resolved = false;
  let emitted = false;

  /**
   * The blank line after `CATEGORY: x` usually arrives in a later delta than
   * the line itself, so leading whitespace has to stay suppressed until real
   * prose shows up. Otherwise the popup's first paint is an empty line.
   */
  const emit = (text) => {
    const out = emitted ? text : text.replace(/^\s+/, "");
    if (out) emitted = true;
    return out;
  };

  return (delta) => {
    if (resolved) return emit(delta);

    buffer += delta;
    const newline = buffer.indexOf("\n");
    if (newline === -1) {
      if (buffer.length > GIVE_UP_AFTER) {
        resolved = true;
        onCategory(CATEGORIES.UNKNOWN);
        return emit(buffer);
      }
      return ""; // hold: the category line is still arriving
    }

    resolved = true;
    const first = buffer.slice(0, newline).trim();
    const rest = buffer.slice(newline + 1);
    const match = first.match(/^CATEGORY:\s*([a-z_]+)$/i);
    onCategory(
      match && CATEGORY_LABELS[match[1].toLowerCase()]
        ? match[1].toLowerCase()
        : CATEGORIES.UNKNOWN,
    );
    // Model ignored the protocol: keep its first line as prose.
    return emit(match ? rest : `${first} ${rest}`);
  };
}

/**
 * @param onEvent  called with {type:"category"|"delta"|"done"}; the caller
 *                 forwards these straight down the port to the popup.
 * @returns the accumulated explanation, for caching.
 */
export async function explain({ client, input, modelTier, targetLanguage, onEvent, signal }) {
  const known = heuristicCategory(input);
  const model = modelConfig(modelTier);

  const plan = known
    ? buildKnownCategoryPrompt({ category: known, targetLanguage })
    : buildTriagePrompt({ targetLanguage });

  let category = known ?? null;

  // Heuristic hit: the popup can label itself before we touch the network.
  if (known) {
    onEvent({ type: "category", category: known, label: plan.skill.label, source: "heuristic" });
  }

  const emitCategory = (parsed) => {
    category = parsed;
    onEvent({
      type: "category",
      category: parsed,
      label: skillFor(parsed).label,
      source: "model",
    });
  };
  const filter = plan.expectsCategoryLine ? categoryLineFilter(emitCategory) : (d) => d;

  const stream = client.messages.stream({
    model: model.id,
    max_tokens: plan.maxTokens ?? TRIAGE_MAX_TOKENS,
    ...model.params,
    system: plan.system,
    messages: [{ role: "user", content: contextBlock(input) }],
  });

  signal?.addEventListener("abort", () => stream.abort(), { once: true });

  let text = "";
  stream.on("text", (delta) => {
    const prose = filter(delta);
    if (!prose) return;
    text += prose;
    onEvent({ type: "delta", text: prose });
  });

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new RefusalError(final.stop_details?.category ?? null);
  }

  return {
    category: category ?? CATEGORIES.UNKNOWN,
    label: skillFor(category ?? CATEGORIES.UNKNOWN).label,
    explanation: text.trim(),
  };
}
