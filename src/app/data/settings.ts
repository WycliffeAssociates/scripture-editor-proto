import {
    type EditorMarkersMutableState,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
    type EditorMode,
    EditorModes,
} from "@/app/data/editor";

type SupportedLocales = "en" | "es";
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
    mode: EditorMode;
    markersViewState: EditorMarkersViewState;
    markersMutableState: EditorMarkersMutableState;
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
    mode: EditorModes.WYSIWYG,
    markersViewState: EditorMarkersViewStates.WHEN_EDITING,
    markersMutableState: "mutable",
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
