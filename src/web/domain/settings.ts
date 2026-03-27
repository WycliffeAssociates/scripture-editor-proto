import type { SettingsManager } from "@/app/data/settings.ts";
import {
    createBaseLocalStorageSettingsManager,
    getSettingsLocalStorage,
    setDocumentRootFontSize,
} from "@/app/domain/settings/settings.ts";

/**
 * Browser settings adapter used during web bootstrap.
 *
 * It reuses the shared local-storage settings behavior and only adds the web-only
 * constraints: browser builds cannot control page zoom and cannot enumerate system
 * fonts, so those capabilities stay disabled here.
 */
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
            // Apply typography as early as possible so the first paint matches
            // persisted settings instead of snapping after React mounts.
            setDocumentRootFontSize(base.get("fontSize"));
        },
    };
}
