// historySelection.ts
//
// Selection + scroll helpers for the undo/redo history layer. Kept out of the
// hook so the hook stays orchestration, not DOM/Lexical plumbing.
//
// `CapturedSelection` itself lives in `state/types.ts` — selection is a
// commit fact the WorkingFilesStore records (see the rationale there); this
// module owns the Lexical-side capture/restore mechanics.

import { $dfsIterator } from "@lexical/utils";
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  type LexicalNode,
  type PointType,
} from "lexical";

import {
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { CanonicalChapterSnapshot } from "@/app/domain/history/canonicalChapterState.ts";
import type { CapturedSelection } from "@/app/state/types.ts";

export type { CapturedSelection };

export type ChapterCursor = CapturedSelection | null;

function cursorsEqual(a: ChapterCursor, b: ChapterCursor): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.anchorId === b.anchorId &&
    a.anchorOffset === b.anchorOffset &&
    a.focusId === b.focusId &&
    a.focusOffset === b.focusOffset
  );
}

/**
 * Typing-run boundary policy for history coalescing: an edit continues the
 * current run only if the cursor sits exactly where the previous edit left
 * it — any repositioning (click, arrow keys, jump to another verse) means
 * the user started a new edit, which should be its own undo unit.
 *
 * Two witnesses, because the obvious one can lie: the browser dispatches
 * `selectionchange` asynchronously, so under fast input a keystroke can land
 * BEFORE the editor state learns the cursor moved — the before-cursor then
 * still matches the run's end while the edit actually went elsewhere. The
 * edit site (`nextSelectionAfter`) is set by the update itself and is never
 * stale, so a run is contiguous only if the before-cursor matches AND the
 * edit landed in the node the run was editing. Unreadable selections defer
 * to the time window alone rather than fragmenting runs on capture gaps.
 */
export function typingRunContiguous(
  latestSelectionAfter: ChapterCursor | undefined,
  nextSelectionBefore: ChapterCursor | undefined,
  nextSelectionAfter: ChapterCursor | undefined,
): boolean {
  const runEnd = latestSelectionAfter ?? null;
  const before = nextSelectionBefore ?? null;
  if (runEnd === null) {
    // An entry that doesn't know where it left the cursor can't claim a
    // keystroke that knows where it began. This covers EVERY
    // selectionless run-end, deliberately: load-time fixup write-backs
    // that record selectionless entries, and mid-run capture failures
    // (IME/composition states). Sealing costs at most a finer undo
    // unit; merging would leave the combined run's selectionBefore
    // unknown — the asymmetry favors sealing. Only when BOTH sides are
    // unreadable does the time window alone decide.
    return before === null;
  }
  if (before !== null && !cursorsEqual(runEnd, before)) return false;
  const editSite = nextSelectionAfter ?? null;
  if (editSite !== null && editSite.anchorId !== runEnd.anchorId) {
    return false;
  }
  return true;
}

/**
 * Walk up from the contenteditable to find the nearest scrolling ancestor.
 * Used so undo/redo can snapshot + restore scroll position across an editor
 * state swap.
 */
