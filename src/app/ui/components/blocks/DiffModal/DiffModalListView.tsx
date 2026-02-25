import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
    Badge,
    Button,
    Grid,
    Group,
    Paper,
    rem,
    Text,
    Tooltip,
} from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Change } from "diff";
import { diffWordsWithSpace } from "diff";
import { BookIcon, RotateCw } from "lucide-react";
import { useMemo, useRef } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

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
    showUsfmMarkers: boolean;
};

function getDisplayTextPair(diff: ProjectDiff, showUsfmMarkers: boolean) {
    if (showUsfmMarkers) {
        return {
            original: diff.originalDisplayText,
            current: diff.currentDisplayText,
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
    showUsfmMarkers,
}: DiffItemProps) {
    const { isSm, isLg } = useWorkspaceMediaQuery();
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const isAddition = diff.status === "added";
    const isDeletion = diff.status === "deleted";
    const isModification = diff.status === "modified";
    const displayText = getDisplayTextPair(diff, showUsfmMarkers);

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
            {isSm ? (
                <>
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
                </>
            ) : (
                <>
                    <Button
                        variant="outline"
                        size="compact-xs"
                        onClick={() => scrollToClickedRef(diff)}
                        data-testid={TESTING_IDS.save.goToChapterButton}
                    >
                        <Trans>Switch to this chapter</Trans>
                    </Button>
                    <Button
                        variant="outline"
                        size="compact-xs"
                        onClick={() => revertDiff(diff)}
                        data-testid={TESTING_IDS.save.revertButton}
                    >
                        <Trans>Undo Change</Trans>
                    </Button>
                </>
            )}
        </Group>
    );

    return (
        <div
            data-testid={TESTING_IDS.save.diffItem}
            className={styles.diffItem}
        >
            <Group justify="space-between" p="0">
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
                        <Badge variant="light" color="gray" size="sm">
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
                    gutter="md"
                    classNames={{
                        inner: styles.diffGrid,
                    }}
                >
                    <Grid.Col>
                        <Group justify="space-between" mb="xs" mih={rem(30)}>
                            <Text className={styles.diffLabel}>
                                <Trans>Original</Trans>
                            </Text>
                            {renderActions()}
                        </Group>
                        <Paper
                            p="xs"
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
                        <Group justify="space-between" mb="xs" mih={rem(30)}>
                            <Text className={styles.diffLabel} mb="xs">
                                <Trans>Current</Trans>
                            </Text>
                        </Group>
                        <Paper
                            p="xs"
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
                            p={isSm ? "xs" : "sm"}
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
                            p={isSm ? "xs" : "sm"}
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
}: {
    diffs: ProjectDiff[];
    revertDiff: (diffToRevert: ProjectDiff) => void;
    showUsfmMarkers: boolean;
}) {
    const { actions } = useWorkspaceContext();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

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
                                showUsfmMarkers={showUsfmMarkers}
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
