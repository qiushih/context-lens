import Anthropic from "@anthropic-ai/sdk";

/** Model that writes the explanation the user reads. */
export const EXPLAIN_MODEL = "claude-opus-5";
/** Cheap second model, used only to label the selection. */
export const CLASSIFY_MODEL = "claude-haiku-4-5";

let cache = { apiKey: null, client: null };

/**
 * The key lives in the user's own browser and is sent straight to Anthropic.
 * That's fine for a personal MVP; a shipped product should proxy through a
 * server so the key never reaches the client. See README → Security.
 */
export function getClient(apiKey) {
  if (cache.apiKey !== apiKey) {
    cache = {
      apiKey,
      client: new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
      }),
    };
  }
  return cache.client;
}

export class RefusalError extends Error {
  constructor(category) {
    super("Claude declined to answer this selection.");
    this.category = category;
  }
}

/** Concatenated text blocks of a response, after checking for a refusal. */
export function textOf(response) {
  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.category ?? null);
  }
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
