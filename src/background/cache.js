/**
 * Re-selecting the same span should be instant, not another round trip.
 *
 * chrome.storage.session rather than a Map: MV3 kills an idle service worker
 * after ~30s, which is well inside the window where a reader re-selects
 * something they just looked up.
 */
const STORE = "explainCache";
const MAX_ENTRIES = 40;

/** Cheap, stable string hash. This keys a cache; it is not security. */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h * 33) ^ str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function cacheKey({ selection, context, modelTier }) {
  return hash([modelTier, context.url, selection, context.surrounding].join(" "));
}

export async function readCache(key) {
  const { [STORE]: store = {} } = await chrome.storage.session.get(STORE);
  return store[key] ?? null;
}

export async function writeCache(key, value) {
  const { [STORE]: store = {} } = await chrome.storage.session.get(STORE);
  store[key] = value;
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[stale];
  }
  await chrome.storage.session.set({ [STORE]: store });
}
