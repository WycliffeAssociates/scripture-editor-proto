import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import type { Dispatch, SetStateAction } from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    lexicalRootChildrenToUsfmTokenStream,
    lexicalToTokens,
    tokensToUsfm,
    usfmTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    findChapterInDraft,
    type WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { ReferenceItemHook } from "@/app/ui/hooks/useReferenceItem.tsx";
import {
    type MatchFormattingScope,
    matchFormattingByVerseAnchors,
    type SkippedMarkerSuggestion,
    type TargetMarkerPreservationMode,
    type VerseAnchorMatchStats,
} from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import {
    injectSkeletonMarkersFromSource,
    injectSkeletonVersesFromSource,
    stripDeprecatedMarkers,
} from "@/core/domain/usfm/skeletonInjection.ts";

// Skeleton-injection / verse-grouping helpers moved to
// `@/core/domain/usfm/skeletonInjection.ts` so they can be unit-tested
// without importing this React orchestration. The hook itself imports
// what it needs from there.

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

/**
 * Workspace hook for "match formatting from reference" flows.
 *
 * This sits at the boundary between the current editable scripture workspace and
 * the currently loaded reference item. It extracts token streams from both,
 * applies verse-anchor formatting transfer, updates workspace state in place, and
 * publishes a UI report for skipped suggestions.
 */
