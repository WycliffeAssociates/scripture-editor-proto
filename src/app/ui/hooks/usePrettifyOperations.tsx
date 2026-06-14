import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
  bookLineEnding,
  tokensToLexical,
  tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import {
  hideNotification,
  showNotificationInfo,
  showNotificationSuccess,
  showProgressNotification,
  updateProgressNotification,
} from "@/app/ui/components/primitives/notifications.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { MatchFormattingScope } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

/**
 * Higher-level formatting operations for the scripture workspace.
 *
 * These actions sit above the raw formatter/match-formatting engines. They decide
 * which chapters or books are in scope, wrap the mutation in history/lint/update
 * plumbing, and push the resulting lexical state back into the visible editor.
 */
export function useFormatOperations({
  workingFilesStore,
  interactionGate,
  currentFileBibleIdentifier,
  currentChapter,
  editorMode,
  setIsProcessing,
  history,
}: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  currentFileBibleIdentifier: string;
  currentChapter: number;
  editorMode: EditorModeSetting;
  setIsProcessing: (isProcessing: boolean) => void;
  history: CustomHistoryHook;
}) {
  const { t } = useLingui();
  const { usfmOnionService } = useRouter().options.context;

  type FormatScope = MatchFormattingScope;

  const workingShape = () => shapeForSurface("workingRebuild", editorMode);

  const chapterTokensForFormatting = (chapter: ScriptureChapterState) =>
    chapter.currentTokens;

  // Write the formatted result onto a checked-out chapter (per-chapter scope).
  const writeFormattedChapter = (
    chapter: ScriptureChapterState,
    tokens: ScriptureChapterState["currentTokens"],
  ) => {
    const direction =
      (chapter.lexicalState.root.direction ?? "ltr") === "rtl" ? "rtl" : "ltr";
    chapter.lexicalState = tokensToLexical({
      tokens,
      direction,
      mode: workingShape(),
    });
    chapter.currentTokens = tokens;
    chapter.dirty =
      tokensToUsfm(tokens, chapter.eol) !==
      tokensToUsfm(chapter.sourceTokens, chapter.eol);
  };

  // Rebuild a checked-out book wholesale from formatted tokens (book/project
  // scope — `rebuildParsedFileFromUsfm` replaces the chapters array).
  const writeFormattedBook = async (
    file: ScriptureBookState,
    tokens: ScriptureChapterState["currentTokens"],
  ) => {
    await rebuildParsedFileFromUsfm({
      targetFile: file,
      sourceUsfm: tokensToUsfm(tokens, bookLineEnding(file)),
      usfmOnionService,
      shape: workingShape(),
    });
  };

  async function prettify(
    scope: FormatScope,
    bookCode?: string,
    chapterNumber?: number,
  ) {
    setIsProcessing(true);
    let notificationId: string | null = null;
    try {
      // Read the current snapshot once. The bridge plugin keeps the
      // store fresh, so no flush is needed.
      //
      // All scopes go through `withWorkingFilesDraft`: chapter scope uses
      // the per-chapter OVERLAY commit; book and project scope use the
      // WORKSPACE commit because `rebuildParsedFileFromUsfm` replaces a
      // file's `chapters` array wholesale (can add/remove chapters) — a
      // structural rebuild the overlay can't model. See that module.
      const workingFiles = workingFilesStore.read();

      if (scope === "chapter") {
        const targetBookCode = bookCode || currentFileBibleIdentifier;
        const targetChapterNumber = chapterNumber ?? currentChapter;

        const file = workingFiles.find((f) => f.bookCode === targetBookCode);
        if (!file) return;

        // Only the target chapter needs to be writable; formatChapterInPlace
        // mutates just that chapter's lexicalState/currentTokens/dirty on the
        // scratch.
        const historyToken = history.captureHistory();
        const outcome = await withWorkingFilesDraft({
          workingFilesStore,
          interactionGate,
          commitMeta: {
            kind: "programmaticFix",
            action: "prettify",
            dirtyTextContent: true,
          },
          mutate: async (draft) => {
            const draftFile = draft
              .read()
              .find((f) => f.bookCode === targetBookCode);
            const chapter = draftFile?.chapters.find(
              (c) => c.chapterNumber === targetChapterNumber,
            );
            if (!chapter) return;
            const [result] = await usfmOnionService.formatScope([
              { tokens: chapterTokensForFormatting(chapter) },
            ]);
            if (!result.appliedChanges.length) return;
            const writable = draft.chapterForWrite({
              bookCode: targetBookCode,
              chapterNum: targetChapterNumber,
            });
            if (writable) writeFormattedChapter(writable, result.tokens);
          },
        });

        if (outcome.kind === "unchanged") {
          showNotificationInfo({
            notification: {
              title: t`Nothing changed`,
              message: t`This chapter is already formatted`,
            },
          });
          return;
        }
        if (outcome.kind === "committed") {
          showNotificationSuccess({
            notification: {
              title: t`Chapter Formatted`,
              message: t`Formatted ${file.title || file.bookCode} ${targetChapterNumber}`,
            },
          });
          history.recordHistory(historyToken, {
            label: t`Format Chapter (${targetBookCode} ${targetChapterNumber})`,
            affected: outcome.committedChapters,
          });
        }
        return;
      }

      if (scope === "book") {
        const targetBookCode = bookCode || currentFileBibleIdentifier;

        const file = workingFiles.find((f) => f.bookCode === targetBookCode);
        if (!file) return;

        // formatBookInPlace → rebuildParsedFileFromUsfm replaces the book's
        // chapters array wholesale, so this is a workspace-scope (validate-
        // then-bulk) commit, not a per-chapter overlay.
        const historyToken = history.captureHistory();
        const outcome = await withWorkingFilesDraft({
          workingFilesStore,
          interactionGate,
          commitMeta: {
            kind: "programmaticFix",
            action: "prettify",
            dirtyTextContent: true,
          },
          mutate: async (draft) => {
            const draftFile = draft
              .read()
              .find((f) => f.bookCode === targetBookCode);
            if (!draftFile) return;
            const [result] = await usfmOnionService.formatScope([
              {
                tokens: draftFile.chapters.flatMap((chapter) =>
                  chapterTokensForFormatting(chapter),
                ),
              },
            ]);
            if (!result.appliedChanges.length) return;
            const writableFile = draft.bookForWrite(targetBookCode);
            if (writableFile)
              await writeFormattedBook(writableFile, result.tokens);
          },
        });

        if (outcome.kind === "unchanged") {
          showNotificationInfo({
            notification: {
              title: t`Nothing changed`,
              message: t`This book is already formatted`,
            },
          });
          return;
        }
        if (outcome.kind === "committed") {
          showNotificationSuccess({
            notification: {
              title: t`Book Formatted`,
              message: t`Formatted ${file.title || file.bookCode}`,
            },
          });
          history.recordHistory(historyToken, {
            label: t`Format Book (${targetBookCode})`,
            affected: outcome.committedChapters,
          });
        }
        return;
      }

      const totalBooks = workingFiles.length;
      notificationId = showProgressNotification({
        title: t`Formatting Project`,
        message: t`Processing book 1 of ${totalBooks}...`,
      });
      const progressNotificationId = notificationId;
      if (!progressNotificationId) return;

      // The store snapshot is immutable from our side; it is the rollback
      // baseline returned for revertFormat.
      const previous = workingFilesStore.read();
      let modifiedBooksCount = 0;

      // Discovery flow: formatScope returns per-book results; we don't know
      // which books change until we see appliedChanges.
      // rebuildParsedFileFromUsfm replaces each touched book's `chapters` array
      // wholesale → workspace-scope commit.
      const historyToken = history.captureHistory();
      const outcome = await withWorkingFilesDraft({
        workingFilesStore,
        interactionGate,
        commitMeta: {
          kind: "programmaticFix",
          action: "prettify",
          dirtyTextContent: true,
        },
        mutate: async (draft) => {
          // Discovery flow: formatScope returns per-book results; we don't
          // know which books change until we see appliedChanges. Check each
          // changed book out and rebuild it wholesale.
          const books = draft.read();
          const batchResults = await usfmOnionService.formatScope(
            books.map((file) => ({
              tokens: file.chapters.flatMap((chapter) =>
                chapterTokensForFormatting(chapter),
              ),
            })),
          );

          const modifiedBookCodes = new Set<string>();
          for (let i = 0; i < books.length; i++) {
            const file = books[i];
            const result = batchResults[i];
            if (!result || !result.appliedChanges.length) continue;
            updateProgressNotification(progressNotificationId, {
              title: t`Formatting Project`,
              message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
            });
            const writableFile = draft.bookForWrite(file.bookCode);
            if (!writableFile) continue;
            await writeFormattedBook(writableFile, result.tokens);
            modifiedBookCodes.add(file.bookCode);
          }

          modifiedBooksCount = modifiedBookCodes.size;
          return { modifiedBookCodes };
        },
      });

      hideNotification(progressNotificationId);
      notificationId = null;
      if (outcome.kind === "committed") {
        showNotificationSuccess({
          notification: {
            title: t`Project Formatted`,
            message: t`Formatted ${modifiedBooksCount} book(s)`,
          },
        });
        history.recordHistory(historyToken, {
          label: t`Format Project`,
          affected: outcome.committedChapters,
        });
      } else if (outcome.kind === "unchanged") {
        showNotificationInfo({
          notification: {
            title: t`Nothing changed`,
            message: t`This project is already formatted`,
          },
        });
      }

      return previous;
    } finally {
      if (notificationId) hideNotification(notificationId);
      setIsProcessing(false);
    }
  }

  async function revertFormat(backup: ScriptureBookState[]) {
    workingFilesStore.commit({
      patch: { kind: "bulk", files: backup },
      meta: {
        kind: "import",
        action: "revertAll",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
  }

  return {
    prettifyChapter: (bookCode?: string, chapterNumber?: number) =>
      prettify("chapter", bookCode, chapterNumber),
    prettifyBook: (bookCode?: string) => prettify("book", bookCode),
    prettifyProject: () => prettify("project"),
    revertFormat,
  };
}
