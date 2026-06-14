export type AppearancePreference = "auto" | "light" | "dark";

const storageKey = "haai.appearance";

export function getAppearancePreference(): AppearancePreference {
  const stored = window.localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
}

export function saveAppearancePreference(preference: AppearancePreference): void {
  window.localStorage.setItem(storageKey, preference);
  applyAppearancePreference(preference);
}

export function applyAppearancePreference(preference = getAppearancePreference()): void {
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme =
    preference === "auto" ? "light dark" : preference;
}
