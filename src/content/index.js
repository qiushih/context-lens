/**
 * Content script — stage 1 (Selection) and stage 5 (Popup) of the pipeline.
 * Stages 2–4 (context extraction, classify/route, skill) run behind the
 * EXPLAIN message in the service worker, except context extraction, which
 * has to happen here because only this side has the DOM.
 */
import { MSG, ERROR_CODES } from "../shared/messages.js";
import { readSelection, MAX_SELECTION_CHARS } from "./selection.js";
import { extractContext } from "./context.js";
import { createLens } from "./popup.js";

let pending = null; // { text, rect, context }

const lens = createLens({
  onExplain: () => pending && explain(pending),
  onOpenSettings: () => chrome.runtime.sendMessage({ type: "context-lens/open-options" }),
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
}

async function explain({ text, rect, context }) {
  lens.showLoading(rect, text);
  try {
    const res = await chrome.runtime.sendMessage({
      type: MSG.EXPLAIN,
      payload: { selection: text, context },
    });

    if (res?.ok) {
      lens.showResult(rect, { ...res.result, subject: text });
    } else if (res?.error?.code === ERROR_CODES.NO_API_KEY) {
      lens.showError(rect, {
        message: "Add an Anthropic API key to start explaining selections.",
        actionLabel: "Open settings",
      });
    } else {
      lens.showError(rect, { message: res?.error?.message ?? "Something went wrong." });
    }
  } catch (err) {
    // Typically "Extension context invalidated" after a reload.
    lens.showError(rect, { message: String(err?.message ?? err) });
  }
}

document.addEventListener("mouseup", (e) => {
  if (lens.contains(e.target)) return;
  // Let the browser finish updating the selection before we read it.
  setTimeout(capture, 0);
});

document.addEventListener("mousedown", (e) => {
  if (!lens.contains(e.target)) lens.hide();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") lens.hide();
  // Explain without reaching for the chip.
  if (e.key.toLowerCase() === "e" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
    capture();
    if (pending) {
      e.preventDefault();
      explain(pending);
    }
  }
});
