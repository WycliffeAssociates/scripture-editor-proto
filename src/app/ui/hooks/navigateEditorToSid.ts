import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";

import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { scrollToSidInEditor } from "@/app/ui/hooks/useSearchHighlighter.ts";
import { parseSid } from "@/core/data/bible/bible.ts";

/**
 * Verse-navigation seam. Switches to the chapter that owns `sid`
 * (`switchBookOrChapter` preserves dirty editor state before the swap), then
 * defers one microtask so the swapped chapter has rendered before scrolling the
 * verse into view with `scrollToSidInEditor` (a plain `[data-sid]` DOM lookup +
 * scroll — it carries no timing). The `queueMicrotask` defer is this helper's
 * own; Find's navigation has its own separate deferred path.
 *
 * `sid` must be a canonical single verse. Returns `false` without switching or
 * scrolling for a chapter-only or ranged reference (no single verse to land on)
 * or an unparseable SID, and `false` (after switching) when the chapter cannot
 * be opened (e.g. the book isn't in this project). Callers must treat a `false`
 * as "cannot navigate" and never fall back to another location.
 */
export function navigateEditorToSid(args: {
  editorRef: RefObject<LexicalEditor | null>;
  switchBookOrChapter: (
    file: string,
    chapter: number,
  ) => ScriptureChapterState | undefined;
  sid: string;
}): boolean {
  const parsed = parseSid(args.sid);
  if (
    !parsed ||
    parsed.isBookChapOnly ||
    parsed.verseStart !== parsed.verseEnd
  ) {
    return false;
  }

  const chapterState = args.switchBookOrChapter(parsed.book, parsed.chapter);
  if (!chapterState) return false;

  queueMicrotask(() => {
    const editor = args.editorRef.current;
    if (editor) scrollToSidInEditor(editor, args.sid);
  });
  return true;
}
