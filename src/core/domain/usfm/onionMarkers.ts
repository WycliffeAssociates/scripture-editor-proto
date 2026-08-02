import * as onion from "usfm-onion-web";

import type {
  ClosingBehavior,
  MarkerPayload,
  ParagraphCategory,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Marker registry used by editor/import/prettify code that needs fast membership
 * checks without repeatedly carrying the whole marker catalog around.
 *
 * The registry is built directly from Onion's immutable upstream catalog at
 * module load. This keeps marker facts available synchronously to transforms,
 * rendering, workers, and tests without a startup registration race.
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

const registry = buildRegistry();

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

function buildRegistry(): MarkerRegistry {
  const catalog = onion.markerCatalog();
  const infos = catalog.all();
  try {
    const validNoteMarkers = new Set(
      infos
        .filter((info) => info.category === "noteContainer")
        .map((info) => info.marker),
    );
    const validCharMarkers = new Set([
      ...infos
        .filter((info) => info.category === "character")
        .map((info) => info.marker),
      ...LOCAL_ONLY_REGULAR_CHARACTER_MARKERS,
    ]);
    const validParaMarkers = new Set([
      ...infos
        .filter((info) => info.category === "paragraph")
        .map((info) => info.marker),
      ...LOCAL_ONLY_PARAGRAPH_MARKERS,
    ]);
    const allCharMarkers = new Set([
      ...validNoteMarkers,
      ...validCharMarkers,
      ...infos
        .filter((info) => info.category === "noteSubmarker")
        .map((info) => info.marker),
      ...LOCAL_ONLY_CHARACTER_MARKERS,
    ]);
    const allUsfmMarkers = new Set([
      ...infos.map((info) => info.marker),
      ...LOCAL_ONLY_MARKERS,
    ]);

    const paragraphCategoryByMarker = new Map<string, ParagraphCategory>();
    const payloadByMarker = new Map<string, MarkerPayload>();
    const closingBehaviorByMarker = new Map<string, ClosingBehavior>();
    const chapterMarkers = new Set<string>();
    const chapterVerseMarkers = new Set<string>();
    const documentMarkers = new Set<string>();
    for (const info of infos) {
      if (info.paragraphCategory) {
        paragraphCategoryByMarker.set(info.marker, info.paragraphCategory);
      }
      if (info.payload) payloadByMarker.set(info.marker, info.payload);
      if (info.closingBehavior) {
        closingBehaviorByMarker.set(info.marker, info.closingBehavior);
      }
      if (info.category === "chapter") chapterMarkers.add(info.marker);
      if (info.category === "chapter" || info.category === "verse") {
        chapterVerseMarkers.add(info.marker);
      }
      if (info.category === "document") documentMarkers.add(info.marker);
    }

    return {
      validNoteMarkers,
      validCharMarkers,
      validParaMarkers,
      allCharMarkers,
      allUsfmMarkers,
      chapterVerseMarkers,
      documentMarkers,
      paragraphCategoryByMarker,
      payloadByMarker,
      closingBehaviorByMarker,
      chapterMarkers,
    };
  } finally {
    catalog.free();
  }
}

export const VALID_NOTE_MARKERS = createReadonlySet(
  () => registry.validNoteMarkers,
);

export const VALID_CHAR_MARKERS = createReadonlySet(
  () => registry.validCharMarkers,
);

export const VALID_PARA_MARKERS = createReadonlySet(
  () => registry.validParaMarkers,
);

export const ALL_CHAR_MARKERS = createReadonlySet(
  () => registry.allCharMarkers,
);

export const ALL_USFM_MARKERS = createReadonlySet(
  () => registry.allUsfmMarkers,
);

export const CHAPTER_VERSE_MARKERS = createReadonlySet(
  () => registry.chapterVerseMarkers,
);

export function isDocumentMarker(marker: string) {
  return registry.documentMarkers.has(marker);
}

/**
 * The marker's semantic paragraph category from the USFM Onion catalog
 * (`"section"` / `"poetry"` / `"list"` / `"body"` / …), or `undefined` for a
 * non-paragraph marker or a marker the catalog does not enumerate.
 */
export function getParagraphCategory(
  marker: string,
): ParagraphCategory | undefined {
  return registry.paragraphCategoryByMarker.get(marker);
}

export function isValidParaMarker(marker: string) {
  return VALID_PARA_MARKERS.has(marker);
}

/**
 * The marker's tag-argument payload (`"numberRange"` / `"bookCode"`), or
 * `undefined` for markers without one.
 */
function getMarkerPayload(marker: string): MarkerPayload | undefined {
  return registry.payloadByMarker.get(marker);
}

/**
 * The marker's close expectation from the catalog, or `undefined` when the
 * catalog doesn't enumerate it. Expectation only — the
 * bytes a close actually arrived with live on tokens/nodes.
 */
export function getClosingBehavior(
  marker: string,
): ClosingBehavior | undefined {
  return registry.closingBehaviorByMarker.get(marker);
}

/**
 * Catalog fact: this marker takes a number argument (payload `numberRange` —
 * \c \v \cp \ca \vp \va). Independent of the regular-mode rollout gate
 * (`isEnabledNumberedMarker`); flat source/plain modes use this to decide
 * whether a fused `\v 1` node should re-split into marker + numberRange.
 */
export function markerExpectsNumber(marker: string): boolean {
  return getMarkerPayload(marker) === "numberRange";
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
    markerExpectsNumber(marker) && registry.chapterVerseMarkers.has(marker)
  );
}

/**
 * Catalog `category === "chapter"` membership. The regular-shape grouping
 * pass uses this to give a chapter's numbered node its own (byte-less)
 * line container.
 */
export function isChapterMarker(marker: string): boolean {
  return registry.chapterMarkers.has(marker);
}
