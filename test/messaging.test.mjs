/**
 * The port protocol's failure modes. Every one of these ended, before this
 * suite existed, with the popup stuck on "Identifying" forever.
 */
import { createTransport, describeFailure, FAILURE } from "../src/content/transport.js";
import { EXPLAIN_PORT, EVENT } from "../src/shared/messages.js";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * A fake chrome.runtime whose connect() behaves like the real one under each
 * scenario: a port object with onMessage/onDisconnect listener lists, plus
 * runtime.lastError set while onDisconnect runs.
 */
function fakeRuntime({ worker, connectThrows = null, lastError = null }) {
  const runtime = {
    lastError: undefined,
    connectedWith: null,
    connect(info) {
      if (connectThrows) throw new Error(connectThrows);
      runtime.connectedWith = info;

      const messageListeners = [];
      const disconnectListeners = [];
      const port = {
        name: info.name,
        sent: [],
        onMessage: { addListener: (fn) => messageListeners.push(fn) },
        onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
        postMessage(msg) {
          port.sent.push(msg);
        },
        disconnect() {
          port.disconnected = true;
        },
      };

      port.emit = (event) => messageListeners.forEach((fn) => fn(event));
      port.drop = () => {
        runtime.lastError = lastError ? { message: lastError } : undefined;
        disconnectListeners.forEach((fn) => fn());
        runtime.lastError = undefined;
      };

      // The worker's side of the conversation, run on a microtask so the
      // caller has finished wiring listeners first.
      runtime.lastPort = port;
      if (worker) queueMicrotask(() => worker(port));
      return port;
    },
  };
  return runtime;
}

/** Collects handler calls, and asserts a single terminal outcome. */
function collector() {
  const calls = { category: [], delta: [], done: [], error: [], failure: [] };
  return {
    calls,
    handlers: {
      onCategory: (e) => calls.category.push(e),
      onDelta: (e) => calls.delta.push(e),
      onDone: (e) => calls.done.push(e),
      onError: (e) => calls.error.push(e),
      onFailure: (f) => calls.failure.push(f),
    },
    get terminals() {
      return calls.done.length + calls.error.length + calls.failure.length;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const FAST = { ack: 20, response: 40 };

console.log("happy path");
{
  const runtime = fakeRuntime({
    worker: (port) => {
      port.emit({ type: EVENT.ACK });
      port.emit({ type: EVENT.CATEGORY, category: "technical_term", label: "Technical term" });
      port.emit({ type: EVENT.DELTA, text: "A compile-time pass." });
      port.emit({ type: EVENT.DONE, timing: { cached: false } });
    },
  });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await tick();

  check("  connects on the agreed port name", runtime.connectedWith?.name === EXPLAIN_PORT,
    runtime.connectedWith?.name);
  check(
    "  sends the start message with the payload",
    runtime.lastPort.sent[0]?.type === "start" && runtime.lastPort.sent[0]?.payload?.selection === "x",
    JSON.stringify(runtime.lastPort.sent[0]),
  );
  check("  category delivered", c.calls.category[0]?.label === "Technical term");
  check("  delta delivered", c.calls.delta[0]?.text === "A compile-time pass.");
  check("  exactly one terminal outcome", c.terminals === 1, `got ${c.terminals}`);
  check("  no failure reported", c.calls.failure.length === 0);
}

console.log("\nworker never accepts the port (the reported bug)");
{
  // Chrome's behaviour when nothing is listening: immediate disconnect with
  // lastError set. Previously this left the popup on "Identifying".
  const runtime = fakeRuntime({
    lastError: "Could not establish connection. Receiving end does not exist.",
    worker: (port) => port.drop(),
  });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await tick();

  check("  surfaces a failure", c.calls.failure.length === 1);
  check("  classified as no-ack", c.calls.failure[0]?.reason === FAILURE.NO_ACK,
    c.calls.failure[0]?.reason);
  check("  keeps Chrome's reason", /Receiving end does not exist/.test(c.calls.failure[0]?.detail ?? ""));
  check("  message tells the user to reload", describeFailure(c.calls.failure[0]).reload === true);
}

console.log("\norphaned content script");
{
  const runtime = fakeRuntime({ connectThrows: "Extension context invalidated." });
  const c = collector();
  const t = createTransport({ runtime, timeouts: FAST });
  t.request({ selection: "x" }, c.handlers);
  await tick();

  check("  connect() throwing is caught", c.calls.failure.length === 1);
  check("  classified as orphaned", c.calls.failure[0]?.reason === FAILURE.ORPHANED);
  check("  transport remembers", t.orphaned === true);

  const c2 = collector();
  t.request({ selection: "y" }, c2.handlers);
  check("  later requests fail fast without reconnecting",
    c2.calls.failure[0]?.reason === FAILURE.ORPHANED);
}

console.log("\ndisconnect reported only via lastError");
{
  const runtime = fakeRuntime({
    lastError: "Extension context invalidated.",
    worker: (port) => port.drop(),
  });
  const c = collector();
  const t = createTransport({ runtime, timeouts: FAST });
  t.request({ selection: "x" }, c.handlers);
  await tick();
  check("  orphan detected from lastError", c.calls.failure[0]?.reason === FAILURE.ORPHANED);
  check("  transport remembers", t.orphaned === true);
}

console.log("\nno ack within the deadline");
{
  const runtime = fakeRuntime({ worker: () => {} }); // accepts, says nothing
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await new Promise((r) => setTimeout(r, 60));
  check("  times out rather than hanging", c.calls.failure[0]?.reason === FAILURE.NO_ACK);
}

console.log("\nacked, then silence");
{
  const runtime = fakeRuntime({ worker: (port) => port.emit({ type: EVENT.ACK }) });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await new Promise((r) => setTimeout(r, 100));
  check("  response timeout fires", c.calls.failure[0]?.reason === FAILURE.TIMEOUT,
    c.calls.failure[0]?.reason);
  check("  reload is not suggested", describeFailure(c.calls.failure[0]).reload === false);
}

console.log("\nport drops mid-answer");
{
  const runtime = fakeRuntime({
    worker: (port) => {
      port.emit({ type: EVENT.ACK });
      port.emit({ type: EVENT.DELTA, text: "half an ans" });
      port.drop();
    },
  });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await tick();
  check("  classified as an early close", c.calls.failure[0]?.reason === FAILURE.EARLY_CLOSE);
  check("  the partial answer was still delivered", c.calls.delta.length === 1);
}

console.log("\nno duplicate terminal events");
{
  const runtime = fakeRuntime({
    worker: (port) => {
      port.emit({ type: EVENT.ACK });
      port.emit({ type: EVENT.DONE, timing: {} });
      port.drop(); // the worker closing after a normal finish
    },
  });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await new Promise((r) => setTimeout(r, 60));
  check("  done is not followed by a failure", c.terminals === 1, `got ${c.terminals}`);
}

console.log("\nworker-side errors still reach the popup");
{
  const runtime = fakeRuntime({
    worker: (port) => {
      port.emit({ type: EVENT.ACK });
      port.emit({ type: EVENT.ERROR, error: { code: "no_api_key" } });
    },
  });
  const c = collector();
  createTransport({ runtime, timeouts: FAST }).request({ selection: "x" }, c.handlers);
  await tick();
  check("  error delivered as an error, not a failure", c.calls.error[0]?.code === "no_api_key");
  check("  exactly one terminal outcome", c.terminals === 1);
}

process.exit(failed ? 1 : 0);
