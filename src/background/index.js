/**
 * Service worker — orchestrates stages 3 and 4 and owns the API key.
 *
 *   selection + context  →  classify  →  route  →  skill  →  explanation
 */
import Anthropic from "@anthropic-ai/sdk";
import { MSG, ERROR_CODES } from "../shared/messages.js";
import { getSettings } from "../shared/settings.js";
import { classify } from "./classify.js";
import { routeToSkill } from "../skills/index.js";
import { getClient, textOf, RefusalError, EXPLAIN_MODEL } from "./anthropic.js";

async function runSkill(client, skill, input) {
  const response = await client.beta.messages.create({
    model: EXPLAIN_MODEL,
    max_tokens: skill.maxTokens,
    // A popup answer is a small task: low effort is faster and cheaper here,
    // with adaptive thinking left on (the default).
    output_config: { effort: "low" },
    // Route a declined request to Anthropic's recommended fallback model
    // instead of surfacing a refusal to the reader.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: skill.system,
    messages: [{ role: "user", content: skill.buildPrompt(input) }],
  });
  return textOf(response);
}

async function explain({ selection, context }) {
  const { apiKey } = await getSettings();
  if (!apiKey) return { ok: false, error: { code: ERROR_CODES.NO_API_KEY } };

  const client = getClient(apiKey);
  const input = { selection, context };

  const { category, confidence, source } = await classify(client, input);
  const skill = routeToSkill(category);
  const explanation = await runSkill(client, skill, input);

  return {
    ok: true,
    result: { category, label: skill.label, confidence, classifiedBy: source, explanation },
  };
}

function toError(err) {
  if (err instanceof RefusalError) {
    return { code: ERROR_CODES.REFUSED, message: err.message };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: ERROR_CODES.NO_API_KEY, message: "That API key was rejected." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: ERROR_CODES.API_ERROR, message: "Rate limited — try again in a moment." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: ERROR_CODES.API_ERROR, message: "Could not reach the Anthropic API." };
  }
  if (err instanceof Anthropic.APIStatusError) {
    return { code: ERROR_CODES.API_ERROR, message: `Anthropic API error ${err.status}.` };
  }
  return { code: ERROR_CODES.API_ERROR, message: String(err?.message ?? err) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.EXPLAIN) {
    explain(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: toError(err) }));
    return true; // keep the channel open for the async reply
  }
  if (message?.type === "context-lens/open-options") {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
