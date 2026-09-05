import { DEFAULT_MODEL_TIER } from "./models.js";

const DEFAULTS = {
  apiKey: "",
  targetLanguage: "English", // used by the vocabulary answer shape
  modelTier: DEFAULT_MODEL_TIER,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}
