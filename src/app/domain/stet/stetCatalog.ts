import { parseSid } from "@/core/data/bible/bible.ts";

// The validated Spiritual Terms Evaluation catalog: one frozen, self-contained
// snapshot. Verse text (`referenceVerses`) and gloss highlight positions
// (`glossRanges`) are baked offline by the generator; the app never fetches or
// re-derives them. This module is the trust boundary: components receive only
// the shape below, never arbitrary upstream JSON.

export type StetReference = {
  /** Pinned commit SHA of the GL snapshot the marks were computed against. */
  provenanceId: string;
  /** User-visible label, e.g. "English ULB (en_ulb)". */
  displayName: string;
  /** Archive URL for provenance display / diagnostics. */
  sourceUrl?: string;
};

export type StetSubsetVerse = {
  ref: string;
  sameTranslationGroup?: string;
};

export type StetTerm = {
  term: string;
  englishTerm: string;
  strongs: number[];
  definition: string;
  /** Curated evaluation verses (canonical single-verse SIDs). */
  subsetVerses: StetSubsetVerse[];
  /** All recorded occurrences (canonical single-verse SIDs). */
  exhaustiveVerses: string[];
  /** Retained for display/diagnostics; NOT used for runtime matching. */
  glosses: string[];
  /**
   * Per referenced SID, sorted non-overlapping `[start, end)` offsets into
   * `referenceVerses[sid]` where this term's glosses matched. Term-specific.
   */
  glossRanges: Record<string, Array<[number, number]>>;
};

export type StetCatalog = {
  schemaVersion: 1;
  locale: string;
  reference: StetReference;
  /** Frozen GL text keyed by canonical SID, deduped across terms. */
  referenceVerses: Record<string, string>;
  terms: StetTerm[];
};

export type StetGuideRef = {
  locale: string;
  displayName: string;
  provenanceId: string;
  url: string;
};

export type StetGuideManifest = {
  schemaVersion: 1;
  guides: Array<{
    locale: string;
    displayName: string;
    provenanceId: string;
    file: string;
  }>;
};

/** Locales the app knows how to serve. Others are rejected at the boundary. */
const SUPPORTED_STET_LOCALES = new Set(["en", "es-419", "pt-br"]);

/** Thrown when the envelope itself is unusable; callers surface a load error. */
export class StetCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StetCatalogError";
  }
}

export type StetCatalogParseResult = {
  catalog: StetCatalog;
  /** Non-fatal problems (dropped terms/refs/ranges) for one-shot logging. */
  warnings: string[];
};

/**
 * Normalize + validate a single reference to a canonical single-verse SID.
 * Returns null for anything invalid in the V1 dataset: unknown book, range,
 * chapter-only, or zero/negative chapter/verse.
 */
