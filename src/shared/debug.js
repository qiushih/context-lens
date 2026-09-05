/**
 * Temporary instrumentation for tracing the content-script <-> worker path.
 *
 * Every line is timestamped from a per-context origin, prefixed with the side
 * it came from, and carries the build id so a stale bundle is obvious at a
 * glance. To remove all of it later, delete this file and its call sites -
 * they are all `trace(...)`.
 */

/** Replaced at build time; "dev" means the module was loaded unbundled. */
export const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const origin = Date.now();
const started = performance.now();

/** Wall clock plus milliseconds since this context started. */
function stamp() {
  const now = new Date(origin + (performance.now() - started));
  const t = now.toISOString().slice(11, 23);
  return `${t} +${Math.round(performance.now() - started)}ms`;
}

// console.log, not console.debug: Chrome DevTools hides debug-level output
// unless "Verbose" is ticked in the level filter, which makes tracing look
// like nothing is happening at all.
export function trace(side, step, detail) {
  const line = `[context-lens ${BUILD_ID}] ${stamp()} ${side} ${step}`;
  if (detail === undefined) console.log(line);
  else console.log(line, detail);
}

export const traceFrom = (side) => (step, detail) => trace(side, step, detail);
