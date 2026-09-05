/** Content script to service worker channel. */

/** Long-lived port: explanations stream over this, one port per request. */
export const EXPLAIN_PORT = "context-lens/explain";

/** One-shot messages. */
export const MSG = {
  /** Wakes the service worker while the user is still deciding to click. */
  PING: "context-lens/ping",
  OPEN_OPTIONS: "context-lens/open-options",
};

/** Events the worker pushes down the port, in order. */
export const EVENT = {
  /** Sent the instant onConnect fires, so the content script can tell
   *  "the worker never accepted the port" from "the answer is slow". */
  ACK: "ack",
  CATEGORY: "category",
  DELTA: "delta",
  DONE: "done",
  ERROR: "error",
};

export const ERROR_CODES = {
  NO_API_KEY: "no_api_key",
  API_ERROR: "api_error",
  REFUSED: "refused",
  /** The port closed before the answer finished. */
  DISCONNECTED: "disconnected",
  /** This content script outlived its extension - the page must be reloaded. */
  ORPHANED: "orphaned",
  /** The worker accepted the port, then went quiet. */
  TIMEOUT: "timeout",
};
