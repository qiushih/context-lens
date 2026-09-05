/**
 * Content script - stage 1 (Selection), stage 2 (Context extraction) and
 * stage 5 (Popup). Context extraction has to live here because this is the
 * only side with a DOM; it costs well under a millisecond.
 *
 * Explanations arrive over a port rather than a one-shot message, so tokens
 * can be painted as they are generated.
 */
import { EXPLAIN_PORT, MSG, EVENT, ERROR_CODES } from "../shared/messages.js";
import { readSelection, MAX_SELECTION_CHARS } from "./selection.js";
import { extractContext } from "./context.js";
import { createLens } from "./popup.js";

let pending = null; // { text, rect, context }
let port = null;

const lens = createLens({
  onExplain: () => pending && explain(pending),
  onOpenSettings: () => chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS }),
});

function closePort() {
  port?.disconnect(); // tells the worker to abort an in-flight stream
  port = null;
}

function capture() {
  const selection = readSelection();
  if (!selection || selection.text.length > MAX_SELECTION_CHARS) {
    pending = null;
    lens.hide();
    return;
  }
  pending = {
    text: selection.text,
    rect: selection.rect,
    context: extractContext(selection),
  };
  lens.showChip(selection.rect);

  // Wake the service worker now, while the user is still deciding to click.
  // MV3 kills it after ~30s idle, and spin-up would otherwise land on the
  // critical path of the very first explanation.
  chrome.runtime.sendMessage({ type: MSG.PING }).catch(() => {});
}

function explain({ text, rect, context }) {
  closePort();
  const clickedAt = performance.now();
  let firstPaint = null;

  lens.open(rect, text); // paints before any network work begins

  port = chrome.runtime.connect({ name: EXPLAIN_PORT });

  port.onMessage.addListener((event) => {
    switch (event.type) {
      case EVENT.CATEGORY:
        lens.setCategory(event.label);
        break;
      case EVENT.DELTA:
        if (firstPaint === null) firstPaint = performance.now() - clickedAt;
        lens.pushDelta(event.text);
        break;
      case EVENT.DONE:
        lens.finish();
        console.debug(
          "[context-lens] first paint %sms, total %sms%s",
          Math.round(firstPaint ?? -1),
          Math.round(performance.now() - clickedAt),
          event.timing?.cached ? " (cached)" : "",
        );
        closePort();
        break;
      case EVENT.ERROR:
        lens.fail(
          rect,
          event.error?.code === ERROR_CODES.NO_API_KEY
            ? {
                message: "Add an Anthropic API key to start explaining selections.",
                actionLabel: "Open settings",
              }
            : { message: event.error?.message ?? "Something went wrong." },
        );
        closePort();
        break;
    }
  });

  // Fires when the worker dies or the extension reloads.
  port.onDisconnect.addListener(() => {
    port = null;
  });

  port.postMessage({ type: "start", payload: { selection: text, context } });
}

document.addEventListener("mouseup", (e) => {
  if (lens.contains(e.target)) return;
  // Let the browser finish updating the selection before we read it.
  setTimeout(capture, 0);
});

document.addEventListener("mousedown", (e) => {
  if (!lens.contains(e.target)) {
    lens.hide();
    closePort();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    lens.hide();
    closePort();
  }
  if (e.key.toLowerCase() === "e" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
    capture();
    if (pending) {
      e.preventDefault();
      explain(pending);
    }
  }
});
