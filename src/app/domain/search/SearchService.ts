import { EDITOR_SHAPES } from "@/app/data/editor.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { reduceSerializedNodesToText } from "@/app/domain/search/search.utils.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { type ParsedReference, parseSid } from "@/core/data/bible/bible.ts";
import { searchChapters } from "@/core/domain/search/searchEngine.ts";
import type {
  SearchChapter,
  SearchHit,
  SearchQuery,
} from "@/core/domain/search/types.ts";

/**
 * App-facing scripture search orchestration.
 *
 * The core search engine only works on chapter text records. This module projects
 * the current scripture workspace into that search input shape, runs the query, and
 * maps hits back into rich UI results keyed by SID and source.
 */
export type SearchSource = "target" | "reference";

export type SearchResult = {
  sid: string;
  sidOccurrenceIndex: number;
  text: string;
  bibleIdentifier: string;
  chapNum: number;
  parsedSid: ParsedReference | null;
  isCaseMismatch: boolean;
  naturalIndex: number;
  source: SearchSource;
};

export type SearchContentProvider = {
  getTargetFiles: () => ScriptureBookState[];
  getReferenceFiles: () => ScriptureBookState[];
};

export function chapterKey(bookCode: string, chapterNum: number): string {
  return `${bookCode}:${chapterNum}`;
}

// Search indexes content by sid; the flat shape preserves every token's
// sid+text, so derive it from the canonical tokens (mode-independent).
function chapterFlatChildren(chapter: ScriptureChapterState) {
  return tokensToLexical({
    tokens: chapter.currentTokens,
    direction: chapter.direction,
    mode: EDITOR_SHAPES.flat,
  }).root.children;
}

export function listChapterKeys(files: ScriptureBookState[]): Set<string> {
  return new Set(
    files.flatMap((file) =>
      file.chapters.map((chapter) =>
        chapterKey(file.bookCode, chapter.chapterNumber),
      ),
    ),
  );
}

export function buildSearchChapters(args: {
  files: ScriptureBookState[];
  searchUSFM: boolean;
  restrictToChapterKeys?: Set<string>;
}): SearchChapter[] {
  const out: SearchChapter[] = [];

  for (const { file, chapter } of walkChapters(args.files)) {
    if (args.restrictToChapterKeys) {
      const key = chapterKey(file.bookCode, chapter.chapterNumber);
      if (!args.restrictToChapterKeys.has(key)) continue;
    }

    const sidRecord = reduceSerializedNodesToText(
      chapterFlatChildren(chapter),
      args.searchUSFM,
    );
    out.push({
      bookCode: file.bookCode,
      chapterNum: chapter.chapterNumber,
      nodes: Object.entries(sidRecord).map(([sid, text]) => ({
        sid,
        text,
      })),
    });
  }

  return out;
}

export function buildTargetSidTextLookup(args: {
  files: ScriptureBookState[];
  searchUSFM: boolean;
}): Map<string, string> {
  const sidToText = new Map<string, string>();

  for (const { chapter } of walkChapters(args.files)) {
    const sidRecord = reduceSerializedNodesToText(
      chapterFlatChildren(chapter),
      args.searchUSFM,
    );
    for (const [sid, text] of Object.entries(sidRecord)) {
      sidToText.set(sid, text);
    }
  }

  return sidToText;
}

function toSearchResult(hit: SearchHit, source: SearchSource): SearchResult {
  return {
    sid: hit.sid,
    sidOccurrenceIndex: hit.sidOccurrenceIndex,
    text: hit.text,
    bibleIdentifier: hit.bookCode,
    chapNum: hit.chapterNum,
    parsedSid: parseSid(hit.sid),
    isCaseMismatch: hit.isCaseMismatch,
    naturalIndex: hit.naturalIndex,
    source,
  };
}

export function runSearch(args: {
  chapters: SearchChapter[];
  query: SearchQuery;
  source: SearchSource;
}): SearchResult[] {
  return searchChapters(args.chapters, args.query).map((hit) =>
    toSearchResult(hit, args.source),
  );
}

export function findChapter(
  files: ScriptureBookState[],
  ref: { bookCode: string; chapterNum: number },
): ScriptureChapterState | undefined {
  const file = files.find((item) => item.bookCode === ref.bookCode);
  return file?.chapters.find(
    (chapter) => chapter.chapterNumber === ref.chapterNum,
  );
}
