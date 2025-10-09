import {EditorMarkersViewStates, EditorModes} from "@/app/data/editor";

export const settingsDefaults = {
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
  appLanguage: "en",
  appDirection: "ltr",
};
type SupportedLocales = "en" | "es";
export type Settings = typeof settingsDefaults & {
  appLanguage: SupportedLocales;
  appDirection: "ltr" | "rtl";
};

export interface SettingsManager {
  getSettings: () => Settings;
  get: <K extends keyof Settings>(key: K) => Settings[K];
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  update: (updates: Partial<Settings>) => void;
  applySettings: () => void;
}
