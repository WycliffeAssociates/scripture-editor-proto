import { useLingui } from "@lingui/react/macro";
import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { insertParagraphMarkerAtCursor } from "@/app/domain/editor/utils/insertParagraphMarkerAtCursor.ts";
import {
    lexicalRootChildrenToUsfmTokenStream,
    usfmTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { ReferenceProjectHook } from "@/app/ui/hooks/useReferenceProject.tsx";
import {
    type MatchFormattingScope,
    matchFormattingByVerseAnchors,
    type SkippedMarkerSuggestion,
    type TargetMarkerPreservationMode,
    type VerseAnchorMatchStats,
} from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

const ZERO_STATS: VerseAnchorMatchStats = {
    matchedVerses: 0,
    sourceOnlyVerses: 0,
    targetOnlyVerses: 0,
    insertedBoundaryMarkers: 0,
    skippedSuggestions: 0,
};

type ChapterMatchApplyResult = {
    changed: boolean;
    stats: VerseAnchorMatchStats;
    suggestions: SkippedMarkerSuggestion[];
};

function sumStats(
    left: VerseAnchorMatchStats,
    right: VerseAnchorMatchStats,
): VerseAnchorMatchStats {
    return {
        matchedVerses: left.matchedVerses + right.matchedVerses,
        sourceOnlyVerses: left.sourceOnlyVerses + right.sourceOnlyVerses,
        targetOnlyVerses: left.targetOnlyVerses + right.targetOnlyVerses,
        insertedBoundaryMarkers:
            left.insertedBoundaryMarkers + right.insertedBoundaryMarkers,
        skippedSuggestions: left.skippedSuggestions + right.skippedSuggestions,
    };
}

export function useFormatMatching({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    referenceProject,
    updateDiffMapForChapter,
    setEditorContent,
    saveCurrentDirtyLexical,
    setFormatMatchReport,
    autoOpenFormatMatchSuggestions,
    setIsFormatMatchSuggestionsOpen,
    editorRef,
    editorMode,
    languageDirection,
    targetMarkerPreservationMode,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    referenceProject: ReferenceProjectHook;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    setFormatMatchReport: Dispatch<
        SetStateAction<FormatMatchingRunReport | null>
    >;
    autoOpenFormatMatchSuggestions: boolean;
    setIsFormatMatchSuggestionsOpen: (open: boolean) => void;
    editorRef: RefObject<LexicalEditor | null>;
    editorMode: EditorModeSetting;
    languageDirection: "ltr" | "rtl";
    targetMarkerPreservationMode: TargetMarkerPreservationMode;
}) {
    const { t } = useLingui();

    const publishReport = (report: FormatMatchingRunReport) => {
        setFormatMatchReport(report);
        if (report.suggestions.length > 0 && autoOpenFormatMatchSuggestions) {
            setIsFormatMatchSuggestionsOpen(true);
            return;
        }
        if (report.suggestions.length === 0) {
            setIsFormatMatchSuggestionsOpen(false);
        }
    };

    const applyChapterMatchInPlace = ({
        chapter,
        sourceChapter,
        scope,
        bookCode,
        targetMarkerPreservation,
    }: {
        chapter: ParsedChapter;
        sourceChapter: ParsedChapter;
        scope: MatchFormattingScope;
        bookCode: string;
        targetMarkerPreservation: TargetMarkerPreservationMode;
    }): ChapterMatchApplyResult => {
        const targetRootChildren = chapter.lexicalState.root
            .children as SerializedLexicalNode[];
        const sourceRootChildren = sourceChapter.lexicalState.root
            .children as SerializedLexicalNode[];

        const targetEnvelope =
            lexicalRootChildrenToUsfmTokenStream(targetRootChildren);
        const sourceEnvelope =
            lexicalRootChildrenToUsfmTokenStream(sourceRootChildren);

        const matchResult = matchFormattingByVerseAnchors({
            targetTokens: targetEnvelope.tokens,
            sourceTokens: sourceEnvelope.tokens,
            scope,
            targetMarkerPreservation,
        });

        const nextRootChildren = usfmTokenStreamToLexicalRootChildren(
            matchResult.tokens,
            targetEnvelope,
        );

        if (
            JSON.stringify(targetRootChildren) ===
            JSON.stringify(nextRootChildren)
        ) {
            return {
                changed: false,
                stats: matchResult.stats,
                suggestions: matchResult.suggestions,
            };
        }

        const nextLexical = structuredClone(chapter.lexicalState);
        nextLexical.root.children =
            nextRootChildren as typeof nextLexical.root.children;

        const afterUsfm = serializeToUsfmString(
            nextLexical.root.children as SerializedLexicalNode[],
        );
        const baselineUsfm = serializeToUsfmString(
            chapter.loadedLexicalState.root.children as SerializedLexicalNode[],
        );

        chapter.lexicalState = nextLexical;
        chapter.dirty = afterUsfm !== baselineUsfm;
        updateDiffMapForChapter(bookCode, chapter.chapNumber);

        return {
            changed: true,
            stats: matchResult.stats,
            suggestions: matchResult.suggestions,
        };
    };

    async function matchFormattingChapter() {
        if (!referenceProject.referenceChapter) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const chapter = file?.chapters.find(
            (c) => c.chapNumber === currentChapter,
        );
        const sourceChapter =
            referenceProject.referenceFile?.chapters.find(
                (c) => c.chapNumber === currentChapter,
            ) ?? referenceProject.referenceChapter;

        if (!chapter || !sourceChapter) return;

        const result = applyChapterMatchInPlace({
            chapter,
            sourceChapter,
            scope: "chapter",
            bookCode: currentFileBibleIdentifier,
            targetMarkerPreservation: targetMarkerPreservationMode,
        });

        publishReport({
            generatedAt: new Date().toISOString(),
            scope: "chapter",
            chaptersScanned: 1,
            chaptersModified: result.changed ? 1 : 0,
            booksModified: result.changed ? 1 : 0,
            stats: result.stats,
            suggestions: result.suggestions,
        });

        if (result.changed) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                chapter,
            );
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for Chapter ${currentChapter}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingBook() {
        if (!referenceProject.referenceFile) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;

        let currentChapterModified = false;
        let modifiedChaptersCount = 0;
        let aggregateStats = ZERO_STATS;
        const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
        let chaptersScanned = 0;

        file.chapters.forEach((chapter) => {
            const refChapter = referenceProject.referenceFile?.chapters.find(
                (rc) => rc.chapNumber === chapter.chapNumber,
            );
            if (!refChapter) return;
            chaptersScanned++;

            const result = applyChapterMatchInPlace({
                chapter,
                sourceChapter: refChapter,
                scope: "book",
                bookCode: file.bookCode,
                targetMarkerPreservation: targetMarkerPreservationMode,
            });
            aggregateStats = sumStats(aggregateStats, result.stats);
            aggregateSuggestions.push(...result.suggestions);

            if (!result.changed) return;
            modifiedChaptersCount++;
            if (chapter.chapNumber === currentChapter) {
                currentChapterModified = true;
            }
        });

        publishReport({
            generatedAt: new Date().toISOString(),
            scope: "book",
            chaptersScanned,
            chaptersModified: modifiedChaptersCount,
            booksModified: modifiedChaptersCount > 0 ? 1 : 0,
            stats: aggregateStats,
            suggestions: aggregateSuggestions,
        });

        if (currentChapterModified) {
            const currentChap = file.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        if (modifiedChaptersCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for ${modifiedChaptersCount} chapters in ${file.title || file.bookCode}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingProject() {
        if (!referenceProject.referenceQuery.data) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        let currentChapterModified = false;
        let modifiedBooksCount = 0;
        let modifiedChaptersCount = 0;
        let aggregateStats = ZERO_STATS;
        const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
        let chaptersScanned = 0;

        for (const targetFile of mutWorkingFilesRef) {
            const refFile =
                referenceProject.referenceQuery.data.parsedFiles.find(
                    (rf) => rf.bookCode === targetFile.bookCode,
                );
            if (!refFile) continue;

            let fileModified = false;
            targetFile.chapters.forEach((chapter) => {
                const refChapter = refFile.chapters.find(
                    (rc) => rc.chapNumber === chapter.chapNumber,
                );
                if (!refChapter) return;
                chaptersScanned++;

                const result = applyChapterMatchInPlace({
                    chapter,
                    sourceChapter: refChapter,
                    scope: "project",
                    bookCode: targetFile.bookCode,
                    targetMarkerPreservation: targetMarkerPreservationMode,
                });
                aggregateStats = sumStats(aggregateStats, result.stats);
                aggregateSuggestions.push(...result.suggestions);

                if (!result.changed) return;
                fileModified = true;
                modifiedChaptersCount++;
                if (
                    targetFile.bookCode === currentFileBibleIdentifier &&
                    chapter.chapNumber === currentChapter
                ) {
                    currentChapterModified = true;
                }
            });

            if (fileModified) {
                modifiedBooksCount++;
            }
        }

        publishReport({
            generatedAt: new Date().toISOString(),
            scope: "project",
            chaptersScanned,
            chaptersModified: modifiedChaptersCount,
            booksModified: modifiedBooksCount,
            stats: aggregateStats,
            suggestions: aggregateSuggestions,
        });

        if (currentChapterModified) {
            const currentFile = mutWorkingFilesRef.find(
                (f) => f.bookCode === currentFileBibleIdentifier,
            );
            const currentChap = currentFile?.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        if (modifiedBooksCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting across ${modifiedBooksCount} books`,
                },
            });
        }

        return backup;
    }

    async function applyMatchFormattingSuggestion(
        suggestion: SkippedMarkerSuggestion,
    ) {
        const editor = editorRef.current;
        if (!editor) return false;
        const inserted = insertParagraphMarkerAtCursor({
            editor,
            marker: suggestion.marker,
            languageDirection,
            editorMode,
        });
        if (!inserted) {
            return false;
        }
        saveCurrentDirtyLexical();

        setFormatMatchReport((prev) => {
            if (!prev) return prev;
            const nextSuggestions = prev.suggestions.filter(
                (candidate) =>
                    candidate.id !== suggestion.id ||
                    candidate.marker !== suggestion.marker ||
                    candidate.verse !== suggestion.verse ||
                    candidate.chapter !== suggestion.chapter ||
                    candidate.bookCode !== suggestion.bookCode,
            );
            return {
                ...prev,
                generatedAt: new Date().toISOString(),
                suggestions: nextSuggestions,
                stats: {
                    ...prev.stats,
                    skippedSuggestions: nextSuggestions.length,
                },
            };
        });

        return true;
    }

    return {
        matchFormattingChapter,
        matchFormattingBook,
        matchFormattingProject,
        applyMatchFormattingSuggestion,
    };
}
