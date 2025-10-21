import {parseSid} from "@/core/data/bible/bible";
import {LintErrorKeys} from "@/core/data/usfm/lint";
import {ALL_USFM_MARKERS, VALID_NOTE_MARKERS} from "@/core/data/usfm/tokens";
import {markerTrimNoSlash, TokenMap} from "@/core/domain/usfm/lex";
import type {BaseTokenContext} from "@/core/domain/usfm/parse-v2";

export function lint(ctx: BaseTokenContext) {
  lintChapterLabels(ctx);
  lintVerseContentNotEmpty(ctx);
  lintTextFollowsVerseRange(ctx);
  lintVerseRanges(ctx);
  lintCheckForDuplicateChapNum(ctx);
  lintIsUnknownMarker(ctx);
}

export function lintChapterLabels(ctx: BaseTokenContext) {
  const token = ctx.currentToken;
  if (!token?.text) return;

  const isMarker = token.tokenType === TokenMap.marker;
  const isClMarker = markerTrimNoSlash(token.text) === "cl";
  if (!isMarker || !isClMarker) return;

  let nextText = ctx.nextToken?.text?.trim();
  if (!nextText) return;

  // Strip numbers (e.g. "Chapter 3" → "Chapter")
  const hasNum = nextText.match(/[0-9]/);
  if (hasNum && typeof hasNum.index === "number") {
    nextText = nextText.substring(0, hasNum.index).trim();
  }

  const labels = ctx.foundChapterLabels;
  if (!labels.map.has(nextText)) {
    labels.map.set(nextText, []);
    labels.order.push(nextText);
  }
  labels.map.get(nextText)?.push(token);

  // --- Check for inconsistencies
  if (labels.map.size > 1) {
    const canonical = labels.order[0];
    const badOnes = labels.order.slice(1);
    for (const bad of badOnes) {
      const badTokens = labels.map.get(bad);
      if (!badTokens) continue;
      for (const token of badTokens) {
        const msg = `Multiple chapter labels found: '${canonical}' and '${bad}'`;
        ctx.errorMessages.push({
          message: msg,
          sid: token.sid ?? "unknown location",
          msgKey: LintErrorKeys.inconsistentChapterLabel,
          nodeId: token.id,
        });
      }
      // also attach to the current token (if it’s one of the “bad” ones)
      token.lintErrors ??= [];
      token.lintErrors.push({
        message: `Inconsistent chapter label: expected '${canonical}', found '${bad}' at ${token.sid}`,
        sid: token.sid ?? "unknown location",
        msgKey: LintErrorKeys.inconsistentChapterLabel,
        nodeId: token.id,
      });
    }
  }
}

