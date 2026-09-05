/**
 * The content script's half of the port protocol, with the DOM kept out so it
 * can be tested against a fake runtime.
 *
 * Every way this connection can fail ends in exactly one `onFailure` call.
 * The failure modes are not hypothetical:
 *
 *  - orphaned    the extension was reloaded or updated while this tab was open,
 *                so this script is running against a dead context. Chrome
 *                reports it as "Extension context invalidated" from connect(),
 *                or as "Could not establish connection" on the port. Only a
 *                page reload fixes it.
 *  - no ack      the port opened but the worker never accepted it - typically a
 *                worker that threw during startup, so its onConnect listener
 *                was never registered.
 *  - silence     accepted, then nothing. A hung request must not leave the
 *                popup on "Identifying" forever.
 *  - early close the port dropped mid-answer.
 */
import { EXPLAIN_PORT, EVENT } from "../shared/messages.js";
import { traceFrom } from "../shared/debug.js";

const trace = traceFrom("content");

export const FAILURE = {
  ORPHANED: "orphaned",
  NO_ACK: "no_ack",
  TIMEOUT: "timeout",
  EARLY_CLOSE: "early_close",
  SEND_FAILED: "send_failed",
};

export const DEFAULT_TIMEOUTS = {
  /** No ack this soon means the worker never accepted the port. */
  ack: 3000,
  /** Accepted, then went quiet. */
  response: 25000,
};

/** "Extension context invalidated" is the one unrecoverable case. */
export function isOrphanError(err) {
  return /context invalidated|Extension context/i.test(String(err?.message ?? err ?? ""));
}

export function createTransport({
  runtime,
  timeouts = DEFAULT_TIMEOUTS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let active = null;
  let orphaned = false;

  const markOrphanIfNeeded = (err) => {
    if (isOrphanError(err)) orphaned = true;
    return orphaned;
  };

  function close() {
    if (!active) return;
    clearTimeoutFn(active.timer);
    try {
      active.port?.disconnect(); // tells the worker to abort an in-flight stream
    } catch {
      // Already dead; nothing to abort.
    }
    active = null;
  }

  return {
    get orphaned() {
      return orphaned;
    },

    /** Records an orphaned context observed elsewhere, e.g. by the wake ping. */
    noteError(err) {
      return markOrphanIfNeeded(err);
    },

    cancel: close,

    /**
     * @param handlers {onAck, onCategory, onDelta, onDone, onFailure}
     *        onFailure receives ({ reason, detail }) exactly once.
     */
    request(payload, handlers) {
      trace("2. transport.request entered");
      close();

      if (orphaned) {
        trace("2a. short-circuit: already orphaned");
        handlers.onFailure({ reason: FAILURE.ORPHANED });
        return;
      }

      let port;
      try {
        trace("3. runtime.connect calling", { name: EXPLAIN_PORT });
        port = runtime.connect({ name: EXPLAIN_PORT });
        trace("4. port created", { name: port?.name, hasOnMessage: !!port?.onMessage });
      } catch (err) {
        trace("4x. runtime.connect THREW", err.message);
        markOrphanIfNeeded(err);
        handlers.onFailure({
          reason: orphaned ? FAILURE.ORPHANED : FAILURE.NO_ACK,
          detail: err.message,
        });
        return;
      }

      const session = { port, acked: false, done: false, timer: null };
      active = session;

      const settle = (failure) => {
        if (session.done) return;
        trace("settle", failure ? failure.reason : "success");
        session.done = true;
        clearTimeoutFn(session.timer);
        if (failure) handlers.onFailure(failure);
        if (active === session) close();
      };

      const arm = (ms, failure) => {
        clearTimeoutFn(session.timer);
        session.timer = setTimeoutFn(() => {
          trace("10. TIMEOUT fired", failure.reason);
          settle(failure);
        }, ms);
      };

      arm(timeouts.ack, { reason: FAILURE.NO_ACK });
      trace("5. ack timer armed", `${timeouts.ack}ms`);

      port.onMessage.addListener((event) => {
        if (session.done) return;
        switch (event.type) {
          case EVENT.ACK:
            trace("7. ACK received");
            session.acked = true;
            arm(timeouts.response, { reason: FAILURE.TIMEOUT });
            handlers.onAck?.();
            break;
          case EVENT.CATEGORY:
            handlers.onCategory(event);
            break;
          case EVENT.DELTA:
            handlers.onDelta(event);
            break;
          case EVENT.DONE:
            handlers.onDone(event);
            settle(null);
            break;
          case EVENT.ERROR:
            handlers.onError(event.error ?? {});
            settle(null);
            break;
        }
      });

      port.onDisconnect.addListener(() => {
        trace("11. port disconnected", { lastError: runtime.lastError?.message ?? null });
        // Reading lastError here is what stops Chrome logging
        // "Unchecked runtime.lastError: Could not establish connection...",
        // and it is the only place the real reason is available.
        const detail = runtime.lastError?.message ?? null;
        if (detail) markOrphanIfNeeded({ message: detail });
        if (session.done) return;

        settle({
          reason: orphaned
            ? FAILURE.ORPHANED
            : session.acked
              ? FAILURE.EARLY_CLOSE
              : FAILURE.NO_ACK,
          detail,
        });
      });

      try {
        port.postMessage({ type: "start", payload });
        trace("6. start message posted");
      } catch (err) {
        trace("6x. postMessage THREW", err.message);
        markOrphanIfNeeded(err);
        settle({
          reason: orphaned ? FAILURE.ORPHANED : FAILURE.SEND_FAILED,
          detail: err.message,
        });
      }
    },
  };
}

/** Message shown for each failure, plus whether a page reload would help. */
export function describeFailure({ reason, detail }) {
  switch (reason) {
    case FAILURE.ORPHANED:
      return {
        message:
          "Context Lens was reloaded or updated after this page was opened. Reload the page to reconnect.",
        reload: true,
      };
    case FAILURE.NO_ACK:
      return {
        message: `Context Lens's background worker did not accept the connection${
          detail ? ` (${detail})` : ""
        }. Reload the page, and check chrome://extensions for a worker error.`,
        reload: true,
      };
    case FAILURE.TIMEOUT:
      return { message: "Timed out waiting for an explanation.", reload: false };
    case FAILURE.EARLY_CLOSE:
      return {
        message: "The connection closed before the explanation finished.",
        reload: false,
      };
    default:
      return {
        message: `Could not send the request${detail ? `: ${detail}` : ""}.`,
        reload: true,
      };
  }
}
