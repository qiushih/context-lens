const DEFAULTS = {
  apiKey: "",
  targetLanguage: "English", // used by the vocabulary skill's translation half
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}
