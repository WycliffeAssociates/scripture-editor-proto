import * as onion from "usfm-onion-web";

const LOCAL_ONLY_MARKERS = [
    "lim4",
    "liv1",
    "liv2",
    "liv3",
    "liv4",
    "liv5",
    "qt1-e",
    "qt1-s",
    "qt2-e",
    "qt2-s",
    "qt3-e",
    "qt3-s",
    "qt4-e",
    "qt4-s",
    "qt5-e",
    "qt5-s",
    "s5",
    "sd4",
    "t-e",
    "t-s",
    "ts",
    "ts-e",
    "ts-s",
] as const;

const LOCAL_ONLY_PARAGRAPH_MARKERS = ["lim4", "s5", "sd4"] as const;
const LOCAL_ONLY_REGULAR_CHARACTER_MARKERS = [
    "liv1",
    "liv2",
    "liv3",
    "liv4",
    "liv5",
] as const;
const LOCAL_ONLY_CHARACTER_MARKERS = LOCAL_ONLY_MARKERS.filter(
    (marker) =>
        !LOCAL_ONLY_PARAGRAPH_MARKERS.includes(
            marker as (typeof LOCAL_ONLY_PARAGRAPH_MARKERS)[number],
        ),
);

export const VALID_NOTE_MARKERS = new Set(onion.noteMarkers());

export const VALID_CHAR_MARKERS = new Set([
    ...onion
        .allMarkers()
        .filter((marker) => onion.isRegularCharacterMarker(marker)),
    ...LOCAL_ONLY_REGULAR_CHARACTER_MARKERS,
]);

export const VALID_PARA_MARKERS = new Set([
    ...onion.paragraphMarkers(),
    ...LOCAL_ONLY_PARAGRAPH_MARKERS,
]);

export const ALL_CHAR_MARKERS = new Set([
    ...VALID_NOTE_MARKERS,
    ...VALID_CHAR_MARKERS,
    ...onion.noteSubmarkers(),
    ...LOCAL_ONLY_CHARACTER_MARKERS,
]);

export const ALL_USFM_MARKERS = new Set([
    ...onion.allMarkers(),
    ...LOCAL_ONLY_MARKERS,
]);

export const CHAPTER_VERSE_MARKERS = new Set(
    onion.allMarkers().filter((marker) => {
        const category = onion.markerInfo(marker).category;
        return category === "chapter" || category === "verse";
    }),
);

export function isDocumentMarker(marker: string) {
    return onion.isDocumentMarker(marker);
}

export function isValidParaMarker(marker: string) {
    return VALID_PARA_MARKERS.has(marker);
}