export function findScrollAncestor(
  start: HTMLElement | null,
): HTMLElement | null {
  let current: HTMLElement | null = start;
  while (current) {
    const cs = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll|overlay)/.test(cs.overflowY) &&
      current.scrollHeight > current.clientHeight;
    if (canScrollY) return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Dev-only visibility into capture failures. A null capture costs cursor
 * fidelity downstream (undo/redo restores fall back to weaker data), so dev
 * builds log which selection shape failed to resolve.
 */
function debugCaptureNull(reason: string): null {
  if (import.meta.env.DEV) {
    console.debug(`[historySelection] capture returned null: ${reason}`);
  }
  return null;
}

/**
 * Dev-only visibility into restore give-ups — same lost-fidelity class as
 * capture-null: when every restore strategy fails the caret silently stays
 * at chapter start, and without this log there is no trace of why.
 */
export function debugRestoreGaveUp(reason: string): void {
  if (import.meta.env.DEV) {
    console.debug(`[historySelection] restore gave up: ${reason}`);
  }
}

function $lastUsfmTextWithin(node: LexicalNode): USFMTextNode | null {
  if ($isUSFMTextNode(node)) return node;
  if (!$isElementNode(node)) return null;
  for (let i = node.getChildrenSize() - 1; i >= 0; i--) {
    const child = node.getChildAtIndex(i);
    const found = child ? $lastUsfmTextWithin(child) : null;
    if (found) return found;
  }
  return null;
}

function $firstUsfmTextWithin(node: LexicalNode): USFMTextNode | null {
  if ($isUSFMTextNode(node)) return node;
  if (!$isElementNode(node)) return null;
  for (let i = 0; i < node.getChildrenSize(); i++) {
    const child = node.getChildAtIndex(i);
    const found = child ? $firstUsfmTextWithin(child) : null;
    if (found) return found;
  }
  return null;
}

/**
 * Resolve a selection point to a USFMTextNode + offset. Text points on USFM
 * nodes pass through; element points (post-Enter, IME composition, clicks on
 * structural nodes) map to the nearest text position — end of the content
 * before the point, else start of the content after it.
 */
function $resolvePointToUsfmText(
  point: PointType,
): { node: USFMTextNode; offset: number } | null {
  const node = point.getNode();
  if ($isUSFMTextNode(node)) return { node, offset: point.offset };
  if (!$isElementNode(node)) return null;
  const childCount = node.getChildrenSize();
  for (let i = Math.min(point.offset, childCount) - 1; i >= 0; i--) {
    const child = node.getChildAtIndex(i);
    const found = child ? $lastUsfmTextWithin(child) : null;
    if (found) return { node: found, offset: found.getTextContentSize() };
  }
  for (let i = point.offset; i < childCount; i++) {
    const child = node.getChildAtIndex(i);
    const found = child ? $firstUsfmTextWithin(child) : null;
    if (found) return { node: found, offset: 0 };
  }
  return null;
}

/**
 * Read the current Lexical selection (range selections only) and capture
 * its anchor/focus by USFMTextNode `data-id`. Element-node points are mapped
 * to the nearest text position rather than dropped. Returns null when there's
 * genuinely nothing to preserve (non-range selection, no resolvable text
 * around the point, or nodes lack ids). MUST be called from inside
 * `editor.read` or `editor.update`.
 */
export function $captureCurrentSelection(): CapturedSelection | null {
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) {
    return sel === null ? null : debugCaptureNull("non-range selection");
  }
  const anchor = $resolvePointToUsfmText(sel.anchor);
  const focus = $resolvePointToUsfmText(sel.focus);
  if (!anchor || !focus) return debugCaptureNull("unresolvable point");
  const anchorId = anchor.node.getId();
  const focusId = focus.node.getId();
  if (!anchorId || !focusId) return debugCaptureNull("missing data-id");
  return {
    anchorId,
    anchorOffset: anchor.offset,
    focusId,
    focusOffset: focus.offset,
  };
}

/**
 * Find USFMTextNodes in the current editor state by `data-id`. Single
 * DFS walk, returns both anchor and focus nodes (which may be the same).
 * MUST be called from inside `editor.read` or `editor.update`.
 */
function $findUsfmTextNodesById(
  anchorId: string,
  focusId: string,
): { anchorNode: USFMTextNode | null; focusNode: USFMTextNode | null } {
  let anchorNode: USFMTextNode | null = null;
  let focusNode: USFMTextNode | null = null;
  for (const dfsNode of $dfsIterator($getRoot())) {
    const node = dfsNode.node;
    if (!$isUSFMTextNode(node)) continue;
    const id = node.getId();
    if (anchorNode === null && id === anchorId) anchorNode = node;
    if (focusNode === null && id === focusId) focusNode = node;
    if (anchorNode && focusNode) break;
  }
  return { anchorNode, focusNode };
}

