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
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import {
    allChapterRefs,
    type ChapterRef,
    chapterRefsForBook,
} from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    findChapterInDraft,
    type WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
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
    interactionGate,
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
    interactionGate: WorkspaceGateStore;
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

        // TODO: when formatting already matches, surface a "no changes needed" toast.
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

        return {
            changed: true,
            stats: matchResult.stats,
            suggestions: matchResult.suggestions,
        };
    };

    // Chapter / book / project match-formatting are the SAME flow over a different
    // set of chapters and a different place to pull each chapter's reference
    // ("source") from. Rather than three near-identical copies, scope is a
    // parameter: we resolve those two things up front (mirroring `prettify(scope)`
    // in usePrettifyOperations) and share the transaction, the per-chapter apply
    // loop, and the report/notification.
    async function matchFormatting(scope: MatchFormattingScope) {
        const workingFiles = workingFilesStore.read();
        const file = workingFiles.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );

        // The only per-scope differences: which chapters we draft, the history
        // label, and how to find each target chapter's source in the reference.
        // Bail the same way the old per-scope guards did when the reference the
        // user is matching against hasn't loaded yet.
        let draftRefs: ChapterRef[];
        let label: string;
        let sourceFor: (
            bookCode: string,
            chapterNum: number,
        ) => ScriptureChapterState | undefined;

        if (scope === "chapter") {
            if (!referenceResource.referenceChapter || !file) return;
            draftRefs = [
                {
                    bookCode: currentFileBibleIdentifier,
                    chapterNum: currentChapter,
                },
            ];
            label = t`Match Formatting (Chapter ${currentFileBibleIdentifier} ${currentChapter})`;
            // Prefer the matching chapter of the loaded reference FILE; fall back to
            // the standalone reference chapter when that's all that's loaded.
            sourceFor = () =>
                referenceResource.referenceFile?.chapters.find(
                    (c) => c.chapterNumber === currentChapter,
                ) ??
                referenceResource.referenceChapter ??
                undefined;
        } else if (scope === "book") {
            if (!referenceResource.referenceFile || !file) return;
            draftRefs = chapterRefsForBook(file);
            label = t`Match Formatting (Book ${currentFileBibleIdentifier})`;
            sourceFor = (_bookCode, chapterNum) =>
                referenceResource.referenceFile?.chapters.find(
                    (c) => c.chapterNumber === chapterNum,
                );
        } else {
            const referenceData = referenceResource.referenceQuery.data;
            if (!referenceData) return;
            draftRefs = allChapterRefs(workingFiles);
            label = t`Match Formatting (Project)`;
            sourceFor = (bookCode, chapterNum) =>
                referenceData.parsedFiles
                    .find((rf) => rf.bookCode === bookCode)
                    ?.chapters.find((c) => c.chapterNumber === chapterNum);
        }

        const backup = await history.runTransaction({
            label,
            candidates: draftRefs,
            run: async () => {
                // Rollback baseline aliases the pre-mutation snapshot; safe because the
                // seam mutates only its scratch, never read().
                const previous = workingFilesStore.read();
                let aggregateStats = ZERO_STATS;
                const aggregateSuggestions: SkippedMarkerSuggestion[] = [];
                let chaptersScanned = 0;
                let modifiedChaptersCount = 0;
                const modifiedBooks = new Set<string>();
                let currentChapterModified = false;

                const outcome = await withWorkingFilesDraft({
                    workingFilesStore,
                    interactionGate,
                    draftRefs,
                    commitMeta: {
                        kind: "programmaticFix",
                        // Chapter scope re-lints just its book; book/project touch enough
                        // that we scope the commit to the whole project.
                        scope:
                            scope === "chapter"
                                ? {
                                      bookCode: currentFileBibleIdentifier,
                                      chapter: currentChapter,
                                  }
                                : { project: true },
                        dirtyTextContent: true,
                    },
                    mutate: async (scratch) => {
                        const affected: ChapterRef[] = [];
                        // Walk only the drafted chapters; match each against its resolved
                        // source. A chapter with no counterpart in the reference is skipped
                        // (and not counted as scanned).
                        for (const ref of draftRefs) {
                            const chapter = findChapterInDraft(
                                scratch,
                                ref.bookCode,
                                ref.chapterNum,
                            );
                            const sourceChapter = sourceFor(
                                ref.bookCode,
                                ref.chapterNum,
                            );
                            if (!chapter || !sourceChapter) continue;
                            chaptersScanned++;
                            const result = applyChapterMatchInPlace({
                                chapter,
                                sourceChapter,
                                scope,
                                bookCode: ref.bookCode,
                                targetMarkerPreservation:
                                    targetMarkerPreservationMode,
                            });
                            aggregateStats = sumStats(
                                aggregateStats,
                                result.stats,
                            );
                            aggregateSuggestions.push(...result.suggestions);
                            if (!result.changed) continue;
                            modifiedChaptersCount++;
                            modifiedBooks.add(ref.bookCode);
                            affected.push(ref);
                            if (
                                ref.bookCode === currentFileBibleIdentifier &&
                                ref.chapterNum === currentChapter
                            ) {
                                currentChapterModified = true;
                            }
                        }
                        return { affected, value: undefined };
                    },
                    invalidate: ({ committedChapters }) => {
                        for (const {
                            bookCode,
                            chapterNum,
                        } of committedChapters) {
                            updateDiffMapForChapter(bookCode, chapterNum);
                        }
                        // Re-render the visible editor only when its own chapter changed.
                        if (!currentChapterModified) return;
                        const currentChap = findChapterInDraft(
                            workingFilesStore.read(),
                            currentFileBibleIdentifier,
                            currentChapter,
                        );
                        if (currentChap) {
                            setEditorContent(
                                currentFileBibleIdentifier,
                                currentChapter,
                                currentChap,
                            );
                        }
                    },
                });

                // If the commit aborted (a save raced us / the gate closed), the
                // counters reflect scratch work that never landed — don't report or
                // toast a match that didn't happen.
                if (outcome.kind === "aborted") return previous;

                publishReport({
                    generatedAt: new Date().toISOString(),
                    scope,
                    chaptersScanned,
                    chaptersModified: modifiedChaptersCount,
                    booksModified: modifiedBooks.size,
                    stats: aggregateStats,
                    suggestions: aggregateSuggestions,
                });

                // Single-chapter matches jump to form mode on success so the user lands
                // on the result; book/project only switch when there are suggestions to
                // review (handled inside publishReport).
                if (scope === "chapter" && modifiedChaptersCount > 0) {
                    setEditorMode(EDITOR_MODES.form);
                }

                if (modifiedChaptersCount > 0) {
                    const message =
                        scope === "chapter"
                            ? t`Matched formatting for Chapter ${currentChapter}`
                            : scope === "book"
                              ? t`Matched formatting for ${modifiedChaptersCount} chapters in ${file?.title || currentFileBibleIdentifier}`
                              : t`Matched formatting across ${modifiedBooks.size} books`;
                    showNotificationSuccess({
                        notification: { title: t`Formatting Matched`, message },
                    });
                }

                return previous;
            },
        });

        return backup;
    }

    return {
        matchFormattingChapter: () => matchFormatting("chapter"),
        matchFormattingBook: () => matchFormatting("book"),
        matchFormattingProject: () => matchFormatting("project"),
    };
}
