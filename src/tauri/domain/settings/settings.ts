import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { SettingsManager } from "@/app/data/settings.ts";
import {
    createBaseLocalStorageSettingsManager,
    setDocumentRootFontFamily,
    setDocumentRootFontSize,
} from "@/app/domain/settings/settings.ts";

/**
 * Build the desktop settings adapter used by the app entrypoint.
 *
 * The shared settings layer owns the setting names and browser-local persistence.
 * This Tauri wrapper adds the desktop-only side effects that the browser cannot
 * do itself, such as restoring webview zoom and allowing access to system fonts.
 */
export function createTauriSettingsManager(): SettingsManager {
    const base = createBaseLocalStorageSettingsManager({
        canSetZoom: true, // tauri can set webview zoom
        canAccessSystemFonts: true, // tauri can access system fonts through ipc binding
    });
    return {
        ...base,
        applySettings: () => {
            setDocumentRootFontSize(base.get("fontSize"));
            setDocumentRootFontFamily(base.get("fontFamily"));
            restoreWebviewZoom(base.get("zoom"));
        },
    };
}

/**
 * Re-apply saved zoom when the desktop shell boots so the app starts in the same
 * visual state the user left it in.
 */
function restoreWebviewZoom(amount: number | undefined) {
    if (!amount) return;
    getCurrentWebview().setZoom(amount);
}
