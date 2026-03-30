import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";

/**
 * Locale identifiers currently shipped with the app bundle.
 */
export const SUPPORTED_LOCALES = ["en", "es"];

/**
 * Lazy descriptor map for locale labels and direction metadata.
 *
 * Keeping this as a function allows the Lingui message descriptors to stay in a
 * place the i18n pipeline can consume while still giving runtime code a simple
 * lookup table.
 */
export const GET_LOCALES: () => Record<
    SupportedLocales,
    { nativeName: MessageDescriptor; direction: LanguageDirection }
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

/**
 * Persisted app settings surface.
 *
 * This is the contract shared by web and desktop settings managers and by the
 * UI that reads/writes user preferences.
 */
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
    appDirection: LanguageDirection;
    colorScheme: "light" | "dark";
    autoSyncOnOpen: boolean;
    autoPushOnSave: boolean;
};

/**
 * Defaults applied when no persisted setting exists yet.
 */
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
    autoSyncOnOpen: true,
    autoPushOnSave: true,
};

/**
 * Platform-neutral settings persistence seam.
 */
export interface SettingsManager {
    getSettings: () => Settings;
    get: <K extends keyof Settings>(key: K) => Settings[K];
    set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
    update: (updates: Partial<Settings>) => void;
    applySettings: () => void;
}
