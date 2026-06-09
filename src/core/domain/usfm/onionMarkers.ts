import type {
    ClosingBehavior,
    MarkerPayload,
    ParagraphCategory,
    UsfmMarkerCatalog,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Marker registry used by editor/import/prettify code that needs fast membership
 * checks without repeatedly carrying the whole marker catalog around.
 *
 * The registry is initialized from the USFM Onion marker catalog and then exposes
 * readonly marker sets for the rest of the application.
 */
// Markers we accept at the editor boundary that the upstream catalog does not
// enumerate. `s5` is USFM 2.x legacy: a chunk-delimiter used heavily in WA
// source data. USFM 3.x caps `s#` at level 4, so upstream will not add it. We
// accept it here; its `unknown-marker` finding flows into the findings store
// unfiltered and is hidden by the app-default policy row in `presentFinding`.
const LOCAL_ONLY_MARKERS = ["s5"] as const;

const LOCAL_ONLY_PARAGRAPH_MARKERS = ["s5"] as const;
const LOCAL_ONLY_REGULAR_CHARACTER_MARKERS = [] as const;
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
    paragraphCategoryByMarker: Map<string, ParagraphCategory>;
    payloadByMarker: Map<string, MarkerPayload>;
    closingBehaviorByMarker: Map<string, ClosingBehavior>;
    chapterMarkers: Set<string>;
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

    const paragraphCategoryByMarker = new Map<string, ParagraphCategory>();
    const payloadByMarker = new Map<string, MarkerPayload>();
    const closingBehaviorByMarker = new Map<string, ClosingBehavior>();
    const chapterMarkers = new Set<string>();
    for (const [marker, info] of Object.entries(catalog.infoByMarker)) {
        if (info.paragraphCategory) {
            paragraphCategoryByMarker.set(marker, info.paragraphCategory);
        }
        if (info.payload) {
            payloadByMarker.set(marker, info.payload);
        }
        if (info.closingBehavior) {
            closingBehaviorByMarker.set(marker, info.closingBehavior);
        }
        if (info.category === "chapter") {
            chapterMarkers.add(marker);
        }
    }

    return {
        validNoteMarkers,
        validCharMarkers,
        validParaMarkers,
        allCharMarkers,
        allUsfmMarkers,
        chapterVerseMarkers: new Set(catalog.chapterVerseMarkers),
        documentMarkers: new Set(catalog.documentMarkers),
        paragraphCategoryByMarker,
        payloadByMarker,
        closingBehaviorByMarker,
        chapterMarkers,
    };
}

export function initializeUsfmMarkerCatalog(catalog: UsfmMarkerCatalog) {
    registry = buildRegistry(catalog);
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

/**
 * The marker's semantic paragraph category from the USFM Onion catalog
 * (`"section"` / `"poetry"` / `"list"` / `"body"` / …), or `undefined` for a
 * non-paragraph marker, a marker the catalog does not enumerate, OR before the
 * catalog is initialized. Unlike the other helpers this does NOT throw when
 * uninitialized: it is read on the per-token render path, where a graceful
 * `undefined` (caller falls back to its local allow-list) is safer than a throw.
 */
export function getParagraphCategory(
    marker: string,
): ParagraphCategory | undefined {
    return registry?.paragraphCategoryByMarker.get(marker);
}

export function isValidParaMarker(marker: string) {
    return VALID_PARA_MARKERS.has(marker);
}

/**
 * The marker's tag-argument payload (`"numberRange"` / `"bookCode"`), or
 * `undefined` for markers without one OR before the catalog is initialized.
 * Graceful like `getParagraphCategory` — read on load/serialize paths where
 * falling back to flat-token behavior is safer than a throw.
 */
function getMarkerPayload(marker: string): MarkerPayload | undefined {
    return registry?.payloadByMarker.get(marker);
}

/**
 * The marker's close expectation from the catalog, or `undefined` when the
 * catalog doesn't enumerate it / isn't initialized. Expectation only — the
 * bytes a close actually arrived with live on tokens/nodes.
 */
export function getClosingBehavior(
    marker: string,
): ClosingBehavior | undefined {
    return registry?.closingBehaviorByMarker.get(marker);
}

/**
 * Membership in the marker+number-payload family that materializes as a
 * numbered-marker node TODAY: payload says "numberRange" (the catalog fact
 * that defines the family — c, cp, ca, v, vp, va) AND the marker is in the
 * catalog's chapter/verse set (the shipped subset — c, v). The second
 * condition is the rollout gate: cp/ca/va/vp share the node shape and join
 * by widening this to the payload check alone.
 */
export function isEnabledNumberedMarker(marker: string): boolean {
    return (
        getMarkerPayload(marker) === "numberRange" &&
        (registry?.chapterVerseMarkers.has(marker) ?? false)
    );
}

/**
 * Catalog `category === "chapter"` membership. The regular-shape grouping
 * pass uses this to give a chapter's numbered node its own (byte-less)
 * line container.
 */
export function isChapterMarker(marker: string): boolean {
    return registry?.chapterMarkers.has(marker) ?? false;
}
