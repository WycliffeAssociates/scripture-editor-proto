import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
    ActionIcon,
    Badge,
    Button,
    Center,
    Group,
    Loader,
    Menu,
    Modal,
    Paper,
    rem,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
} from "@mantine/core";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type {
    CompareMode,
    CompareSourceKind,
    CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { buildChapterOptions } from "@/app/ui/components/blocks/DiffModal/chapterOptions.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import { VirtualizedDiffList } from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import type { ListedProject } from "@/core/persistence/ProjectRepository.ts";

type DiffActionMode = "unsaved" | "external";

export type DiffViewerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    diffs: ProjectDiff[] | null;
    diffsByChapter: DiffsByChapter;
    isCalculating: boolean;
    actionMode: DiffActionMode;
    onRevertDiff: (diffToRevert: ProjectDiff) => void;
    onRevertChapter: (bookCode: string, chapterNum: number) => void;
    onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
    onApplyChapterToCurrent: (bookCode: string, chapterNum: number) => void;
    saveAllChanges: () => void;
    revertAllChanges: () => void;
    compareMode: CompareMode;
    setCompareMode: (mode: CompareMode) => void;
    compareSourceKind: CompareSourceKind;
    setCompareSourceKind: (kind: CompareSourceKind) => void;
    compareSourceProjectId: string;
    setCompareSourceProjectId: (id: string) => void;
    compareSourceVersionHash: string;
    setCompareSourceVersionHash: (id: string) => void;
    compareProjects: ListedProject[];
    compareVersionOptions: Array<{ value: string; label: string }>;
    loadCompareProject: (projectId: string) => Promise<void>;
    loadCompareZip: (file: File) => Promise<void>;
    loadCompareDirectory: (files: FileList) => Promise<void>;
    loadCompareVersion: (commitHash: string) => Promise<void>;
    compareWarnings: CompareWarning[];
    takeIncomingAll: () => void;
    hasComputedCompare: boolean;
    resetExternalCompare: () => void;
    isSm?: boolean;
    isXs?: boolean;
};

