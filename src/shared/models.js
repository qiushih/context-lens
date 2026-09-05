/**
 * Model choices, fastest first. The default is Haiku 4.5: this task is a
 * 90-word explanation of a short span with ~800 tokens of context, which does
 * not need a frontier model, and time-to-first-token is the whole product.
 *
 * Per-model request params matter more than they look:
 *  - Haiku 4.5 has no `effort` parameter (passing one is a 400) and does no
 *    thinking unless given a budget, so we pass neither and it starts emitting
 *    immediately.
 *  - Sonnet 5 runs adaptive thinking by default, which delays the first
 *    visible token. Disabled thinking is accepted there and is the right call
 *    for a popup answer with no tools in play.
 *  - Opus 5 keeps thinking on at low effort: on that model turning thinking
 *    off has known failure modes, and someone who picks Opus wants the depth.
 *
 * Kept free of SDK imports so the options page can read it without bundling
 * the client.
 */
export const MODELS = {
  fast: {
    id: "claude-haiku-4-5",
    label: "Fast - Haiku 4.5 (default)",
    params: {},
  },
  balanced: {
    id: "claude-sonnet-5",
    label: "Balanced - Sonnet 5",
    params: { thinking: { type: "disabled" }, output_config: { effort: "low" } },
  },
  deep: {
    id: "claude-opus-5",
    label: "Deep - Opus 5 (slowest)",
    params: { thinking: { type: "adaptive" }, output_config: { effort: "low" } },
  },
};

export const DEFAULT_MODEL_TIER = "fast";

export function modelConfig(tier) {
  return MODELS[tier] ?? MODELS[DEFAULT_MODEL_TIER];
}
