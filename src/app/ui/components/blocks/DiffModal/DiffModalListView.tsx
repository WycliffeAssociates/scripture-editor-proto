import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Badge, Grid, Group, Paper, Text, Tooltip } from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Change } from "diff";
import { diffWordsWithSpace } from "diff";
import { BookIcon, Clipboard, Code2, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import { toRegularModeDisplayTextPreservingWhitespace } from "@/app/ui/components/blocks/DiffModal/diffDisplayUtils.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import {
    getRowUsfmOverrideKey,
    type RowUsfmOverrides,
    resolveRowUsfmMode,
    toggleRowUsfmOverride,
} from "./rowUsfmOverrides.ts";

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
    diff: ProjectDiff;
    revertDiff: (diffToRevert: ProjectDiff) => void;
    switchBookOrChapter: (fileBibleIdentifier: string, chapter: number) => void;
    toggleDiffModal: () => void;
    effectiveShowUsfmMarkers: boolean;
    toggleUsfmForRow: () => void;
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

function DiffItem({
    diff,
    revertDiff,
    switchBookOrChapter,
    toggleDiffModal,
    effectiveShowUsfmMarkers,
    toggleUsfmForRow,
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
        <Group>
            <Tooltip
                label={
                    effectiveShowUsfmMarkers
                        ? t`Show regular text for this verse`
                        : t`Show USFM for this verse`
                }
                withArrow
                position="top"
            >
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
            </Tooltip>
            {import.meta.env.DEV && (
                <Tooltip
                    label={t`Copy this diff (JSON)`}
                    withArrow
                    position="top"
                >
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
                </Tooltip>
            )}
            <Tooltip
                label={<Trans>Switch to this chapter</Trans>}
                withArrow
                position="top"
            >
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.goToChapterButton}
                    onClick={() => scrollToClickedRef(diff)}
                    aria-label={t`Switch to this chapter`}
                    title={t`Switch to this chapter`}
                >
                    <BookIcon size={16} />
                </ActionIconSimple>
            </Tooltip>
            <Tooltip
                label={<Trans>Undo Change</Trans>}
                withArrow
                position="top"
            >
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.revertButton}
                    onClick={() => revertDiff(diff)}
                    aria-label={t`Undo Change`}
                    title={t`Undo Change`}
                >
                    <RotateCw size={16} />
                </ActionIconSimple>
            </Tooltip>
        </Group>
    );

    return (
        <div
            data-testid={TESTING_IDS.save.diffItem}
            className={styles.diffItem}
        >
            <Group justify="space-between" mb="md">
                <Group gap="xs">
                    <Text
                        data-testid={TESTING_IDS.save.diffSidHeader}
                        className={styles.diffSidHeader}
                    >
                        {bookCodeToProjectLocalizedTitle({
                            bookCode: diff.bookCode,
                            replaceCodeInString: diff.semanticSid,
                        })}
                    </Text>
                    {diff.isWhitespaceChange && (
                        <Badge variant="light" color="gray" size="xs">
                            <Trans>Whitespace Only</Trans>
                        </Badge>
                    )}
                    {diff.isUsfmStructureChange && (
                        <Badge variant="light" color="blue" size="sm">
                            <Trans>USFM Structure Only</Trans>
                        </Badge>
                    )}
                </Group>
            </Group>

            {isLg ? (
                <Grid
                    gutter="xl"
                    classNames={{
                        inner: styles.diffGrid,
                    }}
                >
                    <Grid.Col>
                        <Group justify="space-between" mb="xs">
                            <Text className={styles.diffLabel}>
                                <Trans>Original</Trans>
                            </Text>
                            {renderActions()}
                        </Group>
                        <Paper
                            p="md"
                            className={getPaperClass(
                                isDeletion,
                                styles.paperBgDeletion,
                            )}
                        >
                            {isAddition && (
                                <Text className={styles.versePlaceholder}>
                                    <Trans>(New verse)</Trans>
                                </Text>
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
                        </Paper>
                    </Grid.Col>

                    <Grid.Col>
                        <Group justify="space-between" mb="xs">
                            <Text className={styles.diffLabel}>
                                <Trans>Current</Trans>
                            </Text>
                        </Group>
                        <Paper
                            p="md"
                            className={getPaperClass(
                                isAddition,
                                styles.paperBgAddition,
                            )}
                        >
                            {isDeletion && (
                                <Text className={styles.versePlaceholder}>
                                    <Trans>(Verse deleted)</Trans>
                                </Text>
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
                        </Paper>
                    </Grid.Col>
                </Grid>
            ) : (
                <div className={styles.diffStacked}>
                    <div>
                        <Group justify="space-between" mb="xs">
                            <Text className={styles.diffLabel}>
                                <Trans>Original</Trans>
                            </Text>
                            {renderActions()}
                        </Group>
                        <Paper
                            p="md"
                            className={getPaperClass(
                                isDeletion,
                                styles.paperBgDeletion,
                            )}
                        >
                            {isAddition && (
                                <Text className={styles.versePlaceholder}>
                                    <Trans>(New verse)</Trans>
                                </Text>
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
                        </Paper>
                    </div>

                    <div>
                        <Text className={styles.diffLabel} mb="xs">
                            <Trans>Current</Trans>
                        </Text>
                        <Paper
                            p="md"
                            className={getPaperClass(
                                isAddition,
                                styles.paperBgAddition,
                            )}
                        >
                            {isDeletion && (
                                <Text className={styles.versePlaceholder}>
                                    <Trans>(Verse deleted)</Trans>
                                </Text>
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
                        </Paper>
                    </div>
                </div>
            )}
        </div>
    );
}

export function VirtualizedDiffList({
    diffs,
    revertDiff,
    showUsfmMarkers,
    isOpen,
}: {
    diffs: ProjectDiff[];
    revertDiff: (diffToRevert: ProjectDiff) => void;
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
                                diff={diff}
                                revertDiff={revertDiff}
                                effectiveShowUsfmMarkers={
                                    effectiveShowUsfmMarkers
                                }
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