type DiffViewMode = "list" | "chapter";
const DIFF_VIEW_STORAGE_KEY = "diff-modal:last-view-mode";

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
    actionMode,
    onRevertDiff,
    onRevertChapter,
    onApplyDiffToCurrent,
    onApplyChapterToCurrent,
    saveAllChanges,
    revertAllChanges,
    compareMode,
    setCompareMode,
    compareSourceKind,
    setCompareSourceKind,
    compareSourceProjectId,
    setCompareSourceProjectId,
    compareSourceVersionHash,
    setCompareSourceVersionHash,
    compareProjects,
    compareVersionOptions,
    loadCompareProject,
    loadCompareZip,
    loadCompareDirectory,
    loadCompareVersion,
    compareWarnings,
    takeIncomingAll,
    hasComputedCompare,
    resetExternalCompare,
    isSm = false,
    isXs = false,
}: DiffViewerModalProps) {
    const hasChanges = (diffs?.length ?? 0) > 0;
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const isExternalActionMode = actionMode === "external";
    const [hideWhitespaceOnly, setHideWhitespaceOnly] = useState(false);
    const [showUsfmMarkers, setShowUsfmMarkers] = useState(false);
    const [viewMode, setViewMode] = useState<DiffViewMode>("list");
    const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dirInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!isOpen || typeof window === "undefined") return;
        const saved = window.localStorage.getItem(DIFF_VIEW_STORAGE_KEY);
        if (saved === "list" || saved === "chapter") {
            setViewMode(saved);
        }
    }, [isOpen]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(DIFF_VIEW_STORAGE_KEY, viewMode);
    }, [viewMode]);

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
        return buildChapterOptions({
            diffsByChapter,
            hideWhitespaceOnly,
            formatBookLabel: (bookCode) =>
                bookCodeToProjectLocalizedTitle({ bookCode }),
        });
    }, [bookCodeToProjectLocalizedTitle, diffsByChapter, hideWhitespaceOnly]);

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

    const handleSelectedChapterAction = () => {
        if (!selectedChapter) return;
        const parsed = parseChapterKey(selectedChapter);
        if (!parsed.bookCode || Number.isNaN(parsed.chapterNum)) return;
        if (isExternalActionMode) {
            onApplyChapterToCurrent(parsed.bookCode, parsed.chapterNum);
            return;
        }
        onRevertChapter(parsed.bookCode, parsed.chapterNum);
    };

    const compareProjectOptions = compareProjects.map((project) => {
        const routeProjectId =
            project.projectDirectoryPath.split("/").pop() ??
            project.projectDirectoryPath;
        return {
            value: routeProjectId,
            label:
                project.id && project.id !== project.name
                    ? `${project.name} (${project.id})`
                    : project.name,
        };
    });

    const compareProjectLabelById = new Map(
        compareProjectOptions.map((option) => [option.value, option.label]),
    );
    const visibleDiffCount = visibleDiffs?.length ?? 0;
    const visibleChapterCount = new Set(
        (visibleDiffs ?? []).map(
            (diff) => `${diff.bookCode}:${diff.chapterNum}`,
        ),
    ).size;
    const unsavedBooksCount = new Set(
        (visibleDiffs ?? []).map((d) => d.bookCode),
    ).size;
    const sourceLabel =
        compareSourceKind === "existingProject"
            ? (compareProjectLabelById.get(compareSourceProjectId) ??
              t`No source selected`)
            : compareSourceKind === "previousVersion"
              ? (compareVersionOptions.find(
                    (option) => option.value === compareSourceVersionHash,
                )?.label ?? t`No version selected`)
              : compareSourceKind === "zipFile"
                ? t`ZIP file`
                : t`Folder`;
    const compareSummaryText =
        compareMode === "external"
            ? t`Comparing your current vs ${sourceLabel}`
            : t`Unsaved changes in ${unsavedBooksCount} book(s)`;
    const hasCompareSourceSelection =
        compareSourceKind === "existingProject"
            ? Boolean(compareSourceProjectId)
            : compareSourceKind === "previousVersion"
              ? Boolean(compareSourceVersionHash)
              : hasComputedCompare;
    const canApplyIncomingAll =
        compareMode === "external" &&
        hasComputedCompare &&
        hasCompareSourceSelection &&
        hasVisibleDiffs;

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
                        {isXs ? (
                            <>
                                <div className={styles.toolbarBand}>
                                    <Group
                                        justify="space-between"
                                        align="center"
                                        wrap="nowrap"
                                    >
                                        <Text c="dimmed" size="xs">
                                            <Trans>
                                                {visibleChapterCount} chapters
                                            </Trans>{" "}
                                            •{" "}
                                            <Trans>
                                                {visibleDiffCount} diffs
                                            </Trans>
                                        </Text>
                                        <Badge
                                            variant="light"
                                            color="gray"
                                            size="sm"
                                        >
                                            {compareMode === "unsaved"
                                                ? t`My changes`
                                                : t`Compare`}
                                        </Badge>
                                    </Group>
                                </div>

                                <div className={styles.toolbarBand}>
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                        gap="xs"
                                    >
                                        <Group gap={rem(4)} wrap="nowrap">
                                            {compareMode === "unsaved" ? (
                                                <>
                                                    <Button
                                                        variant="filled"
                                                        size="xs"
                                                        onClick={saveAllChanges}
                                                        data-testid={
                                                            TESTING_IDS.save
                                                                .saveAllButton
                                                        }
                                                    >
                                                        <Trans>Save</Trans>
                                                    </Button>
                                                    <Button
                                                        variant="light"
                                                        size="xs"
                                                        color="red"
                                                        onClick={
                                                            revertAllChanges
                                                        }
                                                        data-testid={
                                                            TESTING_IDS.save
                                                                .revertAllButton
                                                        }
                                                    >
                                                        <Trans>Revert</Trans>
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="filled"
                                                        size="xs"
                                                        onClick={
                                                            takeIncomingAll
                                                        }
                                                        disabled={
                                                            !canApplyIncomingAll
                                                        }
                                                    >
                                                        <Trans>Apply all</Trans>
                                                    </Button>
                                                    <Button
                                                        variant="default"
                                                        size="xs"
                                                        onClick={
                                                            resetExternalCompare
                                                        }
                                                    >
                                                        <Trans>Reset</Trans>
                                                    </Button>
                                                </>
                                            )}
                                        </Group>

                                        <Menu
                                            shadow="md"
                                            width={280}
                                            position="bottom-end"
                                            closeOnItemClick={false}
                                        >
                                            <Menu.Target>
                                                <Button
                                                    variant="default"
                                                    size="xs"
                                                >
                                                    <Trans>Controls</Trans>
                                                </Button>
                                            </Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Label>
                                                    <Trans>Mode</Trans>
                                                </Menu.Label>
                                                <Menu.Item
                                                    onClick={() =>
                                                        setCompareMode(
                                                            "unsaved",
                                                        )
                                                    }
                                                    closeMenuOnClick={false}
                                                >
                                                    <Trans>My changes</Trans>
                                                </Menu.Item>
                                                <Menu.Item
                                                    onClick={() =>
                                                        setCompareMode(
                                                            "external",
                                                        )
                                                    }
                                                    closeMenuOnClick={false}
                                                >
                                                    <Trans>
                                                        Compare with source
                                                    </Trans>
                                                </Menu.Item>

                                                <Menu.Divider />
                                                <Menu.Label>
                                                    <Trans>View</Trans>
                                                </Menu.Label>
                                                <Menu.Item
                                                    onClick={() =>
                                                        setViewMode("list")
                                                    }
                                                    closeMenuOnClick={false}
                                                >
                                                    <Trans>List view</Trans>
                                                </Menu.Item>
                                                <Menu.Item
                                                    onClick={() =>
                                                        setViewMode("chapter")
                                                    }
                                                    closeMenuOnClick={false}
                                                >
                                                    <Trans>Chapter view</Trans>
                                                </Menu.Item>
                                                {viewMode === "chapter" && (
                                                    <Stack px="xs" pb="xs">
                                                        <Select
                                                            data={
                                                                chapterOptions
                                                            }
                                                            value={
                                                                selectedChapter
                                                            }
                                                            onChange={(value) =>
                                                                setSelectedChapter(
                                                                    value ??
                                                                        null,
                                                                )
                                                            }
                                                            placeholder={t`Select chapter`}
                                                            size="xs"
                                                            w="100%"
                                                        />
                                                    </Stack>
                                                )}

                                                <Menu.Divider />
                                                <Menu.Item
                                                    closeMenuOnClick={false}
                                                    onClick={() =>
                                                        setShowUsfmMarkers(
                                                            !showUsfmMarkers,
                                                        )
                                                    }
                                                >
                                                    <Group
                                                        justify="space-between"
                                                        wrap="nowrap"
                                                    >
                                                        <Text size="sm">
                                                            <Trans>
                                                                USFM markers
                                                            </Trans>
                                                        </Text>
                                                        <Switch
                                                            checked={
                                                                showUsfmMarkers
                                                            }
                                                            onChange={() => {}}
                                                            size="xs"
                                                            style={{
                                                                pointerEvents:
                                                                    "none",
                                                            }}
                                                        />
                                                    </Group>
                                                </Menu.Item>
                                                <Menu.Item
                                                    closeMenuOnClick={false}
                                                    onClick={() =>
                                                        setHideWhitespaceOnly(
                                                            !hideWhitespaceOnly,
                                                        )
                                                    }
                                                >
                                                    <Group
                                                        justify="space-between"
                                                        wrap="nowrap"
                                                    >
                                                        <Text size="sm">
                                                            <Trans>
                                                                Hide whitespace
                                                            </Trans>
                                                        </Text>
                                                        <Switch
                                                            checked={
                                                                hideWhitespaceOnly
                                                            }
                                                            onChange={() => {}}
                                                            size="xs"
                                                            style={{
                                                                pointerEvents:
                                                                    "none",
                                                            }}
                                                        />
                                                    </Group>
                                                </Menu.Item>

                                                {compareMode === "external" && (
                                                    <>
                                                        <Menu.Divider />
                                                        <Menu.Label>
                                                            <Trans>
                                                                Compare
                                                            </Trans>
                                                        </Menu.Label>
                                                        <Stack
                                                            px="xs"
                                                            pb="xs"
                                                            gap="xs"
                                                        >
                                                            <Group
                                                                gap="xs"
                                                                wrap="wrap"
                                                            >
                                                                <Button
                                                                    variant="default"
                                                                    size="xs"
                                                                    onClick={() =>
                                                                        setCompareSourceKind(
                                                                            "existingProject",
                                                                        )
                                                                    }
                                                                >
                                                                    <Trans>
                                                                        Project
                                                                    </Trans>
                                                                </Button>
                                                                <Button
                                                                    variant="default"
                                                                    size="xs"
                                                                    onClick={() =>
                                                                        setCompareSourceKind(
                                                                            "previousVersion",
                                                                        )
                                                                    }
                                                                >
                                                                    <Trans>
                                                                        Version
                                                                    </Trans>
                                                                </Button>
                                                                <Button
                                                                    variant="default"
                                                                    size="xs"
                                                                    onClick={() => {
                                                                        setCompareSourceKind(
                                                                            "zipFile",
                                                                        );
                                                                        fileInputRef.current?.click();
                                                                    }}
                                                                >
                                                                    <Trans>
                                                                        ZIP...
                                                                    </Trans>
                                                                </Button>
                                                                <Button
                                                                    variant="default"
                                                                    size="xs"
                                                                    onClick={() => {
                                                                        setCompareSourceKind(
                                                                            "directory",
                                                                        );
                                                                        dirInputRef.current?.click();
                                                                    }}
                                                                >
                                                                    <Trans>
                                                                        Folder...
                                                                    </Trans>
                                                                </Button>
                                                            </Group>
                                                            {compareSourceKind ===
                                                                "existingProject" && (
                                                                <Select
                                                                    data={
                                                                        compareProjectOptions
                                                                    }
                                                                    value={
                                                                        compareSourceProjectId
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) => {
                                                                        const next =
                                                                            value ??
                                                                            "";
                                                                        setCompareSourceProjectId(
                                                                            next,
                                                                        );
                                                                        if (
                                                                            next
                                                                        ) {
                                                                            void loadCompareProject(
                                                                                next,
                                                                            );
                                                                        }
                                                                    }}
                                                                    placeholder={t`Select source project`}
                                                                    size="xs"
                                                                    w="100%"
                                                                />
                                                            )}
                                                            {compareSourceKind ===
                                                                "previousVersion" && (
                                                                <Select
                                                                    data={
                                                                        compareVersionOptions
                                                                    }
                                                                    value={
                                                                        compareSourceVersionHash
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) => {
                                                                        const next =
                                                                            value ??
                                                                            "";
                                                                        setCompareSourceVersionHash(
                                                                            next,
                                                                        );
                                                                        if (
                                                                            next
                                                                        ) {
                                                                            void loadCompareVersion(
                                                                                next,
                                                                            );
                                                                        }
                                                                    }}
                                                                    placeholder={t`Select previous version`}
                                                                    size="xs"
                                                                    w="100%"
                                                                />
                                                            )}
                                                        </Stack>
                                                    </>
                                                )}

                                                <Menu.Divider />
                                                <Menu.Item
                                                    onClick={copyDiffsJson}
                                                    disabled={
                                                        !import.meta.env.DEV ||
                                                        !hasChanges
                                                    }
                                                >
                                                    <Trans>
                                                        Copy diffs (JSON)
                                                    </Trans>
                                                </Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Group>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.toolbarBand}>
                                    <Group
                                        justify="space-between"
                                        align="center"
                                        gap="sm"
                                        wrap="nowrap"
                                    >
                                        <SegmentedControl
                                            value={compareMode}
                                            onChange={(value) =>
                                                setCompareMode(
                                                    value as CompareMode,
                                                )
                                            }
                                            data={[
                                                {
                                                    label: t`My changes`,
                                                    value: "unsaved",
                                                },
                                                {
                                                    label: t`Compare with source`,
                                                    value: "external",
                                                },
                                            ]}
                                            size="xs"
                                        />
                                        <Text c="dimmed" size="xs">
                                            <Trans>
                                                {visibleChapterCount} chapters
                                            </Trans>{" "}
                                            •{" "}
                                            <Trans>
                                                {visibleDiffCount} diffs
                                            </Trans>
                                        </Text>
                                    </Group>
                                </div>

                                {compareMode === "external" && (
                                    <div className={styles.toolbarBand}>
                                        <Stack gap="xs">
                                            <Group gap="xs" wrap="wrap">
                                                <Menu
                                                    shadow="md"
                                                    width={220}
                                                    position="bottom-start"
                                                >
                                                    <Menu.Target>
                                                        <Button
                                                            variant="default"
                                                            size="xs"
                                                        >
                                                            <Trans>
                                                                Source type
                                                            </Trans>
                                                        </Button>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Item
                                                            onClick={() =>
                                                                setCompareSourceKind(
                                                                    "existingProject",
                                                                )
                                                            }
                                                        >
                                                            <Trans>
                                                                Existing project
                                                            </Trans>
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() =>
                                                                setCompareSourceKind(
                                                                    "previousVersion",
                                                                )
                                                            }
                                                        >
                                                            <Trans>
                                                                Previous version
                                                            </Trans>
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() => {
                                                                setCompareSourceKind(
                                                                    "zipFile",
                                                                );
                                                                fileInputRef.current?.click();
                                                            }}
                                                        >
                                                            <Trans>
                                                                ZIP file...
                                                            </Trans>
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() => {
                                                                setCompareSourceKind(
                                                                    "directory",
                                                                );
                                                                dirInputRef.current?.click();
                                                            }}
                                                        >
                                                            <Trans>
                                                                Folder...
                                                            </Trans>
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                                {compareSourceKind ===
                                                    "existingProject" && (
                                                    <Select
                                                        data={
                                                            compareProjectOptions
                                                        }
                                                        value={
                                                            compareSourceProjectId
                                                        }
                                                        onChange={(value) => {
                                                            const next =
                                                                value ?? "";
                                                            setCompareSourceProjectId(
                                                                next,
                                                            );
                                                            if (next) {
                                                                void loadCompareProject(
                                                                    next,
                                                                );
                                                            }
                                                        }}
                                                        placeholder={t`Select source project`}
                                                        size="xs"
                                                        w={rem(260)}
                                                    />
                                                )}
                                                {compareSourceKind ===
                                                    "previousVersion" && (
                                                    <Select
                                                        data={
                                                            compareVersionOptions
                                                        }
                                                        value={
                                                            compareSourceVersionHash
                                                        }
                                                        onChange={(value) => {
                                                            const next =
                                                                value ?? "";
                                                            setCompareSourceVersionHash(
                                                                next,
                                                            );
                                                            if (next) {
                                                                void loadCompareVersion(
                                                                    next,
                                                                );
                                                            }
                                                        }}
                                                        placeholder={t`Select previous version`}
                                                        size="xs"
                                                        w={rem(260)}
                                                    />
                                                )}
                                                <Badge
                                                    variant="light"
                                                    color="gray"
                                                    size="md"
                                                >
                                                    {compareSummaryText}
                                                </Badge>
                                            </Group>
                                        </Stack>
                                    </div>
                                )}

                                <div className={styles.toolbarBand}>
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                        gap="xs"
                                    >
                                        <Group
                                            gap="xs"
                                            wrap="nowrap"
                                            align="center"
                                        >
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
                                        </Group>

                                        <Group gap="xs" wrap="nowrap">
                                            <Switch
                                                checked={showUsfmMarkers}
                                                onChange={(event) =>
                                                    setShowUsfmMarkers(
                                                        event.currentTarget
                                                            .checked,
                                                    )
                                                }
                                                size="xs"
                                                label={t`USFM markers`}
                                            />
                                            <Switch
                                                checked={hideWhitespaceOnly}
                                                onChange={(event) =>
                                                    setHideWhitespaceOnly(
                                                        event.currentTarget
                                                            .checked,
                                                    )
                                                }
                                                size="xs"
                                                label={t`Hide whitespace`}
                                            />

                                            <Group gap={rem(4)} wrap="nowrap">
                                                {compareMode === "unsaved" ? (
                                                    <>
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            onClick={
                                                                saveAllChanges
                                                            }
                                                            data-testid={
                                                                TESTING_IDS.save
                                                                    .saveAllButton
                                                            }
                                                        >
                                                            <Trans>
                                                                Save all changes
                                                            </Trans>
                                                        </Button>
                                                        <Button
                                                            variant="light"
                                                            size="xs"
                                                            color="red"
                                                            onClick={
                                                                revertAllChanges
                                                            }
                                                            data-testid={
                                                                TESTING_IDS.save
                                                                    .revertAllButton
                                                            }
                                                        >
                                                            <Trans>
                                                                Revert all
                                                                changes
                                                            </Trans>
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="filled"
                                                            size="xs"
                                                            onClick={
                                                                takeIncomingAll
                                                            }
                                                            disabled={
                                                                !canApplyIncomingAll
                                                            }
                                                        >
                                                            <Trans>
                                                                Apply all
                                                            </Trans>
                                                        </Button>
                                                        <Button
                                                            variant="default"
                                                            size="xs"
                                                            onClick={
                                                                resetExternalCompare
                                                            }
                                                        >
                                                            <Trans>
                                                                Reset compare
                                                            </Trans>
                                                        </Button>
                                                    </>
                                                )}

                                                <Menu
                                                    shadow="md"
                                                    width={220}
                                                    position="bottom-end"
                                                >
                                                    <Menu.Target>
                                                        <ActionIcon
                                                            variant="subtle"
                                                            size="sm"
                                                            aria-label={t`More actions`}
                                                        >
                                                            <MoreHorizontal
                                                                size={16}
                                                            />
                                                        </ActionIcon>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        {import.meta.env.DEV &&
                                                            hasChanges && (
                                                                <Menu.Item
                                                                    onClick={
                                                                        copyDiffsJson
                                                                    }
                                                                >
                                                                    <Trans>
                                                                        Copy
                                                                        diffs
                                                                        (JSON)
                                                                    </Trans>
                                                                </Menu.Item>
                                                            )}
                                                    </Menu.Dropdown>
                                                </Menu>
                                            </Group>
                                        </Group>
                                    </Group>
                                </div>
                            </>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".zip"
                            style={{ display: "none" }}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                setCompareSourceKind("zipFile");
                                void loadCompareZip(file);
                                event.currentTarget.value = "";
                            }}
                        />

                        <input
                            ref={dirInputRef}
                            type="file"
                            webkitdirectory="true"
                            multiple
                            style={{ display: "none" }}
                            onChange={(event) => {
                                const files = event.target.files;
                                if (!files?.length) return;
                                setCompareSourceKind("directory");
                                void loadCompareDirectory(files);
                                event.currentTarget.value = "";
                            }}
                        />

                        {compareMode === "unsaved" && (
                            <div style={{ paddingLeft: rem(8) }}>
                                <Text c="dimmed" size="xs" fw={500}>
                                    {compareSummaryText}
                                </Text>
                            </div>
                        )}

                        {compareMode === "external" &&
                            compareWarnings.length > 0 && (
                                <div className={styles.warningStrip}>
                                    <Stack gap={2}>
                                        {compareWarnings.map((warning) => (
                                            <Text
                                                c="orange"
                                                size="xs"
                                                key={warning.code}
                                            >
                                                {warning.message}
                                            </Text>
                                        ))}
                                    </Stack>
                                </div>
                            )}
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
                                actionMode={actionMode}
                                onRevertDiff={onRevertDiff}
                                onApplyDiffToCurrent={onApplyDiffToCurrent}
                                originalLabel={
                                    isExternalActionMode
                                        ? t`Your current`
                                        : t`Original`
                                }
                                currentLabel={
                                    isExternalActionMode
                                        ? t`Comparison`
                                        : t`Current`
                                }
                                showUsfmMarkers={showUsfmMarkers}
                                isOpen={isOpen}
                            />
                        )}

                    {!isCalculating &&
                        hasChanges &&
                        showingChapterView &&
                        hasVisibleChapter && (
                            <ChapterDiffStructuredDocument
                                diffs={selectedChapterDiffs}
                                actionMode={actionMode}
                                chapterLabel={selectedChapterLabel}
                                onRevertDiff={onRevertDiff}
                                onApplyDiffToCurrent={onApplyDiffToCurrent}
                                hideWhitespaceOnly={hideWhitespaceOnly}
                                showUsfmMarkers={showUsfmMarkers}
                                onChapterAction={handleSelectedChapterAction}
                                originalLabel={
                                    isExternalActionMode
                                        ? t`Your current`
                                        : t`Original`
                                }
                                currentLabel={
                                    isExternalActionMode
                                        ? t`Comparison`
                                        : t`Current`
                                }
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
