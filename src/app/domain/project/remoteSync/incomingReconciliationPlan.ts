import {
  isDecisionUnit,
  iterateChapters,
  requiresExplicitPresenceDecision,
} from "@/app/domain/project/compare/decisionState.ts";
import type {
  CompareChapterDecisions,
  CompareDecisionsByBook,
  CompareResult,
  CompareSide,
  FrozenChapterComparison,
} from "@/app/domain/project/compare/types.ts";
import type { ChapterRef } from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type {
  DecisionUnit,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

export type DirtySemanticSidMap = Map<string, Set<string>>;

export const AUTO_ACCEPT_SCOPE_VALUES = [
  "project",
  "book",
  "chapter",
  "verse",
] as const;
export type AutoAcceptScope = (typeof AUTO_ACCEPT_SCOPE_VALUES)[number];

type ScopeSegment = { key: string; text: string };

function splitUsfmByMarker(args: {
  bookCode: string;
  text: string;
  scope: "chapter" | "verse";
}): ScopeSegment[] {
  const markerPattern = /\\(c|v)\s+([^\s\\]+)/gu;
  const occurrenceByAddress = new Map<string, number>();
  const segments: ScopeSegment[] = [];
  let chapter = "0";
  let verse = "0";
  let segmentStart = 0;
  let segmentAddress = `${args.bookCode}:0${args.scope === "verse" ? ":0" : ""}`;

  function pushSegment(end: number) {
    const occurrence = occurrenceByAddress.get(segmentAddress) ?? 0;
    occurrenceByAddress.set(segmentAddress, occurrence + 1);
    segments.push({
      key: `${segmentAddress}:${occurrence}`,
      text: args.text.slice(segmentStart, end),
    });
  }

  for (const match of args.text.matchAll(markerPattern)) {
    if (match.index === undefined) continue;
    const marker = match[1];
    if (marker === "v" && args.scope === "chapter") continue;
    pushSegment(match.index);
    if (marker === "c") {
      chapter = match[2];
      verse = "0";
    } else {
      verse = match[2];
    }
    segmentStart = match.index;
    segmentAddress =
      args.scope === "chapter"
        ? `${args.bookCode}:${chapter}`
        : `${args.bookCode}:${chapter}:${verse}`;
  }
  pushSegment(args.text.length);
  return segments;
}

function buildScopeText(args: {
  byBook: Map<string, string>;
  scope: AutoAcceptScope;
}) {
  if (args.scope === "project") {
    return new Map([
      [
        "project",
        JSON.stringify(
          [...args.byBook].sort(([left], [right]) => left.localeCompare(right)),
        ),
      ],
    ]);
  }
  if (args.scope === "book") return args.byBook;

  const scoped = new Map<string, string>();
  for (const [bookCode, text] of args.byBook) {
    for (const segment of splitUsfmByMarker({
      bookCode,
      text,
      scope: args.scope,
    })) {
      scoped.set(segment.key, segment.text);
    }
  }
  return scoped;
}

function collectChangedScopeKeys(args: {
  baseByBook: Map<string, string>;
  targetByBook: Map<string, string>;
  scope: AutoAcceptScope;
}) {
  const base = buildScopeText({ byBook: args.baseByBook, scope: args.scope });
  const target = buildScopeText({
    byBook: args.targetByBook,
    scope: args.scope,
  });
  const keys = new Set([...base.keys(), ...target.keys()]);
  return new Set(
    [...keys].filter(
      (key) => (base.get(key) ?? null) !== (target.get(key) ?? null),
    ),
  );
}

export function buildDivergedAutoAcceptScopePlan(args: {
  baseByBook: Map<string, string>;
  localByBook: Map<string, string>;
  remoteByBook: Map<string, string>;
  scope: AutoAcceptScope;
}) {
  const local = collectChangedScopeKeys({
    baseByBook: args.baseByBook,
    targetByBook: args.localByBook,
    scope: args.scope,
  });
  const remote = collectChangedScopeKeys({
    baseByBook: args.baseByBook,
    targetByBook: args.remoteByBook,
    scope: args.scope,
  });
  const protectedAddresses = new Set(local);
  const overlapAddresses = new Set(
    [...protectedAddresses].filter((key) => remote.has(key)),
  );
  const acceptedAddresses = new Set(
    [...remote].filter((key) => !protectedAddresses.has(key)),
  );
  return {
    scope: args.scope,
    localChangedAddresses: local,
    remoteChangedAddresses: remote,
    protectedAddresses,
    overlapAddresses,
    acceptedAddresses,
    hasOverlap: overlapAddresses.size > 0,
  };
}

/** Structural removals always require review, independent of overlap scope. */
export function hasWholeBookOrChapterDeletion(args: {
  baseByBook: Map<string, string>;
  remoteByBook: Map<string, string>;
}) {
  for (const bookCode of args.baseByBook.keys()) {
    if (!args.remoteByBook.has(bookCode)) return true;
  }
  const baseChapters = buildScopeText({
    byBook: args.baseByBook,
    scope: "chapter",
  });
  const remoteChapters = buildScopeText({
    byBook: args.remoteByBook,
    scope: "chapter",
  });
  for (const key of baseChapters.keys()) {
    const address = key.slice(0, key.lastIndexOf(":"));
    if (address.endsWith(":0")) continue;
    if (!remoteChapters.has(key)) return true;
  }
  return false;
}

export function hasCompareChanges(result: CompareResult | null | undefined) {
  return (result?.changedUnitCount ?? 0) > 0;
}

export function listChangedChapterRefs(result: CompareResult): ChapterRef[] {
  const refs: ChapterRef[] = [];
  for (const chapter of iterateChapters(result)) {
    if (
      chapter.left.present !== chapter.right.present ||
      chapter.skeleton.units.some(isDecisionUnit)
    ) {
      refs.push(chapter.address);
    }
  }
  return refs;
}

export function buildChapterKey(bookCode: string, chapterNum: number) {
  return `${bookCode}:${chapterNum}`;
}

function addTokenSids(target: Set<string>, tokens: readonly Token[]) {
  for (const token of tokens) if (token.sid) target.add(token.sid);
}

/**
 * Conservatively collect every semantic address a changed skeleton unit can
 * represent. Moved/covered units may carry their overlap address outside the
 * primary baseline/current SID, so all token SIDs and coveredBy are included.
 */
export function collectUnitSemanticAddresses(unit: DecisionUnit): Set<string> {
  const addresses = new Set<string>();
  if (unit.baselineSid) addresses.add(unit.baselineSid);
  if (unit.currentSid) addresses.add(unit.currentSid);
  if (unit.coveredBy?.sid) addresses.add(unit.coveredBy.sid);
  addTokenSids(addresses, unit.baselineTokens);
  addTokenSids(addresses, unit.currentTokens);
  return addresses;
}

export function collectChangedSkeletonSemanticAddresses(
  skeleton: DiffSkeleton,
): Set<string> {
  const addresses = new Set<string>();
  for (const unit of skeleton.units) {
    if (!isDecisionUnit(unit)) continue;
    for (const sid of collectUnitSemanticAddresses(unit)) addresses.add(sid);
  }
  return addresses;
}

function hasAddressOverlap(
  unit: DecisionUnit,
  dirtyAddresses: ReadonlySet<string>,
) {
  for (const sid of collectUnitSemanticAddresses(unit)) {
    if (dirtyAddresses.has(sid)) return true;
  }
  return false;
}

function chapterSide(chapter: FrozenChapterComparison, side: CompareSide) {
  return side === "left" ? chapter.left : chapter.right;
}

export type AutoAcceptIncomingDecisionPlan = Readonly<{
  decisions: CompareDecisionsByBook;
  autoAcceptedUnitCount: number;
  blockedUnitCount: number;
  touchedChapters: readonly ChapterRef[];
}>;

/**
 * Produce one complete decision map for Onion projection. Safe remote units
 * select the incoming side; dirty-overlapping units and all whole chapter/book
 * removals select Working. The projected artifact can therefore be committed
 * atomically without sequential hunk rebasing.
 */
export function buildAutoAcceptIncomingDecisionPlan(args: {
  snapshot: CompareResult;
  dirtySemanticSidsByChapter: DirtySemanticSidMap;
}): AutoAcceptIncomingDecisionPlan {
  const workingSide = args.snapshot.sources.writableSide;
  if (workingSide === null) {
    throw new Error("Incoming auto-accept requires a writable working side.");
  }
  const incomingSide: CompareSide = workingSide === "left" ? "right" : "left";
  const byBook: Record<string, Record<number, CompareChapterDecisions>> = {};
  const touchedChapters: ChapterRef[] = [];
  let autoAcceptedUnitCount = 0;
  let blockedUnitCount = 0;

  for (const chapter of iterateChapters(args.snapshot)) {
    const dirtyAddresses =
      args.dirtySemanticSidsByChapter.get(
        buildChapterKey(chapter.address.bookCode, chapter.address.chapterNum),
      ) ?? new Set<string>();
    const deletesWholeChapter =
      chapterSide(chapter, workingSide).present &&
      !chapterSide(chapter, incomingSide).present;
    const units: Record<string, CompareSide> = {};
    let chapterAccepted = false;

    for (const unit of chapter.skeleton.units) {
      if (!isDecisionUnit(unit)) continue;
      const blocked =
        deletesWholeChapter || hasAddressOverlap(unit, dirtyAddresses);
      units[unit.id] = blocked ? workingSide : incomingSide;
      if (blocked) blockedUnitCount += 1;
      else {
        autoAcceptedUnitCount += 1;
        chapterAccepted = true;
      }
    }

    let presence: CompareSide | null = null;
    if (requiresExplicitPresenceDecision(chapter)) {
      if (deletesWholeChapter) {
        presence = workingSide;
        blockedUnitCount += 1;
      } else {
        presence = incomingSide;
        autoAcceptedUnitCount += 1;
        chapterAccepted = true;
      }
    }
    if (chapterAccepted) touchedChapters.push(chapter.address);
    (byBook[chapter.address.bookCode] ??= {})[chapter.address.chapterNum] =
      Object.freeze({ units: Object.freeze(units), presence });
  }

  for (const chapters of Object.values(byBook)) Object.freeze(chapters);
  return Object.freeze({
    decisions: Object.freeze(byBook),
    autoAcceptedUnitCount,
    blockedUnitCount,
    touchedChapters: Object.freeze(touchedChapters),
  });
}

export function extractBookCodeFromStorageKey(
  storageKey: string,
): string | null {
  if (!storageKey.endsWith(".usfm")) return null;
  const fileName = storageKey.split("/").pop() ?? storageKey;
  const withDashMatch = fileName.match(/-([A-Za-z0-9]{3})\.usfm$/);
  if (withDashMatch?.[1]) return withDashMatch[1].toUpperCase();
  const plainMatch = fileName.match(/^([A-Za-z0-9]{3})\.usfm$/);
  return plainMatch?.[1]?.toUpperCase() ?? null;
}

export function buildBookTextByCodeFromSnapshot(snapshot: Map<string, string>) {
  const byBook = new Map<string, string>();
  for (const [storageKey, text] of snapshot.entries()) {
    const bookCode = extractBookCodeFromStorageKey(storageKey);
    if (bookCode) byBook.set(bookCode, text);
  }
  return byBook;
}

export function buildBookTextByCodeFromScriptureFiles(
  files: ScriptureBookState[],
) {
  const byBook = new Map<string, string>();
  for (const file of files) {
    let usfmText = "";
    for (const chapter of file.chapters) {
      for (const token of chapter.currentTokens) usfmText += token.source ?? "";
    }
    byBook.set(file.bookCode.toUpperCase(), usfmText);
  }
  return byBook;
}

export function collectChangedBookCodes(args: {
  baseByBook: Map<string, string>;
  targetByBook: Map<string, string>;
}) {
  const keys = new Set([
    ...args.baseByBook.keys(),
    ...args.targetByBook.keys(),
  ]);
  return new Set(
    [...keys].filter(
      (bookCode) =>
        (args.baseByBook.get(bookCode) ?? null) !==
        (args.targetByBook.get(bookCode) ?? null),
    ),
  );
}
