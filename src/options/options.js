import { getSettings, setSettings } from "../shared/settings.js";
import { MODELS } from "../shared/models.js";

const apiKey = document.getElementById("apiKey");
const modelTier = document.getElementById("modelTier");
const targetLanguage = document.getElementById("targetLanguage");
const status = document.getElementById("status");

for (const [tier, model] of Object.entries(MODELS)) {
  modelTier.append(new Option(model.label, tier));
}

async function init() {
  const settings = await getSettings();
  apiKey.value = settings.apiKey;
  targetLanguage.value = settings.targetLanguage;
  modelTier.value = settings.modelTier;
}

document.getElementById("save").addEventListener("click", async () => {
  await setSettings({
    apiKey: apiKey.value.trim(),
    modelTier: modelTier.value,
    targetLanguage: targetLanguage.value.trim() || "English",
  });
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 1500);
});

init();
