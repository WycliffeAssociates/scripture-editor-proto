import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
    Button,
    Center,
    Loader,
    Menu,
    Modal,
    Paper,
    rem,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import { VirtualizedDiffList } from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import type { DiffsByChapter, ProjectDiff } from "@/app/ui/hooks/useSave.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export type DiffViewerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    diffs: ProjectDiff[] | null;
    diffsByChapter: DiffsByChapter;
    isCalculating: boolean;
    revertDiff: (diffToRevert: ProjectDiff) => void;
    revertChapter: (bookCode: string, chapterNum: number) => void;
    isSm?: boolean;
    isXs?: boolean;
};

type DiffViewMode = "list" | "chapter";

type ChapterOption = {
    key: string;
    bookCode: string;
    chapterNum: number;
    label: string;
    sid: string;
};

function chapterKey(bookCode: string, chapterNum: number) {
    return `${bookCode}:${chapterNum}`;
}

function parseChapterKey(value: string): {
    bookCode: string;
    chapterNum: number;
} {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return { bookCode: "", chapterNum: Number.NaN };
    return {
        bookCode: value.slice(0, separator),
        chapterNum: Number(value.slice(separator + 1)),
    };
}

export function DiffViewerModal({
    isOpen,
    onClose,
    diffs,
    diffsByChapter,
    isCalculating,
    revertDiff,
    revertChapter,
    isSm = false,
    isXs = false,
}: DiffViewerModalProps) {
    const hasChanges = (diffs?.length ?? 0) > 0;
    const { bookCodeToProjectLocalizedTitle, saveDiff } = useWorkspaceContext();
    const [hideWhitespaceOnly, setHideWhitespaceOnly] = useState(false);
    const [showUsfmMarkers, setShowUsfmMarkers] = useState(false);
    const [viewMode, setViewMode] = useState<DiffViewMode>("list");
    const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setViewMode("list");
    }, [isOpen]);

    const visibleDiffs = useMemo(() => {
        if (!diffs) return diffs;
        if (!hideWhitespaceOnly) return diffs;
        return diffs.filter((diff) => !diff.isWhitespaceChange);
    }, [diffs, hideWhitespaceOnly]);

    const copyDiffsJson = useCallback(async () => {
        const payload = {
            generatedAt: new Date().toISOString(),
            diffs: (diffs ?? []).map((d) => ({
                uniqueKey: d.uniqueKey,
                semanticSid: d.semanticSid,
                status: d.status,
                bookCode: d.bookCode,
                chapterNum: d.chapterNum,
                isWhitespaceChange: d.isWhitespaceChange ?? false,
                original: d.originalDisplayText,
                current: d.currentDisplayText,
            })),
        };

        try {
            await navigator.clipboard.writeText(
                JSON.stringify(payload, null, 2),
            );
        } catch (e) {
            console.error("Failed to copy diffs JSON", e);
        }
    }, [diffs]);

    const chapterOptions = useMemo(() => {
        const options: ChapterOption[] = [];
        for (const bookCode of Object.keys(diffsByChapter)) {
            const chapters = diffsByChapter[bookCode];
            for (const chapterNumKey of Object.keys(chapters)) {
                const chapterNum = Number(chapterNumKey);
                options.push({
                    key: chapterKey(bookCode, chapterNum),
                    bookCode,
                    chapterNum,
                    label: `${bookCodeToProjectLocalizedTitle({ bookCode })} ${chapterNum}`,
                    sid: `${bookCode} ${chapterNum}:1`,
                });
            }
        }

        return sortListBySidCanonical(options).map((option) => ({
            value: option.key,
            label: option.label,
            bookCode: option.bookCode,
            chapterNum: option.chapterNum,
        }));
    }, [bookCodeToProjectLocalizedTitle, diffsByChapter]);

    useEffect(() => {
        if (!chapterOptions.length) {
            if (selectedChapter !== null) {
                setSelectedChapter(null);
            }
            return;
        }
        const hasCurrentSelection =
            selectedChapter !== null &&
            chapterOptions.some((option) => option.value === selectedChapter);
        if (!hasCurrentSelection) {
            setSelectedChapter(chapterOptions[0]?.value ?? null);
        }
    }, [chapterOptions, selectedChapter]);

    const selectedChapterDiffs = useMemo(() => {
        if (!selectedChapter) return [];
        const parsed = parseChapterKey(selectedChapter);
        if (!parsed.bookCode || Number.isNaN(parsed.chapterNum)) return [];
        return diffsByChapter[parsed.bookCode]?.[parsed.chapterNum] ?? [];
    }, [diffsByChapter, selectedChapter]);

    const selectedChapterLabel = useMemo(() => {
        if (!selectedChapter) return "";
        return (
            chapterOptions.find((option) => option.value === selectedChapter)
                ?.label ?? ""
        );
    }, [chapterOptions, selectedChapter]);

    const modalSize = isXs ? "100%" : isSm ? "98%" : "95%";
    const hasVisibleDiffs = (visibleDiffs?.length ?? 0) > 0;
    const showingChapterView = viewMode === "chapter";
    const hasVisibleChapter = selectedChapterDiffs.length > 0;

    const handleRevertSelectedChapter = () => {
        if (!selectedChapter) return;
        const parsed = parseChapterKey(selectedChapter);
        if (!parsed.bookCode || Number.isNaN(parsed.chapterNum)) return;
        revertChapter(parsed.bookCode, parsed.chapterNum);
    };

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={t`Review Changes Before Saving`}
            size={modalSize}
            centered
            classNames={{
                header: styles.modalHeader,
                title: styles.modalTitle,
                content: styles.modalContent,
                body: styles.modalBodyRoot,
            }}
        >
            <Paper className={styles.modalScrollPaper}>
                <div
                    data-testid={TESTING_IDS.save.modal}
                    className={styles.stickyHeader}
                >
                    <div className={styles.toolbarSection}>
                        <Text className={styles.toolbarSectionTitle}>
                            <Trans>Actions</Trans>
                        </Text>
                        <div className={styles.toolbarRow}>
                            <Button
                                variant="light"
                                size="xs"
                                onClick={saveDiff.saveProjectToDisk}
                                className={styles.saveAllButtonMargin}
                                data-testid={TESTING_IDS.save.saveAllButton}
                            >
                                <Trans>Save all changes</Trans>
                            </Button>
                            <Button
                                variant="outline"
                                size="xs"
                                color="red"
                                onClick={saveDiff.handleRevertAll}
                                data-testid={TESTING_IDS.save.revertAllButton}
                            >
                                <Trans>Revert all changes</Trans>
                            </Button>

                            <Menu
                                shadow="md"
                                width={300}
                                position="bottom-start"
                            >
                                <Menu.Target>
                                    <Button variant="outline" size="xs">
                                        <Trans>View options</Trans>
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Stack gap="xs" p="xs">
                                        <SegmentedControl
                                            value={viewMode}
                                            onChange={(value) =>
                                                setViewMode(
                                                    value as DiffViewMode,
                                                )
                                            }
                                            data={[
                                                {
                                                    label: t`List view`,
                                                    value: "list",
                                                },
                                                {
                                                    label: t`Chapter view`,
                                                    value: "chapter",
                                                },
                                            ]}
                                            size="xs"
                                        />
                                        {viewMode === "chapter" && (
                                            <Select
                                                data={chapterOptions}
                                                value={selectedChapter}
                                                onChange={(value) =>
                                                    setSelectedChapter(
                                                        value ?? null,
                                                    )
                                                }
                                                placeholder={t`Select chapter`}
                                                size="xs"
                                                w={rem(220)}
                                            />
                                        )}
                                        <Button
                                            variant={
                                                showUsfmMarkers
                                                    ? "filled"
                                                    : "outline"
                                            }
                                            size="xs"
                                            onClick={() =>
                                                setShowUsfmMarkers(
                                                    (value) => !value,
                                                )
                                            }
                                        >
                                            <Trans>Show USFM markers</Trans>
                                        </Button>
                                        <Button
                                            variant={
                                                hideWhitespaceOnly
                                                    ? "filled"
                                                    : "outline"
                                            }
                                            size="xs"
                                            onClick={() =>
                                                setHideWhitespaceOnly(
                                                    (value) => !value,
                                                )
                                            }
                                        >
                                            <Trans>
                                                Hide whitespace-only diffs
                                            </Trans>
                                        </Button>
                                    </Stack>
                                </Menu.Dropdown>
                            </Menu>

                            <Menu
                                shadow="md"
                                width={240}
                                position="bottom-start"
                            >
                                <Menu.Target>
                                    <Button variant="subtle" size="xs">
                                        <Trans>More actions</Trans>
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    {import.meta.env.DEV && hasChanges && (
                                        <Menu.Item onClick={copyDiffsJson}>
                                            <Trans>Copy diffs (JSON)</Trans>
                                        </Menu.Item>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    </div>
                </div>
                <div
                    className={
                        showingChapterView
                            ? styles.modalBodyScrollable
                            : styles.modalBody
                    }
                >
                    {isCalculating && (
                        <Center className={styles.fullHeight}>
                            <Loader />
                        </Center>
                    )}

                    {!isCalculating && !hasChanges && (
                        <Center className={styles.fullHeight}>
                            <Text
                                data-testid={TESTING_IDS.save.noChangesMessage}
                            >
                                <Trans>No changes detected.</Trans>
                            </Text>
                        </Center>
                    )}

                    {!isCalculating &&
                        hasChanges &&
                        !showingChapterView &&
                        !hasVisibleDiffs && (
                            <Center className={styles.fullHeight}>
                                <Text
                                    data-testid={
                                        TESTING_IDS.save.noChangesMessage
                                    }
                                >
                                    <Trans>No changes detected.</Trans>
                                </Text>
                            </Center>
                        )}

                    {!isCalculating &&
                        hasChanges &&
                        !showingChapterView &&
                        hasVisibleDiffs && (
                            <VirtualizedDiffList
                                diffs={visibleDiffs ?? []}
                                revertDiff={revertDiff}
                                showUsfmMarkers={showUsfmMarkers}
                            />
                        )}

                    {!isCalculating &&
                        hasChanges &&
                        showingChapterView &&
                        hasVisibleChapter && (
                            <ChapterDiffStructuredDocument
                                diffs={selectedChapterDiffs}
                                chapterLabel={selectedChapterLabel}
                                revertDiff={revertDiff}
                                hideWhitespaceOnly={hideWhitespaceOnly}
                                showUsfmMarkers={showUsfmMarkers}
                                onRevertChapter={handleRevertSelectedChapter}
                            />
                        )}

                    {!isCalculating &&
                        hasChanges &&
                        showingChapterView &&
                        !hasVisibleChapter && (
                            <Center className={styles.fullHeight}>
                                <Text
                                    data-testid={
                                        TESTING_IDS.save.noChangesMessage
                                    }
                                >
                                    <Trans>No changes detected.</Trans>
                                </Text>
                            </Center>
                        )}
                </div>
            </Paper>
        </Modal>
    );
}
