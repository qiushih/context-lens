import { getSettings, setSettings } from "../shared/settings.js";

const apiKey = document.getElementById("apiKey");
const targetLanguage = document.getElementById("targetLanguage");
const status = document.getElementById("status");

async function init() {
  const settings = await getSettings();
  apiKey.value = settings.apiKey;
  targetLanguage.value = settings.targetLanguage;
}

document.getElementById("save").addEventListener("click", async () => {
  await setSettings({
    apiKey: apiKey.value.trim(),
    targetLanguage: targetLanguage.value.trim() || "English",
  });
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 1500);
});

init();
