import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Change } from "diff";
import { diffWordsWithSpace } from "diff";
import { BookIcon, Clipboard, Code2, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import { toRegularModeDisplayTextPreservingWhitespace } from "@/app/ui/components/blocks/DiffModal/diffDisplayUtils.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/index.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import {
    getRowUsfmOverrideKey,
    type RowUsfmOverrides,
    resolveRowUsfmMode,
    toggleRowUsfmOverride,
} from "./rowUsfmOverrides.ts";

/**
 * Flat, virtualized diff-list presentation.
 *
 * When users want a quick scan of all changes across the workspace, this view is
 * more efficient than the structured chapter renderer. It emphasizes change rows
 * and actions over document shape.
 */
type HighlightedDiffProps = {
    changes: Change[];
    viewType: "original" | "current";
    showWhitespace?: boolean;
};

function renderWithVisibleWhitespace(text: string, showWhitespace: boolean) {
    if (!showWhitespace) return text;
    return text.replace(/\n/g, "↵\n");
}

function HighlightedDiffText({
    changes,
    viewType,
    showWhitespace = false,
}: HighlightedDiffProps) {
    return (
        <pre
            data-testid={TEST_ID_GENERATORS.diffCurrentPre(viewType)}
            className={styles.diffPre}
        >
            {changes.map((change, index) => {
                let spanClass = "";
                const isHighlighted = change.added || change.removed;
                if (change.added && viewType === "current") {
                    spanClass = styles.diffHighlightAdded;
                } else if (change.removed && viewType === "original") {
                    spanClass = styles.diffHighlightRemoved;
                } else if (change.added || change.removed) {
                    return null;
                }
                const displayValue = renderWithVisibleWhitespace(
                    change.value,
                    showWhitespace && isHighlighted,
                );

                return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: <only id we have>
                    <span key={index} className={spanClass}>
                        {displayValue}
                    </span>
                );
            })}
        </pre>
    );
}

type DiffItemProps = {
    actionMode: "unsaved" | "external";
    diff: ProjectDiff;
    onRevertDiff: (diffToRevert: ProjectDiff) => void;
    onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
    switchBookOrChapter: (fileBibleIdentifier: string, chapter: number) => void;
    toggleDiffModal: () => void;
    effectiveShowUsfmMarkers: boolean;
    toggleUsfmForRow: () => void;
    originalLabel: string;
    currentLabel: string;
};

function getDisplayTextPair(diff: ProjectDiff, showUsfmMarkers: boolean) {
    if (showUsfmMarkers) {
        return {
            original: diff.originalDisplayText,
            current: diff.currentDisplayText,
        };
    }

    // For whitespace-only diffs, preserve exact newline/space layout while
    // stripping marker tokens so regular mode still reveals whitespace changes.
    if (diff.isWhitespaceChange) {
        return {
            original: toRegularModeDisplayTextPreservingWhitespace(
                diff.originalDisplayText,
            ),
            current: toRegularModeDisplayTextPreservingWhitespace(
                diff.currentDisplayText,
            ),
        };
    }

    return {
        original: diff.originalTextOnly ?? diff.originalDisplayText,
        current: diff.currentTextOnly ?? diff.currentDisplayText,
    };
}

/**
 * One diff row in the virtualized list view.
 *
 * It owns the row-level display-mode toggle, action buttons, and “jump to this
 * location in the editor” affordance for a single diff block.
 */