export function normalizeStetSid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parsed = parseSid(raw.trim());
  if (!parsed || parsed.isBookChapOnly) return null;
  if (parsed.verseStart !== parsed.verseEnd) return null;
  if (parsed.chapter < 1 || parsed.verseStart < 1) return null;
  return `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeGlosses(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Keep only in-bounds, ordered, non-overlapping ranges for a verse. The
 * generator is responsible for emitting clean ranges; this drops anything bad so
 * a malformed range can never throw or mis-highlight downstream.
 */
function sanitizeRanges(
  raw: unknown,
  textLength: number,
): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  let lastEnd = 0;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [start, end] = entry;
    if (typeof start !== "number" || typeof end !== "number") continue;
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < lastEnd || start < 0 || end > textLength || start >= end) {
      continue;
    }
    out.push([start, end]);
    lastEnd = end;
  }
  return out;
}

function normalizeTerm(
  raw: unknown,
  referenceVerses: Record<string, string>,
  index: number,
  warnings: string[],
): StetTerm | null {
  if (!isRecord(raw)) {
    warnings.push(`term[${index}] dropped: not an object`);
    return null;
  }
  const term = typeof raw.term === "string" ? raw.term.trim() : "";
  if (!term) {
    warnings.push(`term[${index}] dropped: missing "term"`);
    return null;
  }

  // Every field below is required by the schema. A term missing any is
  // malformed — omit it and report, rather than fabricate a valid-looking term
  // from defaults.
  const missing: string[] = [];
  if (typeof raw.englishTerm !== "string" || !raw.englishTerm.trim()) {
    missing.push("englishTerm");
  }
  if (typeof raw.definition !== "string") missing.push("definition");
  if (!Array.isArray(raw.strongs)) missing.push("strongs");
  if (!Array.isArray(raw.subsetVerses)) missing.push("subsetVerses");
  if (!Array.isArray(raw.exhaustiveVerses)) missing.push("exhaustiveVerses");
  if (!Array.isArray(raw.glosses)) missing.push("glosses");
  if (!isRecord(raw.glossRanges)) missing.push("glossRanges");
  if (missing.length > 0) {
    warnings.push(
      `term[${index}] "${term}" dropped: missing/invalid ${missing.join(", ")}`,
    );
    return null;
  }

  const englishTerm = (raw.englishTerm as string).trim();
  const definition = raw.definition as string;
  const strongs = (raw.strongs as unknown[]).filter(
    (n): n is number => typeof n === "number",
  );

  const subsetVerses: StetSubsetVerse[] = [];
  const seenSubset = new Set<string>();
  let droppedSubset = 0;
  for (const entry of raw.subsetVerses as unknown[]) {
    const sid = isRecord(entry) ? normalizeStetSid(entry.ref) : null;
    if (!sid) {
      droppedSubset += 1;
      continue;
    }
    if (seenSubset.has(sid)) continue; // dedup is intended, not a degradation
    seenSubset.add(sid);
    subsetVerses.push({
      ref: sid,
      sameTranslationGroup:
        isRecord(entry) && typeof entry.sameTranslationGroup === "string"
          ? entry.sameTranslationGroup
          : undefined,
    });
  }
  if (droppedSubset > 0) {
    warnings.push(
      `term[${index}] "${term}": dropped ${droppedSubset} invalid subset ref(s)`,
    );
  }

  const exhaustiveVerses: string[] = [];
  const seenExhaustive = new Set<string>();
  let droppedExhaustive = 0;
  for (const entry of raw.exhaustiveVerses as unknown[]) {
    const sid = normalizeStetSid(entry);
    if (!sid) {
      droppedExhaustive += 1;
      continue;
    }
    if (seenExhaustive.has(sid)) continue;
    seenExhaustive.add(sid);
    exhaustiveVerses.push(sid);
  }
  if (droppedExhaustive > 0) {
    warnings.push(
      `term[${index}] "${term}": dropped ${droppedExhaustive} invalid exhaustive ref(s)`,
    );
  }

  const glossRanges: Record<string, Array<[number, number]>> = {};
  let droppedRanges = 0;
  for (const [rawSid, rawRanges] of Object.entries(
    raw.glossRanges as Record<string, unknown>,
  )) {
    const rawCount = Array.isArray(rawRanges) ? rawRanges.length : 0;
    const sid = normalizeStetSid(rawSid);
    const text = sid ? referenceVerses[sid] : undefined;
    if (!sid || typeof text !== "string") {
      droppedRanges += rawCount;
      continue;
    }
    const ranges = sanitizeRanges(rawRanges, text.length);
    droppedRanges += rawCount - ranges.length;
    if (ranges.length > 0) glossRanges[sid] = ranges;
  }
  if (droppedRanges > 0) {
    warnings.push(
      `term[${index}] "${term}": dropped ${droppedRanges} out-of-bounds/overlapping gloss range(s)`,
    );
  }

  return {
    term,
    englishTerm,
    strongs,
    definition,
    subsetVerses,
    exhaustiveVerses,
    glosses: normalizeGlosses(raw.glosses),
    glossRanges,
  };
}

/**
 * Validate and normalize a raw envelope into a `StetCatalog`. Throws
 * `StetCatalogError` for fatal envelope problems (bad version/locale/reference/
 * referenceVerses/terms). Individual malformed terms are dropped and reported
 * in `warnings` rather than failing the whole catalog.
 */
export function parseStetCatalog(raw: unknown): StetCatalogParseResult {
  if (!isRecord(raw)) {
    throw new StetCatalogError("catalog is not an object");
  }
  if (raw.schemaVersion !== 1) {
    throw new StetCatalogError(
      `unsupported schemaVersion: ${raw.schemaVersion}`,
    );
  }
  if (typeof raw.locale !== "string" || !raw.locale.trim()) {
    throw new StetCatalogError("missing or invalid locale");
  }
  if (!SUPPORTED_STET_LOCALES.has(raw.locale)) {
    throw new StetCatalogError(`unsupported locale: ${raw.locale}`);
  }
  if (!isRecord(raw.reference)) {
    throw new StetCatalogError("missing reference metadata");
  }
  const { provenanceId, displayName, sourceUrl } = raw.reference;
  if (typeof provenanceId !== "string" || !provenanceId.trim()) {
    throw new StetCatalogError("reference.provenanceId is required");
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new StetCatalogError("reference.displayName is required");
  }
  if (!isRecord(raw.referenceVerses)) {
    throw new StetCatalogError("missing referenceVerses");
  }
  if (!Array.isArray(raw.terms)) {
    throw new StetCatalogError("missing terms array");
  }

  const warnings: string[] = [];

  // Normalize + dedupe verse text by canonical SID. Drop invalid keys.
  const referenceVerses: Record<string, string> = {};
  for (const [rawSid, text] of Object.entries(raw.referenceVerses)) {
    const sid = normalizeStetSid(rawSid);
    if (!sid) {
      warnings.push(`referenceVerses key dropped (invalid SID): ${rawSid}`);
      continue;
    }
    if (typeof text !== "string") continue;
    referenceVerses[sid] = text;
  }

  const terms: StetTerm[] = [];
  raw.terms.forEach((rawTerm, index) => {
    const term = normalizeTerm(rawTerm, referenceVerses, index, warnings);
    if (term) terms.push(term);
  });

  // Duplicate display labels are valid but ambiguous (no stable upstream id):
  // keep both, warn once per collision.
  const seenLabels = new Set<string>();
  for (const term of terms) {
    const key = term.term.toLowerCase();
    if (seenLabels.has(key)) {
      warnings.push(`duplicate term label: "${term.term}"`);
    } else {
      seenLabels.add(key);
    }
  }

  return {
    catalog: {
      schemaVersion: 1,
      locale: raw.locale,
      reference: {
        provenanceId,
        displayName,
        sourceUrl: typeof sourceUrl === "string" ? sourceUrl : undefined,
      },
      referenceVerses,
      terms,
    },
    warnings,
  };
}