export function useFormatMatching({
    workingFilesStore,
    currentFileBibleIdentifier,
    currentChapter,
    referenceResource,
    updateDiffMapForChapter,
    setEditorContent,
    setFormatMatchReport,
    setIsFormatMatchSuggestionsOpen,
    setEditorMode,
    targetMarkerPreservationMode,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    referenceResource: ReferenceItemHook;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
    setFormatMatchReport: Dispatch<
        SetStateAction<FormatMatchingRunReport | null>
    >;
    setIsFormatMatchSuggestionsOpen: (open: boolean) => void;
    setEditorMode: (next: typeof EDITOR_MODES.form) => void;
    targetMarkerPreservationMode: TargetMarkerPreservationMode;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();

    const publishReport = (report: FormatMatchingRunReport) => {
        setFormatMatchReport(report);
        setIsFormatMatchSuggestionsOpen(false);
        if (report.suggestions.length > 0) {
            setEditorMode(EDITOR_MODES.form);
        }
    };

    const toChapterRefs = (file: ScriptureBookState) =>
        file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
        }));

    const applyChapterMatchInPlace = ({
        chapter,
        sourceChapter,
        scope,
        bookCode,
        targetMarkerPreservation,
    }: {
        chapter: ScriptureChapterState;
        sourceChapter: ScriptureChapterState;
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
        const sourceTokensClean = stripDeprecatedMarkers(sourceEnvelope.tokens);

        const matchResult = matchFormattingByVerseAnchors({
            targetTokens: targetEnvelope.tokens,
            sourceTokens: sourceTokensClean,
            scope,
            targetMarkerPreservation,
        });

        const versesEnriched = injectSkeletonVersesFromSource(
            matchResult.tokens,
            sourceTokensClean,
        );
        const enrichedTokens = injectSkeletonMarkersFromSource(
            versesEnriched,
            sourceTokensClean,
        );

        const nextRootChildren = usfmTokenStreamToLexicalRootChildren(
            enrichedTokens,
            targetEnvelope,
        );

        // todo -> SHOULD PROBABLY PUT IN A PILE OF TODO FOR A TOAST LIKE, "YOU'RE FORMATTING ALREADY MATCHES, NO CHANGES NEEDED"
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

        chapter.lexicalState = nextLexical;
        chapter.currentTokens = lexicalToTokens(nextLexical, {
            bookCode,
        });
        chapter.dirty =
            tokensToUsfm(chapter.currentTokens) !==
            tokensToUsfm(chapter.sourceTokens);
        updateDiffMapForChapter(bookCode, chapter.chapterNumber);

        return {
            changed: true,
            stats: matchResult.stats,
            suggestions: matchResult.suggestions,
        };
    };

    async function matchFormattingChapter() {
        if (!referenceResource.referenceChapter) return;

        const workingFiles = workingFilesStore.read();
        const file = workingFiles.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;

        const backup = await history.runTransaction({
            label: t`Match Formatting (Chapter ${currentFileBibleIdentifier} ${currentChapter})`,
            candidates: [
                {
                    bookCode: currentFileBibleIdentifier,
                    chapterNum: currentChapter,
                },
            ],
            run: async () => {
                // Rollback baseline aliases the pre-draft snapshot; safe
                // because drafts mutate only their shallow-copied chapters.
                const previous = workingFiles;
                const draft = workingFilesStore.draftWithChapters([
                    {
                        bookCode: currentFileBibleIdentifier,
                        chapterNum: currentChapter,
                    },
                ]);
                const chapter = findChapterInDraft(
                    draft,
                    currentFileBibleIdentifier,
                    currentChapter,
                );
                const sourceChapter =
                    referenceResource.referenceFile?.chapters.find(
                        (c) => c.chapterNumber === currentChapter,
                    ) ?? referenceResource.referenceChapter;

                if (!chapter || !sourceChapter) return previous;

                const result = applyChapterMatchInPlace({
                    chapter,
                    sourceChapter,
                    scope: "chapter",
                    bookCode: currentFileBibleIdentifier,
                    targetMarkerPreservation: targetMarkerPreservationMode,
                });

                if (result.changed) {
                    workingFilesStore.commit(
                        {
                            kind: "chapter",
                            bookCode: currentFileBibleIdentifier,
                            chapter: currentChapter,
                            lexicalState: chapter.lexicalState,
                        },
                        {
                            kind: "programmaticFix",
                            scope: {
                                bookCode: currentFileBibleIdentifier,
                                chapter: currentChapter,
                            },
                            dirtyTextContent: true,
                        },
                    );
                    setEditorContent(
                        currentFileBibleIdentifier,
                        currentChapter,
                        chapter,
                    );
                }

                const report: FormatMatchingRunReport = {
                    generatedAt: new Date().toISOString(),
                    scope: "chapter",
                    chaptersScanned: 1,
                    chaptersModified: result.changed ? 1 : 0,
                    booksModified: result.changed ? 1 : 0,
                    stats: result.stats,
                    suggestions: result.suggestions,
                };
                publishReport(report);

                if (result.changed || result.suggestions.length > 0) {
                    setEditorMode(EDITOR_MODES.form);
                }

                if (result.changed) {
                    showNotificationSuccess({
                        notification: {
                            title: t`Formatting Matched`,
                            message: t`Matched formatting for Chapter ${currentChapter}`,
                        },
                    });
                }

                return previous;
            },
        });

        return backup;
    }

    async function matchFormattingBook() {
        if (!referenceResource.referenceFile) return;
        const workingFiles = workingFilesStore.read();
        const file = workingFiles.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;
        // Draft with every chapter of the touched book writable —
        // applyChapterMatchInPlace decides per chapter whether to mutate.
        const draft = workingFilesStore.draftWithChapters(
            file.chapters.map((c) => ({
                bookCode: file.bookCode,
                chapterNum: c.chapterNumber,
            })),
        );
        const draftFile = draft.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!draftFile) return;

        const backup = await history.runTransaction({
            label: t`Match Formatting (Book ${currentFileBibleIdentifier})`,
            candidates: toChapterRefs(draftFile),
            run: async () => {
                // The store snapshot is immutable from our side (we mutate
                // the draft, never the read() result), so the rollback
                // baseline can be the snapshot itself — no deep clone needed.
                const previous = workingFiles;
                let currentChapterModified = false;
                let modifiedChaptersCount = 0;
                let aggregateStats = ZERO_STATS;
                const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
                let chaptersScanned = 0;

                draftFile.chapters.forEach((chapter) => {
                    const refChapter =
                        referenceResource.referenceFile?.chapters.find(
                            (rc) => rc.chapterNumber === chapter.chapterNumber,
                        );
                    if (!refChapter) return;
                    chaptersScanned++;

                    const result = applyChapterMatchInPlace({
                        chapter,
                        sourceChapter: refChapter,
                        scope: "book",
                        bookCode: draftFile.bookCode,
                        targetMarkerPreservation: targetMarkerPreservationMode,
                    });
                    aggregateStats = sumStats(aggregateStats, result.stats);
                    aggregateSuggestions.push(...result.suggestions);

                    if (!result.changed) return;
                    modifiedChaptersCount++;
                    if (chapter.chapterNumber === currentChapter) {
                        currentChapterModified = true;
                    }
                });

                if (modifiedChaptersCount > 0) {
                    workingFilesStore.commit(
                        { kind: "bulk", files: draft },
                        {
                            kind: "programmaticFix",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                    );
                }

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

                if (modifiedChaptersCount > 0) {
                    showNotificationSuccess({
                        notification: {
                            title: t`Formatting Matched`,
                            message: t`Matched formatting for ${modifiedChaptersCount} chapters in ${draftFile.title || draftFile.bookCode}`,
                        },
                    });
                }

                return previous;
            },
        });

        return backup;
    }

    async function matchFormattingProject() {
        const referenceData = referenceResource.referenceQuery.data;
        if (!referenceData) return;

        const workingFiles = workingFilesStore.read();

        const backup = await history.runTransaction({
            label: t`Match Formatting (Project)`,
            candidates: workingFiles.flatMap((file) => toChapterRefs(file)),
            run: async () => {
                // The store snapshot is immutable from our side (we mutate
                // the draft, never the read() result), so the rollback
                // baseline can be the snapshot itself — no deep clone needed.
                const previous = workingFiles;
                // Discovery flow: applyChapterMatchInPlace decides per
                // chapter whether to mutate. Draft every chapter writable
                // (shallow object spreads — O(N), still vastly cheaper than
                // structuredClone's deep walk).
                const allRefs = workingFiles.flatMap((file) =>
                    file.chapters.map((c) => ({
                        bookCode: file.bookCode,
                        chapterNum: c.chapterNumber,
                    })),
                );
                const draft = workingFilesStore.draftWithChapters(allRefs);
                let currentChapterModified = false;
                let modifiedBooksCount = 0;
                let modifiedChaptersCount = 0;
                let aggregateStats = ZERO_STATS;
                const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
                let chaptersScanned = 0;

                for (const targetFile of draft) {
                    const refFile = referenceData.parsedFiles.find(
                        (rf) => rf.bookCode === targetFile.bookCode,
                    );
                    if (!refFile) continue;

                    let fileModified = false;
                    targetFile.chapters.forEach((chapter) => {
                        const refChapter = refFile.chapters.find(
                            (rc) => rc.chapterNumber === chapter.chapterNumber,
                        );
                        if (!refChapter) return;
                        chaptersScanned++;

                        const result = applyChapterMatchInPlace({
                            chapter,
                            sourceChapter: refChapter,
                            scope: "project",
                            bookCode: targetFile.bookCode,
                            targetMarkerPreservation:
                                targetMarkerPreservationMode,
                        });
                        aggregateStats = sumStats(aggregateStats, result.stats);
                        aggregateSuggestions.push(...result.suggestions);

                        if (!result.changed) return;
                        fileModified = true;
                        modifiedChaptersCount++;
                        if (
                            targetFile.bookCode ===
                                currentFileBibleIdentifier &&
                            chapter.chapterNumber === currentChapter
                        ) {
                            currentChapterModified = true;
                        }
                    });

                    if (fileModified) {
                        modifiedBooksCount++;
                    }
                }

                if (modifiedChaptersCount > 0) {
                    workingFilesStore.commit(
                        { kind: "bulk", files: draft },
                        {
                            kind: "programmaticFix",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                    );
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
                    const currentFile = draft.find(
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

                if (modifiedBooksCount > 0) {
                    showNotificationSuccess({
                        notification: {
                            title: t`Formatting Matched`,
                            message: t`Matched formatting across ${modifiedBooksCount} books`,
                        },
                    });
                }

                return previous;
            },
        });

        return backup;
    }

    return {
        matchFormattingChapter,
        matchFormattingBook,
        matchFormattingProject,
    };
}
