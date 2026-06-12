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
import {
  allChapterRefs,
  type ChapterRef,
  chapterRefsForBook,
} from "@/app/domain/project/workingFileMutations.ts";
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

  const formatChapterInPlace = async (
    file: ScriptureBookState,
    chapterNum: number,
  ) => {
    const chapter = file.chapters.find((c) => c.chapterNumber === chapterNum);
    if (!chapter) return { changed: false as const };

    const chapterTokens = chapterTokensForFormatting(chapter);
    const [result] = await usfmOnionService.formatScope([
      { tokens: chapterTokens },
    ]);
    if (!result.appliedChanges.length) return { changed: false as const };

    const direction =
      (chapter.lexicalState.root.direction ?? "ltr") === "rtl" ? "rtl" : "ltr";
    chapter.lexicalState = tokensToLexical({
      tokens: result.tokens,
      direction,
      mode: workingShape(),
    });
    chapter.currentTokens = result.tokens;
    chapter.dirty =
      tokensToUsfm(result.tokens, chapter.eol) !==
      tokensToUsfm(chapter.sourceTokens, chapter.eol);
    return { changed: true as const };
  };

  const formatBookInPlace = async (file: ScriptureBookState) => {
    const baselineTokens = file.chapters.flatMap((chapter) =>
      chapterTokensForFormatting(chapter),
    );
    const [result] = await usfmOnionService.formatScope([
      { tokens: baselineTokens },
    ]);
    if (!result.appliedChanges.length) return { changed: false as const };

    const nextBookUsfm = tokensToUsfm(result.tokens, bookLineEnding(file));
    await rebuildParsedFileFromUsfm({
      targetFile: file,
      sourceUsfm: nextBookUsfm,
      usfmOnionService,
      shape: workingShape(),
    });
    return { changed: true as const };
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

        await history.runTransaction({
          label: t`Format Chapter (${targetBookCode} ${targetChapterNumber})`,
          candidates: [
            {
              bookCode: targetBookCode,
              chapterNum: targetChapterNumber,
            },
          ],
          run: async () => {
            // Only the target chapter needs to be writable;
            // formatChapterInPlace mutates just that chapter's
            // lexicalState/currentTokens/dirty on the scratch.
            const outcome = await withWorkingFilesDraft({
              workingFilesStore,
              interactionGate,
              draftRefs: [
                {
                  bookCode: targetBookCode,
                  chapterNum: targetChapterNumber,
                },
              ],
              commitMeta: {
                kind: "programmaticFix",
                action: "prettify",
                dirtyTextContent: true,
              },
              mutate: async (scratch) => {
                const draftFile = scratch.find(
                  (f) => f.bookCode === targetBookCode,
                );
                if (!draftFile) {
                  return { affected: [], value: undefined };
                }
                const result = await formatChapterInPlace(
                  draftFile,
                  targetChapterNumber,
                );
                return {
                  affected: result.changed
                    ? [
                        {
                          bookCode: targetBookCode,
                          chapterNum: targetChapterNumber,
                        },
                      ]
                    : [],
                  value: undefined,
                };
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
            }
          },
        });
        return;
      }

      if (scope === "book") {
        const targetBookCode = bookCode || currentFileBibleIdentifier;

        const file = workingFiles.find((f) => f.bookCode === targetBookCode);
        if (!file) return;

        await history.runTransaction({
          label: t`Format Book (${targetBookCode})`,
          candidates: chapterRefsForBook(file),
          run: async () => {
            // formatBookInPlace → rebuildParsedFileFromUsfm replaces
            // the book's chapters array wholesale, so this is a
            // workspace-scope (validate-then-bulk) commit, not a
            // per-chapter overlay.
            const outcome = await withWorkingFilesDraft({
              workingFilesStore,
              interactionGate,
              scope: "workspace",
              draftRefs: chapterRefsForBook(file),
              commitMeta: {
                kind: "programmaticFix",
                action: "prettify",
                dirtyTextContent: true,
              },
              mutate: async (scratch) => {
                const draftFile = scratch.find(
                  (f) => f.bookCode === targetBookCode,
                );
                if (!draftFile) {
                  return { affected: [], value: undefined };
                }
                const result = await formatBookInPlace(draftFile);
                return {
                  affected: result.changed ? chapterRefsForBook(draftFile) : [],
                  value: undefined,
                };
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
            }
          },
        });
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

      const backup = await history.runTransaction({
        label: t`Format Project`,
        candidates: allChapterRefs(workingFiles),
        run: async () => {
          // Discovery flow: formatScope returns per-book results; we
          // don't know which books change until we see appliedChanges.
          // rebuildParsedFileFromUsfm replaces each touched book's
          // `chapters` array wholesale → workspace-scope commit.
          const outcome = await withWorkingFilesDraft({
            workingFilesStore,
            interactionGate,
            scope: "workspace",
            draftRefs: allChapterRefs(workingFiles),
            commitMeta: {
              kind: "programmaticFix",
              action: "prettify",
              dirtyTextContent: true,
            },
            mutate: async (filesDraft) => {
              const affected: ChapterRef[] = [];
              const batchResults = await usfmOnionService.formatScope(
                filesDraft.map((file) => ({
                  tokens: file.chapters.flatMap((chapter) =>
                    chapterTokensForFormatting(chapter),
                  ),
                })),
              );

              const modifiedFiles: ScriptureBookState[] = [];
              for (let i = 0; i < filesDraft.length; i++) {
                const file = filesDraft[i];
                const result = batchResults[i];
                if (!result || !result.appliedChanges.length) continue;
                updateProgressNotification(progressNotificationId, {
                  title: t`Formatting Project`,
                  message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                });
                await rebuildParsedFileFromUsfm({
                  targetFile: file,
                  sourceUsfm: tokensToUsfm(result.tokens, bookLineEnding(file)),
                  usfmOnionService,
                  shape: workingShape(),
                });
                modifiedFiles.push(file);
                affected.push(...chapterRefsForBook(file));
                if (file.bookCode === currentFileBibleIdentifier) {
                }
              }

              const modifiedBookCodes = new Set(
                modifiedFiles.map((file) => file.bookCode),
              );
              modifiedBooksCount = filesDraft.filter((f) =>
                f.chapters.some((c) => c.dirty),
              ).length;

              return { affected, value: { modifiedBookCodes } };
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
          } else if (outcome.kind === "unchanged") {
            showNotificationInfo({
              notification: {
                title: t`Nothing changed`,
                message: t`This project is already formatted`,
              },
            });
          }
          return previous;
        },
      });

      return backup;
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