function DiffItem({
    actionMode,
    diff,
    onRevertDiff,
    onApplyDiffToCurrent,
    switchBookOrChapter,
    toggleDiffModal,
    effectiveShowUsfmMarkers,
    toggleUsfmForRow,
    originalLabel,
    currentLabel,
}: DiffItemProps) {
    const { isLg } = useWorkspaceMediaQuery();
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const isAddition = diff.status === "added";
    const isDeletion = diff.status === "deleted";
    const isModification = diff.status === "modified";
    const displayText = getDisplayTextPair(diff, effectiveShowUsfmMarkers);

    const copySingleDiffJson = async () => {
        const payload = {
            generatedAt: new Date().toISOString(),
            diff: {
                uniqueKey: diff.uniqueKey,
                semanticSid: diff.semanticSid,
                status: diff.status,
                bookCode: diff.bookCode,
                chapterNum: diff.chapterNum,
                isWhitespaceChange: diff.isWhitespaceChange ?? false,
                isUsfmStructureChange: diff.isUsfmStructureChange ?? false,
                originalDisplayText: diff.originalDisplayText,
                currentDisplayText: diff.currentDisplayText,
                originalTextOnly: diff.originalTextOnly,
                currentTextOnly: diff.currentTextOnly,
            },
        };

        try {
            await navigator.clipboard.writeText(
                JSON.stringify(payload, null, 2),
            );
        } catch (e) {
            console.error("Failed to copy single diff JSON", e);
        }
    };

    const wordDiff = useMemo(() => {
        if (!isModification) return undefined;

        const shouldTrim = !diff.isWhitespaceChange;
        const originalComparisonText = shouldTrim
            ? displayText.original.trim()
            : displayText.original;
        const currentComparisonText = shouldTrim
            ? displayText.current.trim()
            : displayText.current;
        return diffWordsWithSpace(
            originalComparisonText,
            currentComparisonText,
        );
    }, [
        diff.isWhitespaceChange,
        displayText.current,
        displayText.original,
        isModification,
    ]);

    function scrollToClickedRef(diff: ProjectDiff) {
        switchBookOrChapter(diff.bookCode, diff.chapterNum);
        toggleDiffModal();

        setTimeout(() => {
            const domEls = [
                ...document.querySelectorAll(
                    `[data-sid="${diff.semanticSid}"]`,
                ),
            ] as HTMLElement[];
            const first = domEls[0];
            if (domEls.length > 0) {
                domEls.forEach((el) => {
                    el.style.backgroundColor = "yellow";
                });
            }
            first?.scrollIntoView({
                behavior: "smooth",
            });
            setTimeout(() => {
                if (domEls.length > 0) {
                    domEls.forEach((el) => {
                        el.style.backgroundColor = "";
                    });
                }
            }, 2000);
        }, 500);
    }
    const getPaperClass = (isHighlighted: boolean, highlightClass: string) => {
        return `${styles.paperMinHeight} ${isHighlighted ? highlightClass : styles.paperBgDefault}`;
    };

    const renderActions = () => (
        <div className={styles.diffToolbarGroup}>
            <ActionIconSimple
                data-testid={TESTING_IDS.save.toggleRowUsfmButton}
                onClick={toggleUsfmForRow}
                aria-label={
                    effectiveShowUsfmMarkers
                        ? t`Show regular text for this verse`
                        : t`Show USFM for this verse`
                }
                title={
                    effectiveShowUsfmMarkers
                        ? t`Show regular text for this verse`
                        : t`Show USFM for this verse`
                }
            >
                <Code2 size={16} />
            </ActionIconSimple>
            {import.meta.env.DEV && (
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.copyDiffButton}
                    onClick={() => {
                        void copySingleDiffJson();
                    }}
                    aria-label={t`Copy this diff (JSON)`}
                    title={t`Copy this diff (JSON)`}
                >
                    <Clipboard size={16} />
                </ActionIconSimple>
            )}
            <ActionIconSimple
                data-testid={TESTING_IDS.save.goToChapterButton}
                onClick={() => scrollToClickedRef(diff)}
                aria-label={t`Switch to this chapter`}
                title={t`Switch to this chapter`}
            >
                <BookIcon size={16} />
            </ActionIconSimple>
            {actionMode === "unsaved" ? (
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.revertButton}
                    onClick={() => onRevertDiff(diff)}
                    aria-label={t`Undo Change`}
                    title={t`Undo Change`}
                >
                    <RotateCw size={16} />
                </ActionIconSimple>
            ) : (
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.applyButton}
                    onClick={() => onApplyDiffToCurrent(diff)}
                    aria-label={t`Apply to current`}
                    title={t`Apply to current`}
                >
                    <RotateCw size={16} />
                </ActionIconSimple>
            )}
        </div>
    );

    return (
        <div
            data-testid={TESTING_IDS.save.diffItem}
            className={styles.diffItem}
        >
            <div className={styles.diffToolbarRow}>
                <div className={styles.diffToolbarGroup}>
                    <span
                        data-testid={TESTING_IDS.save.diffSidHeader}
                        className={styles.diffSidHeader}
                    >
                        {bookCodeToProjectLocalizedTitle({
                            bookCode: diff.bookCode,
                            replaceCodeInString: diff.semanticSid,
                        })}
                    </span>
                    {diff.isWhitespaceChange && (
                        <span
                            className={`${styles.diffBadge} ${styles.diffBadgeGray}`}
                        >
                            <Trans>Whitespace Only</Trans>
                        </span>
                    )}
                    {diff.isUsfmStructureChange && (
                        <span
                            className={`${styles.diffBadge} ${styles.diffBadgePrimary}`}
                        >
                            <Trans>USFM Structure Only</Trans>
                        </span>
                    )}
                </div>
            </div>

            {isLg ? (
                <div className={styles.diffGrid}>
                    <div>
                        <div className={styles.diffToolbarRow}>
                            <span className={styles.diffLabel}>
                                {originalLabel}
                            </span>
                            {actionMode === "unsaved" && renderActions()}
                        </div>
                        <div
                            className={`${styles.diffPaper} ${getPaperClass(
                                isDeletion,
                                styles.paperBgDeletion,
                            )}`}
                        >
                            {isAddition && (
                                <span className={styles.versePlaceholder}>
                                    <Trans>(New verse)</Trans>
                                </span>
                            )}
                            {isDeletion && (
                                <pre className={styles.diffPre}>
                                    {displayText.original}
                                </pre>
                            )}
                            {isModification && wordDiff && (
                                <HighlightedDiffText
                                    changes={wordDiff}
                                    viewType="original"
                                    showWhitespace={diff.isWhitespaceChange}
                                />
                            )}
                        </div>
                    </div>

                    <div>
                        <div className={styles.diffToolbarRow}>
                            <span className={styles.diffLabel}>
                                {currentLabel}
                            </span>
                            {actionMode === "external" && renderActions()}
                        </div>
                        <div
                            className={`${styles.diffPaper} ${getPaperClass(
                                isAddition,
                                styles.paperBgAddition,
                            )}`}
                        >
                            {isDeletion && (
                                <span className={styles.versePlaceholder}>
                                    <Trans>(Verse deleted)</Trans>
                                </span>
                            )}
                            {isAddition && (
                                <pre className={styles.diffPre}>
                                    {displayText.current}
                                </pre>
                            )}
                            {isModification && wordDiff && (
                                <HighlightedDiffText
                                    changes={wordDiff}
                                    viewType="current"
                                    showWhitespace={diff.isWhitespaceChange}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className={styles.diffStacked}>
                    <div>
                        <div className={styles.diffToolbarRow}>
                            <span className={styles.diffLabel}>
                                {originalLabel}
                            </span>
                            {actionMode === "unsaved" && renderActions()}
                        </div>
                        <div
                            className={`${styles.diffPaper} ${getPaperClass(
                                isDeletion,
                                styles.paperBgDeletion,
                            )}`}
                        >
                            {isAddition && (
                                <span className={styles.versePlaceholder}>
                                    <Trans>(New verse)</Trans>
                                </span>
                            )}
                            {isDeletion && (
                                <pre className={styles.diffPre}>
                                    {displayText.original}
                                </pre>
                            )}
                            {isModification && wordDiff && (
                                <HighlightedDiffText
                                    changes={wordDiff}
                                    viewType="original"
                                    showWhitespace={diff.isWhitespaceChange}
                                />
                            )}
                        </div>
                    </div>

                    <div>
                        <span className={styles.diffLabel}>{currentLabel}</span>
                        {actionMode === "external" && (
                            <div
                                className={styles.diffToolbarRow}
                                style={{ justifyContent: "flex-end" }}
                            >
                                {renderActions()}
                            </div>
                        )}
                        <div
                            className={`${styles.diffPaper} ${getPaperClass(
                                isAddition,
                                styles.paperBgAddition,
                            )}`}
                        >
                            {isDeletion && (
                                <span className={styles.versePlaceholder}>
                                    <Trans>(Verse deleted)</Trans>
                                </span>
                            )}
                            {isAddition && (
                                <pre className={styles.diffPre}>
                                    {displayText.current}
                                </pre>
                            )}
                            {isModification && wordDiff && (
                                <HighlightedDiffText
                                    changes={wordDiff}
                                    viewType="current"
                                    showWhitespace={diff.isWhitespaceChange}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function VirtualizedDiffList({
    diffs,
    actionMode,
    onRevertDiff,
    onApplyDiffToCurrent,
    originalLabel,
    currentLabel,
    showUsfmMarkers,
    isOpen,
}: {
    diffs: ProjectDiff[];
    actionMode: "unsaved" | "external";
    onRevertDiff: (diffToRevert: ProjectDiff) => void;
    onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
    originalLabel: string;
    currentLabel: string;
    showUsfmMarkers: boolean;
    isOpen?: boolean;
}) {
    const { actions } = useWorkspaceContext();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [rowUsfmOverrides, setRowUsfmOverrides] = useState<RowUsfmOverrides>(
        {},
    );

    useEffect(() => {
        setRowUsfmOverrides({});
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setRowUsfmOverrides({});
        }
    }, [isOpen]);

    const virtualizer = useVirtualizer({
        count: diffs.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => 200,
        overscan: 5,
        measureElement: (element) => element.getBoundingClientRect().height,
    });

    return (
        <div
            ref={scrollContainerRef}
            className={styles.diffScrollArea}
            data-diff-scroll-container="true"
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const diff = diffs[virtualRow.index];
                    const rowKey = getRowUsfmOverrideKey(diff);
                    const effectiveShowUsfmMarkers = resolveRowUsfmMode({
                        globalShowUsfmMarkers: showUsfmMarkers,
                        overrides: rowUsfmOverrides,
                        rowKey,
                    });
                    return (
                        <div
                            key={diff.semanticSid}
                            ref={virtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <DiffItem
                                actionMode={actionMode}
                                diff={diff}
                                onRevertDiff={onRevertDiff}
                                onApplyDiffToCurrent={onApplyDiffToCurrent}
                                effectiveShowUsfmMarkers={
                                    effectiveShowUsfmMarkers
                                }
                                originalLabel={originalLabel}
                                currentLabel={currentLabel}
                                toggleUsfmForRow={() =>
                                    setRowUsfmOverrides((prev) =>
                                        toggleRowUsfmOverride({
                                            globalShowUsfmMarkers:
                                                showUsfmMarkers,
                                            overrides: prev,
                                            rowKey,
                                        }),
                                    )
                                }
                                switchBookOrChapter={
                                    actions.switchBookOrChapter
                                }
                                toggleDiffModal={actions.toggleDiffModal}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
