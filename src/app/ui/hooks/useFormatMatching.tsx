import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import type { Dispatch, SetStateAction } from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    lexicalRootChildrenToUsfmTokenStream,
    lexicalToTokens,
    usfmTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
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
    formatMarkerSkeleton,
    injectSkeletonMarkersFromSource,
    injectSkeletonVersesFromSource,
    stripDeprecatedMarkers,
} from "@/core/domain/usfm/skeletonInjection.ts";
import type { TokenEnvelope } from "@/core/domain/usfm/tokenEnvelope.ts";

// Skeleton-injection / verse-grouping helpers moved to
// `@/core/domain/usfm/skeletonInjection.ts` so they can be unit-tested
// without importing this React orchestration. The hook itself imports
// what it needs from there.

function uniqueMarkerTags(tokens: TokenEnvelope[]): string[] {
    const seen = new Set<string>();
    for (const token of tokens) {
        if (token.tokenType !== "marker" && token.tokenType !== "endMarker") {
            continue;
        }
        const marker = token.marker;
        if (!marker) continue;
        seen.add(marker);
    }
    return [...seen].sort();
}
// @AI -> PROBABLY SHOULD JUST KILL THIS DEBUG LOGGING HERE.
function logMatchFormattingRun(args: {
    bookCode: string;
    chapterNumber: number;
    scope: MatchFormattingScope;
    targetMarkerPreservation: TargetMarkerPreservationMode;
    sourceTokens: TokenEnvelope[];
    targetTokensBefore: TokenEnvelope[];
    targetTokensAfter: TokenEnvelope[];
    suggestions: SkippedMarkerSuggestion[];
    stats: VerseAnchorMatchStats;
}) {
    const referenceMarkers = uniqueMarkerTags(args.sourceTokens);
    const targetBeforeMarkers = uniqueMarkerTags(args.targetTokensBefore);
    const targetAfterMarkers = uniqueMarkerTags(args.targetTokensAfter);
    const transferred = targetAfterMarkers.filter(
        (marker) => !targetBeforeMarkers.includes(marker),
    );
    const stillMissing = referenceMarkers.filter(
        (marker) => !targetAfterMarkers.includes(marker),
    );

    /* eslint-disable no-console */
    console.groupCollapsed(
        `[match-formatting] ${args.bookCode} ${args.chapterNumber} ` +
            `(${args.scope}, ${args.targetMarkerPreservation})`,
    );
    console.log("reference markers:", referenceMarkers.join(" ") || "(none)");
    console.log(
        "target markers before:",
        targetBeforeMarkers.join(" ") || "(none)",
    );
    console.log(
        "target markers after :",
        targetAfterMarkers.join(" ") || "(none)",
    );
    console.log("newly transferred  :", transferred.join(" ") || "(none)");
    console.log(
        "in reference, missing from target after run:",
        stillMissing.join(" ") || "(none)",
    );
    console.log("stats:", args.stats);
    if (args.suggestions.length > 0) {
        console.log(
            `intra-verse suggestions (${args.suggestions.length}):`,
            args.suggestions.map((suggestion) => ({
                verse: suggestion.verse,
                marker: suggestion.marker,
                reason: suggestion.reason,
            })),
        );
    }
    console.groupCollapsed("reference skeleton");
    console.log(formatMarkerSkeleton(args.sourceTokens));
    console.groupEnd();
    console.groupCollapsed("target skeleton (before)");
    console.log(formatMarkerSkeleton(args.targetTokensBefore));
    console.groupEnd();
    console.groupCollapsed("target skeleton (after)");
    console.log(formatMarkerSkeleton(args.targetTokensAfter));
    console.groupEnd();
    console.groupCollapsed("raw token streams");
    console.log("reference:", args.sourceTokens);
    console.log("target before:", args.targetTokensBefore);
    console.log("target after :", args.targetTokensAfter);
    console.groupEnd();
    console.groupEnd();
    /* eslint-enable no-console */
}

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
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    referenceResource,
    updateDiffMapForChapter,
    setEditorContent,
    saveCurrentDirtyLexical,
    setFormatMatchReport,
    setIsFormatMatchSuggestionsOpen,
    setEditorMode,
    targetMarkerPreservationMode,
    history,
}: {
    mutWorkingFilesRef: ScriptureBookState[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    referenceResource: ReferenceItemHook;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ScriptureBookState[] | undefined;
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

        logMatchFormattingRun({
            bookCode,
            chapterNumber: chapter.chapterNumber,
            scope,
            targetMarkerPreservation,
            sourceTokens: sourceTokensClean,
            targetTokensBefore: targetEnvelope.tokens,
            targetTokensAfter: enrichedTokens,
            suggestions: matchResult.suggestions,
            stats: matchResult.stats,
        });

        // @AI -> SHOULD PROBABLY PUT IN A PILE OF TODO FOR A TOAST LIKE, "YOU'RE FORMATTING ALREADY MATCHES, NO CHANGES NEEDED"
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
            chapter.currentTokens.map((token) => token.source).join("") !==
            chapter.sourceTokens.map((token) => token.source).join("");
        updateDiffMapForChapter(bookCode, chapter.chapterNumber);

        return {
            changed: true,
            stats: matchResult.stats,
            suggestions: matchResult.suggestions,
        };
    };

    async function matchFormattingChapter() {
        if (!referenceResource.referenceChapter) return;
        saveCurrentDirtyLexical();

        const file = mutWorkingFilesRef.find(
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
                const previous = structuredClone(mutWorkingFilesRef);
                const chapter = file.chapters.find(
                    (c) => c.chapterNumber === currentChapter,
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

                // Push the mutated chapter to the editor BEFORE anything that
                // calls `saveCurrentDirtyLexical` (which reads the editor's
                // current state). Otherwise that read would observe the stale
                // pre-match-formatting tree and overwrite our changes.
                if (result.changed) {
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
                    ShowNotificationSuccess({
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
        saveCurrentDirtyLexical();

        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;

        const backup = await history.runTransaction({
            label: t`Match Formatting (Book ${currentFileBibleIdentifier})`,
            candidates: toChapterRefs(file),
            run: async () => {
                const previous = structuredClone(mutWorkingFilesRef);
                let currentChapterModified = false;
                let modifiedChaptersCount = 0;
                let aggregateStats = ZERO_STATS;
                const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
                let chaptersScanned = 0;

                file.chapters.forEach((chapter) => {
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
                        bookCode: file.bookCode,
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
                    ShowNotificationSuccess({
                        notification: {
                            title: t`Formatting Matched`,
                            message: t`Matched formatting for ${modifiedChaptersCount} chapters in ${file.title || file.bookCode}`,
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
        saveCurrentDirtyLexical();

        const backup = await history.runTransaction({
            label: t`Match Formatting (Project)`,
            candidates: mutWorkingFilesRef.flatMap((file) =>
                toChapterRefs(file),
            ),
            run: async () => {
                const previous = structuredClone(mutWorkingFilesRef);
                let currentChapterModified = false;
                let modifiedBooksCount = 0;
                let modifiedChaptersCount = 0;
                let aggregateStats = ZERO_STATS;
                const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
                let chaptersScanned = 0;

                for (const targetFile of mutWorkingFilesRef) {
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
                    ShowNotificationSuccess({
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