export function checkForVerseRangeAfterVerseMarker(ctx: BaseTokenContext) {
  const token = ctx.currentToken;
  if (!token?.marker) return;
  const isVerseRangeMarker = markerTrimNoSlash(token.text) === "v";
  const nextMarkerType = ctx.nextToken?.tokenType;
  if (isVerseRangeMarker && nextMarkerType !== TokenMap.numberRange) {
    const text = ctx.currentToken?.text;
    if (!text) return;
    const err = {
      message: `Verse range expected after \\v`,
      sid: ctx.currentToken?.sid ?? "unknown location",
      msgKey: LintErrorKeys.verseRangeExpectedAfterVerseMarker,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
  }
}

export function lintCheckForDuplicateChapNum(ctx: BaseTokenContext) {
  const token = ctx.currentToken;
  if (!token?.text) return;
  const marker = markerTrimNoSlash(token?.text);
  if (!marker) return;
  if (marker !== "c") return;
  const nextMarkerType = ctx.nextToken?.tokenType;
  if (nextMarkerType !== TokenMap.numberRange) {
    const err = {
      message: `Number range expected after \\c`,
      sid: ctx.currentToken?.sid ?? "unknown location",
      msgKey: LintErrorKeys.numberRangeAfterChapterMarker,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
    return;
  }
  const nextVal = ctx.nextToken?.text.trim() ?? "";
  const prevChapSeen = ctx.lintChapters.seen.has(nextVal);
  const prevChapSaw = ctx.lintChapters.list.at(-1);
  if (prevChapSeen && prevChapSaw) {
    const err = {
      message: `Duplicate chapter number ${nextVal}`,
      sid: token.sid ?? "unknown location",
      msgKey: LintErrorKeys.duplicateChapterNumber,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
  }
  const expected = prevChapSaw ? parseInt(prevChapSaw, 10) + 1 : 1;
  if (nextVal !== expected.toString()) {
    const err = {
      message: `Expected chapter number ${expected}, found ${nextVal}`,
      sid: token.sid ?? "unknown location",
      msgKey: LintErrorKeys.chapExpectedIncreaseByOne,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
  }
  ctx.lintChapters.seen.add(nextVal);
  ctx.lintChapters.list.push(nextVal);
}

export function lintVerseRanges(ctx: BaseTokenContext) {
  const token = ctx.currentToken;
  if (!token?.text) return;
  // only check verse ranges following a verse marker
  if (token.tokenType !== TokenMap.numberRange) return;
  if (markerTrimNoSlash(ctx.prevToken?.text ?? "") !== "v") return;
  const curChapter = ctx.mutCurChap;
  if (!curChapter) return;

  const value = token.text.trim();
  const [startStr, endStr] = value.split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : start;

  // Initialize per-chapter data if missing
  if (!ctx.lintVerseNums.byChapter.has(curChapter)) {
    ctx.lintVerseNums.byChapter.set(curChapter, {
      seen: new Set<string>(),
      last: 0,
    });
  }

  const chapterState = ctx.lintVerseNums.byChapter.get(curChapter);
  if (!chapterState) return;
  const key = `${curChapter}:${start}-${end}`;
  const prevLast = chapterState.last ?? 0;

  // --- Duplicate check
  if (chapterState.seen.has(key)) {
    const err = {
      message: `Duplicate verse number ${value}`,
      sid: token.sid ?? "unknown location",
      msgKey: LintErrorKeys.duplicateVerseNumber,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
  }

  // --- Continuity check
  const expectedStart = prevLast + 1;
  if (start !== expectedStart) {
    const err = {
      message: `Expected verse ${expectedStart}, found ${start}`,
      sid: token.sid ?? "unknown location",
      msgKey: LintErrorKeys.verseExpectedIncreaseByOne,
      nodeId: token.id,
    };
    ctx.errorMessages.push(err);
    token.lintErrors ??= [];
    token.lintErrors.push(err);
  }

  // --- Record state
  for (let v = start; v <= end; v++) {
    chapterState.seen.add(`${curChapter}:${v}`);
  }
  chapterState.last = end;
}

export function lintVerseContentNotEmpty(ctx: BaseTokenContext) {
  // when in text and prev was verse
  if (ctx.currentToken?.tokenType !== TokenMap.text) return;
  if (!ctx.prevToken) return;
  if (markerTrimNoSlash(ctx.prevToken.text ?? "") !== "v") return;
  if (!ctx.currentToken.text?.trim()) {
    const err = {
      message: `Verse content expected after \\v and range ${ctx.prevToken.value}`,
      sid: ctx.currentToken?.sid ?? "unknown location",
      msgKey: LintErrorKeys.verseContentNotEmpty,
      nodeId: ctx.currentToken?.id,
    };
    ctx.errorMessages.push(err);
    ctx.currentToken.lintErrors ??= [];
    ctx.currentToken.lintErrors.push(err);
  }
}

export function lintTextFollowsVerseRange(ctx: BaseTokenContext) {
  if (!ctx.currentToken) return;
  // in a verse range
  if (ctx.currentToken.tokenType !== TokenMap.numberRange) return;
  const sidParsed = parseSid(ctx.currentToken.sid ?? "");
  if (!sidParsed || sidParsed.isBookChapOnly) return;

  const nextToken = ctx.nextToken;
  if (!nextToken) return;
  if (
    nextToken.tokenType === TokenMap.marker &&
    VALID_NOTE_MARKERS.has(markerTrimNoSlash(nextToken.text))
  ) {
    // if there token following isn't text, but is a note, good chance this is intentionally empty and noted
    return;
  }
  if (nextToken.tokenType !== TokenMap.text) {
    const err = {
      message: `Expected verse content expected after \\v. Location: ${ctx.currentToken.sid}`,
      sid: ctx.currentToken?.sid ?? "unknown location",
      msgKey: LintErrorKeys.verseTextFollowsVerseRange,
      nodeId: ctx.currentToken?.id,
    };
    ctx.errorMessages.push(err);
    ctx.currentToken.lintErrors ??= [];
    ctx.currentToken.lintErrors.push(err);
  }
}

export function lintIsUnknownMarker(ctx: BaseTokenContext) {
  if (!ctx.currentToken) return;
  if (ctx.currentToken.tokenType !== TokenMap.marker) {
    return;
  }

  if (ALL_USFM_MARKERS.has(ctx.currentToken.value)) return;
  const err = {
    message: `Unknown marker ${ctx.currentToken.value}`,
    sid: ctx.currentToken?.sid ?? "unknown location",
    msgKey: LintErrorKeys.isUnknownMarker,
    nodeId: ctx.currentToken.id,
  };
  ctx.errorMessages.push(err);
  ctx.currentToken.lintErrors ??= [];
  ctx.currentToken.lintErrors.push(err);
}

function nearbyTokenText(ctx: BaseTokenContext) {
  return `${ctx.prevToken?.text} ${ctx.currentToken?.text} ${ctx.nextToken?.text} ${ctx.twoFromCurrent?.text}`;
}
