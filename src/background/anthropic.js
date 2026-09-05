import Anthropic from "@anthropic-ai/sdk";

let cache = { apiKey: null, client: null };

/**
 * The key lives in the user's own browser and is sent straight to Anthropic.
 * Fine for a personal MVP; a shipped product should proxy. See README, Security.
 */
export function getClient(apiKey) {
  if (cache.apiKey !== apiKey) {
    cache = {
      apiKey,
      client: new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
        // A popup that is 20s late is worse than one that failed and can be
        // retried by clicking again.
        maxRetries: 1,
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
