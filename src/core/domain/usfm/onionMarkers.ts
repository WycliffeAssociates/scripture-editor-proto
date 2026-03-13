import type { UsfmMarkerCatalog } from "@/core/domain/usfm/usfmOnionTypes.ts";

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

type MarkerRegistry = {
    validNoteMarkers: Set<string>;
    validCharMarkers: Set<string>;
    validParaMarkers: Set<string>;
    allCharMarkers: Set<string>;
    allUsfmMarkers: Set<string>;
    chapterVerseMarkers: Set<string>;
    documentMarkers: Set<string>;
};

let registry: MarkerRegistry | null = null;

function createReadonlySet(getter: () => Set<string>): ReadonlySet<string> {
    return {
        get size() {
            return getter().size;
        },
        has(value: string) {
            return getter().has(value);
        },
        forEach(callbackfn, thisArg) {
            getter().forEach(callbackfn, thisArg);
        },
        entries() {
            return getter().entries();
        },
        keys() {
            return getter().keys();
        },
        values() {
            return getter().values();
        },
        [Symbol.iterator]() {
            return getter()[Symbol.iterator]();
        },
    } satisfies ReadonlySet<string>;
}

function requireRegistry() {
    if (!registry) {
        throw new Error(
            "USFM marker registry not initialized. Initialize it from IUsfmOnionService before using marker helpers.",
        );
    }
    return registry;
}

function buildRegistry(catalog: UsfmMarkerCatalog): MarkerRegistry {
    const validNoteMarkers = new Set(catalog.noteMarkers);
    const validCharMarkers = new Set([
        ...catalog.regularCharacterMarkers,
        ...LOCAL_ONLY_REGULAR_CHARACTER_MARKERS,
    ]);
    const validParaMarkers = new Set([
        ...catalog.paragraphMarkers,
        ...LOCAL_ONLY_PARAGRAPH_MARKERS,
    ]);
    const allCharMarkers = new Set([
        ...validNoteMarkers,
        ...validCharMarkers,
        ...catalog.noteSubmarkers,
        ...LOCAL_ONLY_CHARACTER_MARKERS,
    ]);
    const allUsfmMarkers = new Set([
        ...catalog.allMarkers,
        ...LOCAL_ONLY_MARKERS,
    ]);

    return {
        validNoteMarkers,
        validCharMarkers,
        validParaMarkers,
        allCharMarkers,
        allUsfmMarkers,
        chapterVerseMarkers: new Set(catalog.chapterVerseMarkers),
        documentMarkers: new Set(catalog.documentMarkers),
    };
}

export function initializeUsfmMarkerCatalog(catalog: UsfmMarkerCatalog) {
    registry = buildRegistry(catalog);
}

export function resetUsfmMarkerCatalogForTests() {
    registry = null;
}

export const VALID_NOTE_MARKERS = createReadonlySet(
    () => requireRegistry().validNoteMarkers,
);

export const VALID_CHAR_MARKERS = createReadonlySet(
    () => requireRegistry().validCharMarkers,
);

export const VALID_PARA_MARKERS = createReadonlySet(
    () => requireRegistry().validParaMarkers,
);

export const ALL_CHAR_MARKERS = createReadonlySet(
    () => requireRegistry().allCharMarkers,
);

export const ALL_USFM_MARKERS = createReadonlySet(
    () => requireRegistry().allUsfmMarkers,
);

export const CHAPTER_VERSE_MARKERS = createReadonlySet(
    () => requireRegistry().chapterVerseMarkers,
);

export function isDocumentMarker(marker: string) {
    return requireRegistry().documentMarkers.has(marker);
}

export function isValidParaMarker(marker: string) {
    return VALID_PARA_MARKERS.has(marker);
}
