import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    inferContentEditorModeFromRootChildren,
    tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
    hideNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { MatchFormattingScope } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Higher-level formatting operations for the scripture workspace.
 *
 * These actions sit above the raw formatter/match-formatting engines. They decide
 * which chapters or books are in scope, wrap the mutation in history/lint/update
 * plumbing, and push the resulting lexical state back into the visible editor.
 */
export function useFormatOperations({
    workingFilesStore,
    currentFileBibleIdentifier,
    currentChapter,
    setIsProcessing,
    updateDiffMapForChapter,
    commitBookLintResults,
    setEditorContent,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    commitBookLintResults: (resultsByBook: Record<string, LintIssue[]>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    type FormatScope = MatchFormattingScope;
    const toChapterRefs = (file: ScriptureBookState) =>
        file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
        }));

    const allChapterRefs = (files: ScriptureBookState[]) =>
        files.flatMap((file) => toChapterRefs(file));

    const refreshLintForFiles = async (files: ScriptureBookState[]) => {
        if (!files.length) return;
        const lintResultsByBook = await relintBookFiles(
            files,
            usfmOnionService,
        );
        commitBookLintResults(lintResultsByBook);
    };

    const chapterTokensForFormatting = (chapter: ScriptureChapterState) =>
        chapter.currentTokens;

    const formatChapterInPlace = async (
        file: ScriptureBookState,
        chapterNum: number,
    ) => {
        const chapter = file.chapters.find(
            (c) => c.chapterNumber === chapterNum,
        );
        if (!chapter) return { changed: false as const };

        const chapterTokens = chapterTokensForFormatting(chapter);
        const [result] = await usfmOnionService.formatScope([
            { tokens: chapterTokens },
        ]);
        if (!result.appliedChanges.length) return { changed: false as const };

        const direction =
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr";
        const targetMode = inferContentEditorModeFromRootChildren(
            chapter.lexicalState.root.children,
        );
        // Preserve the chapter's current presentation mode through the
        // format pass. Previously this collapsed anything other than
        // `regular` to `flat`, which kicked form mode into a USFM-shaped
        // state on every Format Chapter run.
        const rebuildMode =
            targetMode === EDITOR_MODES.regular
                ? "regular"
                : targetMode === EDITOR_MODES.form
                  ? "form"
                  : "flat";
        chapter.lexicalState = tokensToLexical({
            tokens: result.tokens,
            direction,
            mode: rebuildMode,
        });
        chapter.currentTokens = result.tokens;
        chapter.dirty =
            result.tokens.map((token) => token.source).join("") !==
            chapter.sourceTokens.map((token) => token.source).join("");
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

        const nextBookUsfm = result.tokens
            .map((token) => token.source)
            .join("");
        await rebuildParsedFileFromUsfm({
            targetFile: file,
            sourceUsfm: nextBookUsfm,
            usfmOnionService,
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
            // store fresh, so no flush is needed. Mutations below operate on
            // structured clones; the result is published back via
            // workingFilesStore.commit, and setEditorContent then refreshes
            // the editor (tagged programaticIgnore, so the bridge does not
            // republish that as a separate user-edit commit).
            //
            // TODO(post-stage-1C): consider extracting the read → clone →
            // mutator → commit → setEditorContent lifecycle into a formal
            // helper on `WorkingFilesStore` (e.g. `mutateChapter(book, chap,
            // (clone) => bool)` returning the previous snapshot). This pattern
            // currently repeats across ~5–6 sites in this file and
            // useFormatMatching. Holding off until 1C lands + the Stage 3A
            // chapter-swap Effect shape is known, so we don't extract a
            // helper that turns out to be chapter-scope-only and doesn't fit
            // the bulk / cancellable shapes. If after that audit the pattern
            // still repeats unchanged, promote it.
            const workingFiles = workingFilesStore.read();

            if (scope === "chapter") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;
                const targetChapterNumber = chapterNumber ?? currentChapter;

                const file = workingFiles.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!file) return;
                // Only the target chapter needs to be writable;
                // formatChapterInPlace mutates just that chapter's
                // lexicalState/currentTokens/dirty.
                const draft = workingFilesStore.draftWithChapters([
                    {
                        bookCode: targetBookCode,
                        chapterNum: targetChapterNumber,
                    },
                ]);
                const draftFile = draft.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!draftFile) return;

                await history.runTransaction({
                    label: t`Format Chapter (${targetBookCode} ${targetChapterNumber})`,
                    candidates: [
                        {
                            bookCode: targetBookCode,
                            chapterNum: targetChapterNumber,
                        },
                    ],
                    run: async () => {
                        const result = await formatChapterInPlace(
                            draftFile,
                            targetChapterNumber,
                        );

                        if (!result.changed) {
                            ShowNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This chapter is already formatted`,
                                },
                            });
                            return;
                        }

                        const chapter = draftFile.chapters.find(
                            (c) => c.chapterNumber === targetChapterNumber,
                        );
                        if (!chapter) return;
                        workingFilesStore.commit(
                            {
                                kind: "chapter",
                                bookCode: targetBookCode,
                                chapter: targetChapterNumber,
                                lexicalState: chapter.lexicalState,
                            },
                            {
                                kind: "programmaticFix",
                                scope: {
                                    bookCode: targetBookCode,
                                    chapter: targetChapterNumber,
                                },
                                dirtyTextContent: true,
                            },
                        );

                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );
                        await refreshLintForFiles([draftFile]);

                        if (
                            draftFile.bookCode === currentFileBibleIdentifier &&
                            targetChapterNumber === currentChapter
                        ) {
                            setEditorContent(
                                currentFileBibleIdentifier,
                                currentChapter,
                                chapter,
                            );
                        }

                        ShowNotificationSuccess({
                            notification: {
                                title: t`Chapter Formatted`,
                                message: t`Formatted ${draftFile.title || draftFile.bookCode} ${targetChapterNumber}`,
                            },
                        });
                    },
                });
                return;
            }

            if (scope === "book") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;

                const file = workingFiles.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!file) return;
                // formatBookInPlace → rebuildParsedFileFromUsfm replaces the
                // book's chapters array wholesale. Draft every chapter of
                // the book writable so the reassignment lands on the
                // shallow-copied book, not the store's book.
                const bookDraft = workingFilesStore.draftWithChapters(
                    file.chapters.map((c) => ({
                        bookCode: file.bookCode,
                        chapterNum: c.chapterNumber,
                    })),
                );
                const draftFile = bookDraft.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!draftFile) return;

                await history.runTransaction({
                    label: t`Format Book (${targetBookCode})`,
                    candidates: toChapterRefs(draftFile),
                    run: async () => {
                        const result = await formatBookInPlace(draftFile);
                        if (!result.changed) {
                            ShowNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This book is already formatted`,
                                },
                            });
                            return;
                        }

                        workingFilesStore.commit(
                            { kind: "bulk", files: bookDraft },
                            {
                                kind: "programmaticFix",
                                scope: { project: true },
                                dirtyTextContent: true,
                            },
                        );

                        await refreshLintForFiles([draftFile]);
                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );

                        if (draftFile.bookCode === currentFileBibleIdentifier) {
                            const currentChap = draftFile.chapters.find(
                                (c) => c.chapterNumber === currentChapter,
                            );

                            if (currentChap) {
                                setEditorContent(
                                    currentFileBibleIdentifier,
                                    currentChapter,
                                    currentChap,
                                );
                            }
                        }

                        ShowNotificationSuccess({
                            notification: {
                                title: t`Book Formatted`,
                                message: t`Formatted ${draftFile.title || draftFile.bookCode}`,
                            },
                        });
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

            const backup = await history.runTransaction({
                label: t`Format Project`,
                candidates: allChapterRefs(workingFiles),
                run: async () => {
                    // The store snapshot is immutable from our side; no deep
                    // clone needed for the rollback baseline.
                    const previous = workingFiles;
                    // Discovery flow: formatScope returns per-book results;
                    // we don't know which books will change until we see
                    // appliedChanges per result. Draft every chapter of every
                    // book writable so rebuildParsedFileFromUsfm can reassign
                    // each touched book's `chapters` array safely. The
                    // not-actually-modified books leave their shallow-copied
                    // chapters untouched — wasted spread is negligible vs.
                    // the deep-clone cost it replaces.
                    const allRefs = workingFiles.flatMap((file) =>
                        file.chapters.map((c) => ({
                            bookCode: file.bookCode,
                            chapterNum: c.chapterNumber,
                        })),
                    );
                    const filesDraft =
                        workingFilesStore.draftWithChapters(allRefs);
                    let currentChapterModified = false;
                    let anyModified = false;

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

                        const nextBookUsfm = result.tokens
                            .map((token) => token.source)
                            .join("");
                        await rebuildParsedFileFromUsfm({
                            targetFile: file,
                            sourceUsfm: nextBookUsfm,
                            usfmOnionService,
                        });
                        anyModified = true;
                        modifiedFiles.push(file);
                        if (file.bookCode === currentFileBibleIdentifier) {
                            currentChapterModified = true;
                        }
                    }

                    if (modifiedFiles.length > 0) {
                        await refreshLintForFiles(modifiedFiles);
                    }

                    if (anyModified) {
                        workingFilesStore.commit(
                            { kind: "bulk", files: filesDraft },
                            {
                                kind: "programmaticFix",
                                scope: { project: true },
                                dirtyTextContent: true,
                            },
                        );
                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );
                    } else {
                        hideNotification(progressNotificationId);
                        notificationId = null;
                        ShowNotificationInfo({
                            notification: {
                                title: t`Nothing changed`,
                                message: t`This project is already formatted`,
                            },
                        });
                        return previous;
                    }

                    const modifiedBooksCount = filesDraft.filter((f) =>
                        f.chapters.some((c) => c.dirty),
                    ).length;

                    if (currentChapterModified) {
                        const currentFile = filesDraft.find(
                            (f) => f.bookCode === currentFileBibleIdentifier,
                        );
                        const currentChap = currentFile?.chapters.find(
                            (c) => c.chapterNumber === currentChapter,
                        );
                        if (currentChap) {
                            setEditorContent(
                                currentFileBibleIdentifier,
                                currentChapter,
                                currentChap,
                            );
                        }
                    }

                    hideNotification(progressNotificationId);
                    notificationId = null;
                    ShowNotificationSuccess({
                        notification: {
                            title: t`Project Formatted`,
                            message: t`Formatted ${modifiedBooksCount} book(s)`,
                        },
                    });

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
        workingFilesStore.commit(
            { kind: "bulk", files: backup },
            {
                kind: "undo",
                scope: { project: true },
                dirtyTextContent: true,
            },
        );

        const currentFile = backup.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const currentChap = currentFile?.chapters.find(
            (c) => c.chapterNumber === currentChapter,
        );
        if (currentChap) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                currentChap,
            );
        }

        updateDiffMapForChapter(currentFileBibleIdentifier, currentChapter);
    }

    return {
        prettifyChapter: (bookCode?: string, chapterNumber?: number) =>
            prettify("chapter", bookCode, chapterNumber),
        prettifyBook: (bookCode?: string) => prettify("book", bookCode),
        prettifyProject: () => prettify("project"),
        revertFormat,
    };
}
