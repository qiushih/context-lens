/**
 * Content script - stage 1 (Selection), stage 2 (Context extraction) and
 * stage 5 (Popup). Context extraction has to live here because this is the
 * only side with a DOM; it costs well under a millisecond.
 *
 * The port protocol itself lives in transport.js so its failure modes can be
 * tested without a browser. This file is DOM plumbing.
 */
import { MSG, ERROR_CODES } from "../shared/messages.js";
import { readSelection, MAX_SELECTION_CHARS } from "./selection.js";
import { extractContext } from "./context.js";
import { createLens } from "./popup.js";
import { createTransport, describeFailure } from "./transport.js";
import { traceFrom, BUILD_ID } from "../shared/debug.js";

const trace = traceFrom("content");
trace("0. content script loaded", { url: location.href });

let pending = null; // { text, rect, context }

const transport = createTransport({ runtime: chrome.runtime });

const lens = createLens({
  onExplain: () => pending && startExplain(pending),
  onOpenSettings: () =>
    chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS }).catch((e) => transport.noteError(e)),
  onReload: () => location.reload(),
});

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
  // critical path. The failure is as useful as the success: it is the earliest
  // signal that this content script can no longer reach the extension.
  chrome.runtime.sendMessage({ type: MSG.PING }).catch((e) => transport.noteError(e));
}

function startExplain({ text, rect, context }) {
  trace("1. startExplain invoked", { selection: text.slice(0, 40) });
  const clickedAt = performance.now();
  let firstPaint = null;

  lens.open(rect, text); // paints before any network work begins

  transport.request(
    { selection: text, context },
    {
      onCategory: (event) => lens.setCategory(event.label),

      onDelta: (event) => {
        if (firstPaint === null) {
          trace("9. first stream event");
          firstPaint = performance.now() - clickedAt;
        }
        lens.pushDelta(event.text);
      },

      onDone: (event) => {
        trace("9d. done", event.timing);
        lens.finish();
        console.debug(
          "[context-lens] first paint %sms, total %sms%s",
          Math.round(firstPaint ?? -1),
          Math.round(performance.now() - clickedAt),
          event.timing?.cached ? " (cached)" : "",
        );
      },

      onError: (error) => {
        trace("12e. worker error surfaced to popup", error);
        return lens.fail(
          rect,
          error.code === ERROR_CODES.NO_API_KEY
            ? {
                message: "Add an Anthropic API key to start explaining selections.",
                action: { label: "Open settings", kind: "settings" },
              }
            : { message: error.message ?? "Something went wrong." },
        );
      },

      onFailure: (failure) => {
        trace("12. FAILURE surfaced to popup", failure);
        const { message, reload } = describeFailure(failure);
        lens.fail(rect, {
          message,
          action: reload ? { label: "Reload page", kind: "reload" } : null,
        });
      },
    },
  );
}

// Lets the user confirm which bundle a tab is running: `__contextLensBuild`
// in the page console must match the id printed by `npm run build`.
window.__contextLensBuild = BUILD_ID;

document.addEventListener("mouseup", (e) => {
  if (lens.contains(e.target)) return;
  // Let the browser finish updating the selection before we read it.
  setTimeout(capture, 0);
});

document.addEventListener("mousedown", (e) => {
  if (!lens.contains(e.target)) {
    lens.hide();
    transport.cancel();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    lens.hide();
    transport.cancel();
  }
  if (e.key.toLowerCase() === "e" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
    capture();
    if (pending) {
      e.preventDefault();
      startExplain(pending);
    }
  }
});
