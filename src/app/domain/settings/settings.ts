import { type Settings, settingsDefaults } from "@/app/data/settings";

const APP_PREFERENCES_KEY = "app_preferences";

export function getSettingsLocalStorage(): Settings {
    if (typeof window === "undefined") {
        return settingsDefaults;
    }
    try {
        return JSON.parse(localStorage.getItem(APP_PREFERENCES_KEY) || "{}");
    } catch {
        return settingsDefaults;
    }
}
function saveSettingsLocalStorage(settings: Settings) {
    if (typeof window === "undefined") return;
    localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(settings));
}
export function setDocumentRootFontSize(size: string) {
    if (typeof document === "undefined") return;
    document.documentElement.style.fontSize = size;
}

export function createBaseLocalStorageSettingsManager(
    initial: Partial<Settings> = {},
) {
    const persisted = getSettingsLocalStorage();

    const settings: Settings = {
        ...settingsDefaults,
        ...persisted,
        ...initial,
    };

    return {
        getSettings: () => ({ ...settings }),
        get: <K extends keyof Settings>(key: K) => settings[key],
        /**
         * Set  Key and Value, and saves to localStorage
         */
        set: <K extends keyof Settings>(key: K, value: Settings[K]) => {
            settings[key] = value;
            saveSettingsLocalStorage(settings);
        },
        update: (updates: Partial<Settings>) => {
            Object.assign(settings, updates);
            saveSettingsLocalStorage(settings);
        },
    };
}

export function setDocumentRootFontFamily(fontFamily: string) {
    if (typeof document === "undefined") return;
    document.documentElement.style.fontFamily = fontFamily;
}
