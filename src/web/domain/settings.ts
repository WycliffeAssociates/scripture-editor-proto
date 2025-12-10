import type { SettingsManager } from "@/app/data/settings.ts";
import {
    createBaseLocalStorageSettingsManager,
    getSettingsLocalStorage,
    setDocumentRootFontSize,
} from "@/app/domain/settings/settings.ts";

export function createBrowserSettingsManager(): SettingsManager {
    const persisted = getSettingsLocalStorage();
    const base = createBaseLocalStorageSettingsManager({
        ...persisted,
        canSetZoom: false, // Browser can't set zoom
        canAccessSystemFonts: false, // Browser can't access system fonts
    });
    return {
        ...base,
        applySettings: () => {
            setDocumentRootFontSize(base.get("fontSize")); //preferable to do on bootstrap as plain js instead of in react lifecycle or something
        },
    };
}
