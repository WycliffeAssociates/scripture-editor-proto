import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { SettingsManager } from "@/app/data/settings";
import {
    createBaseLocalStorageSettingsManager,
    setDocumentRootFontFamily,
    setDocumentRootFontSize,
} from "@/app/domain/settings/settings";

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

function restoreWebviewZoom(amount: number | undefined) {
    if (!amount) return;
    getCurrentWebview().setZoom(amount);
}
