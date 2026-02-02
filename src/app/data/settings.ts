import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { EditorModeSetting } from "@/app/data/editor.ts";

export const SUPPORTED_LOCALES = ["en", "es"];
export const GET_LOCALES: () => Record<
    SupportedLocales,
    { nativeName: MessageDescriptor; direction: "ltr" | "rtl" }
> = () => {
    return {
        en: {
            nativeName: msg`English`,
            direction: "ltr",
        },
        es: {
            nativeName: msg`Español`,
            direction: "ltr",
        },
    };
};
type SupportedLocales = (typeof SUPPORTED_LOCALES)[number];

export type Settings = {
    fontSize: string;
    fontFamily: string;
    zoom: number;
    canSetZoom: boolean;
    canAccessSystemFonts: boolean;
    lastProjectPath: string | null;
    lastBookIdentifier: string | null;
    lastChapterNumber: number | null;
    restoreToLastProjectOnLaunch: true;
    editorMode: EditorModeSetting;
    appLanguage: SupportedLocales;
    appDirection: "ltr" | "rtl";
    colorScheme: "light" | "dark";
};

export const settingsDefaults: Settings = {
    fontSize: "16px",
    fontFamily: "Inter",
    zoom: 1,
    canSetZoom: true,
    canAccessSystemFonts: true,
    lastProjectPath: null,
    lastBookIdentifier: null,
    lastChapterNumber: null,
    restoreToLastProjectOnLaunch: true,
    editorMode: "regular",
    appLanguage: "en",
    appDirection: "ltr",
    colorScheme: "light",
};

export interface SettingsManager {
    getSettings: () => Settings;
    get: <K extends keyof Settings>(key: K) => Settings[K];
    set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
    update: (updates: Partial<Settings>) => void;
    applySettings: () => void;
}
