/**
 * Service worker - orchestration.
 *
 *   selection + context -> heuristics -> ONE streamed model call -> popup
 *
 * The old two-call shape (classify, then explain) is gone: for ambiguous
 * selections the model now emits its category as the first line of the same
 * response it explains in. See skills/prompt.js.
 */
import Anthropic from "@anthropic-ai/sdk";
import { EXPLAIN_PORT, MSG, EVENT, ERROR_CODES } from "../shared/messages.js";
import { getSettings } from "../shared/settings.js";
import { getClient, RefusalError } from "./anthropic.js";
import { explain } from "./explain.js";
import { cacheKey, readCache, writeCache } from "./cache.js";

function toError(err) {
  if (err instanceof RefusalError) {
    return { code: ERROR_CODES.REFUSED, message: err.message };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: ERROR_CODES.NO_API_KEY, message: "That API key was rejected." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: ERROR_CODES.API_ERROR, message: "Rate limited - try again in a moment." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: ERROR_CODES.API_ERROR, message: "Could not reach the Anthropic API." };
  }
  if (err instanceof Anthropic.APIStatusError) {
    return { code: ERROR_CODES.API_ERROR, message: `Anthropic API error ${err.status}.` };
  }
  return { code: ERROR_CODES.API_ERROR, message: String(err?.message ?? err) };
}

async function handleExplain(port, payload) {
  const t0 = performance.now();
  const timing = { firstToken: null, total: null, cached: false };
  const abort = new AbortController();
  let closed = false;

  port.onDisconnect.addListener(() => {
    closed = true;
    abort.abort();
  });

  const send = (message) => {
    if (!closed) port.postMessage(message);
  };

  try {
    const { apiKey, targetLanguage, modelTier } = await getSettings();
    if (!apiKey) {
      send({ type: EVENT.ERROR, error: { code: ERROR_CODES.NO_API_KEY } });
      return;
    }

    const input = { selection: payload.selection, context: payload.context };
    const key = cacheKey({ ...input, modelTier });

    const hit = await readCache(key);
    if (hit) {
      send({ type: EVENT.CATEGORY, ...hit.category, source: "cache" });
      send({ type: EVENT.DELTA, text: hit.explanation });
      send({
        type: EVENT.DONE,
        timing: { ...timing, cached: true, firstToken: performance.now() - t0, total: performance.now() - t0 },
      });
      return;
    }

    const result = await explain({
      client: getClient(apiKey),
      input,
      modelTier,
      targetLanguage,
      signal: abort.signal,
      onEvent: (event) => {
        if (event.type === EVENT.DELTA && timing.firstToken === null) {
          timing.firstToken = performance.now() - t0;
        }
        send(event);
      },
    });

    timing.total = performance.now() - t0;
    send({ type: EVENT.DONE, timing });

    if (result.explanation) {
      await writeCache(key, {
        category: { category: result.category, label: result.label },
        explanation: result.explanation,
      });
    }
  } catch (err) {
    if (abort.signal.aborted) return; // user closed the popup; not an error
    send({ type: EVENT.ERROR, error: toError(err) });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== EXPLAIN_PORT) return;
  port.onMessage.addListener((message) => {
    if (message?.type === "start") handleExplain(port, message.payload);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // A no-op whose only job is waking this worker while the user is still
  // reading the chip, so worker spin-up is off the critical path.
  if (message?.type === MSG.PING) {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === MSG.OPEN_OPTIONS) {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