/**
 * Restore selection by `data-id` after a state replay. If both anchor
 * and focus nodes are found in the new tree, set a RangeSelection at the
 * same (clamped) offsets. If either is missing (the change deleted the
 * node the cursor was sitting on), leave the selection cleared — the
 * caller can then fall back to `$restoreSelectionNearId`. MUST be called
 * from inside `editor.update`.
 */
export function $restoreSelectionById(captured: CapturedSelection): boolean {
  const { anchorNode, focusNode } = $findUsfmTextNodesById(
    captured.anchorId,
    captured.focusId,
  );
  if (!anchorNode || !focusNode) return false;
  const sel = $createRangeSelection();
  const anchorTextLen = anchorNode.getTextContentSize();
  const focusTextLen = focusNode.getTextContentSize();
  sel.anchor.set(
    anchorNode.getKey(),
    Math.min(captured.anchorOffset, anchorTextLen),
    "text",
  );
  sel.focus.set(
    focusNode.getKey(),
    Math.min(captured.focusOffset, focusTextLen),
    "text",
  );
  $setSelection(sel);
  return true;
}

/**
 * Document-ordered `data-id`s of the text nodes in a canonical snapshot.
 * Serialized text nodes are identified structurally (`text` + `id` string
 * fields) so this stays decoupled from node-class type names. Used as the
 * reference ordering for `$restoreSelectionNearId` — the snapshot of the
 * tree a replay is LEAVING still contains a now-deleted id, so it can say
 * which surviving ids were its neighbors.
 */
export function orderedTextIdsFromSnapshot(
  snapshot: CanonicalChapterSnapshot,
): string[] {
  const ids: string[] = [];
  const visit = (node: object) => {
    const candidate = node as {
      id?: unknown;
      text?: unknown;
      children?: unknown;
    };
    if (
      typeof candidate.id === "string" &&
      candidate.id.length > 0 &&
      typeof candidate.text === "string"
    ) {
      ids.push(candidate.id);
    }
    if (Array.isArray(candidate.children)) {
      for (const child of candidate.children) {
        if (child && typeof child === "object") visit(child);
      }
    }
  };
  for (const node of snapshot.flatNodes) visit(node);
  return ids;
}

/**
 * Restore-failure fallback: the captured anchor's node no longer exists in
 * the replayed tree, so place a caret on the nearest SURVIVING text node in
 * document order — at the end of the closest preceding neighbor (preferred:
 * that's where a deletion collapses to), else the start of the closest
 * following one. `orderedIds` comes from `orderedTextIdsFromSnapshot` on the
 * tree being left. Returns false when the dead id isn't in the ordering or
 * no neighbor survives. MUST be called from inside `editor.update`.
 */
export function $restoreSelectionNearId(
  deadId: string,
  orderedIds: string[],
): boolean {
  const deadIndex = orderedIds.indexOf(deadId);
  if (deadIndex === -1) return false;
  const live = new Map<string, USFMTextNode>();
  for (const dfsNode of $dfsIterator($getRoot())) {
    const node = dfsNode.node;
    if (!$isUSFMTextNode(node)) continue;
    const id = node.getId();
    if (id && !live.has(id)) live.set(id, node);
  }
  for (let distance = 1; distance < orderedIds.length; distance++) {
    const beforeId = orderedIds[deadIndex - distance];
    const beforeNode = beforeId ? live.get(beforeId) : undefined;
    if (beforeNode) {
      return $setCaret(beforeNode, beforeNode.getTextContentSize());
    }
    const afterId = orderedIds[deadIndex + distance];
    const afterNode = afterId ? live.get(afterId) : undefined;
    if (afterNode) return $setCaret(afterNode, 0);
  }
  return false;
}

function $setCaret(node: USFMTextNode, offset: number): boolean {
  const sel = $createRangeSelection();
  sel.anchor.set(node.getKey(), offset, "text");
  sel.focus.set(node.getKey(), offset, "text");
  $setSelection(sel);
  return true;
}
