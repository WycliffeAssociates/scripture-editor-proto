import { Menu } from "@base-ui/react/menu";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { MoreHorizontal } from "lucide-react";
import type { RefObject } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type {
    CompareMode,
    CompareSourceKind,
    CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/index.ts";
import { Switch } from "@/app/ui/components/primitives/Switch/index.ts";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

type DiffViewerToolbarProps = {
    onClose: () => void;
    isXs: boolean;
    compareMode: CompareMode;
    setCompareMode: (mode: CompareMode) => void;
    viewMode: "list" | "chapter";
    setViewMode: (mode: "list" | "chapter") => void;
    visibleChapterCount: number;
    visibleDiffCount: number;
    compareSummaryText: string;
    saveAllChanges: () => void;
    revertAllChanges: () => void;
    takeIncomingAll: () => void;
    resetExternalCompare: () => void;
    canApplyIncomingAll: boolean;
    hasChanges: boolean;
    compareSourceKind: CompareSourceKind;
    setCompareSourceKind: (kind: CompareSourceKind) => void;
    compareProjectOptions: Array<{ value: string; label: string }>;
    compareSourceProjectId: string;
    setCompareSourceProjectId: (id: string) => void;
    loadCompareProject: (projectId: string) => Promise<void>;
    compareVersionOptions: Array<{ value: string; label: string }>;
    compareSourceVersionHash: string;
    setCompareSourceVersionHash: (id: string) => void;
    loadCompareVersion: (commitHash: string) => Promise<void>;
    loadCompareRemoteLatest: () => void | Promise<void>;
    showUsfmMarkers: boolean;
    setShowUsfmMarkers: (value: boolean) => void;
    hideWhitespaceOnly: boolean;
    setHideWhitespaceOnly: (value: boolean) => void;
    chapterOptions: Array<{ value: string; label: string }>;
    selectedChapter: string | null;
    setSelectedChapter: (value: string | null) => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
    dirInputRef: RefObject<HTMLInputElement | null>;
    compareWarnings: CompareWarning[];
    copyDiffsJson: () => void;
};

export function DiffViewerToolbar({
    isXs,
    onClose,
    compareMode,
    setCompareMode,
    viewMode,
    setViewMode,
    visibleChapterCount,
    visibleDiffCount,
    compareSummaryText,
    saveAllChanges,
    revertAllChanges,
    takeIncomingAll,
    resetExternalCompare,
    canApplyIncomingAll,
    hasChanges,
    compareSourceKind,
    setCompareSourceKind,
    compareProjectOptions,
    compareSourceProjectId,
    setCompareSourceProjectId,
    loadCompareProject,
    compareVersionOptions,
    compareSourceVersionHash,
    setCompareSourceVersionHash,
    loadCompareVersion,
    loadCompareRemoteLatest,
    showUsfmMarkers,
    setShowUsfmMarkers,
    hideWhitespaceOnly,
    setHideWhitespaceOnly,
    chapterOptions,
    selectedChapter,
    setSelectedChapter,
    fileInputRef,
    dirInputRef,
    compareWarnings,
    copyDiffsJson,
}: DiffViewerToolbarProps) {
    const sourceLabel =
        compareSourceKind === COMPARE_SOURCE_KIND.EXISTING_PROJECT
            ? t`Existing project`
            : compareSourceKind === COMPARE_SOURCE_KIND.PREVIOUS_VERSION
              ? t`Previous version`
              : compareSourceKind === COMPARE_SOURCE_KIND.REMOTE_LATEST
                ? t`Incoming cloud changes`
                : compareSourceKind === COMPARE_SOURCE_KIND.ZIP_FILE
                  ? t`ZIP file`
                  : t`Folder`;

    return (
        <div className={styles.toolbarSection}>
            <div className={styles.overlayHeaderRow}>
                <h2 className={styles.modalTitle}>
                    {t`Review Changes Before Saving`}
                </h2>
                <Button variant="secondary" size="xs" onClick={onClose}>
                    {t`Close`}
                </Button>
            </div>

            {isXs ? (
                <>
                    <div className={styles.toolbarBand}>
                        <div className={styles.diffToolbarRow}>
                            <span className={styles.diffTextMuted}>
                                <Trans>{visibleChapterCount} chapters</Trans> •{" "}
                                <Trans>{visibleDiffCount} diffs</Trans>
                            </span>
                            <span className={styles.diffBadge}>
                                {compareMode === "unsaved"
                                    ? t`My changes`
                                    : t`Compare`}
                            </span>
                        </div>
                    </div>

                    <div className={styles.toolbarBand}>
                        <div className={styles.diffToolbarRow}>
                            <div className={styles.diffToolbarGroup}>
                                {compareMode === "unsaved" ? (
                                    <>
                                        <Button
                                            variant="primary"
                                            size="xs"
                                            onClick={saveAllChanges}
                                        >
                                            <Trans>Save</Trans>
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="xs"
                                            onClick={revertAllChanges}
                                        >
                                            <Trans>Revert</Trans>
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="primary"
                                            size="xs"
                                            onClick={takeIncomingAll}
                                            disabled={!canApplyIncomingAll}
                                        >
                                            <Trans>Apply all</Trans>
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="xs"
                                            onClick={resetExternalCompare}
                                        >
                                            <Trans>Reset</Trans>
                                        </Button>
                                    </>
                                )}
                            </div>

                            <Menu.Root>
                                <Menu.Trigger
                                    className={styles.diffMenuTrigger}
                                >
                                    <MoreHorizontal size={16} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner sideOffset={4}>
                                        <Menu.Popup
                                            className={styles.diffMenuPopup}
                                        >
                                            <div
                                                className={styles.diffMenuLabel}
                                            >
                                                <Trans>Mode</Trans>
                                            </div>
                                            <Menu.Item
                                                className={styles.diffMenuItem}
                                                onClick={() =>
                                                    setCompareMode("unsaved")
                                                }
                                            >
                                                <Trans>My changes</Trans>
                                            </Menu.Item>
                                            <Menu.Item
                                                className={styles.diffMenuItem}
                                                onClick={() =>
                                                    setCompareMode("external")
                                                }
                                            >
                                                <Trans>
                                                    Compare with source
                                                </Trans>
                                            </Menu.Item>
                                            <div
                                                className={
                                                    styles.diffMenuDivider
                                                }
                                            />
                                            <div
                                                className={styles.diffMenuLabel}
                                            >
                                                <Trans>View</Trans>
                                            </div>
                                            <Menu.Item
                                                className={styles.diffMenuItem}
                                                onClick={() =>
                                                    setShowUsfmMarkers(
                                                        !showUsfmMarkers,
                                                    )
                                                }
                                            >
                                                <Trans>USFM markers</Trans>
                                            </Menu.Item>
                                            <Menu.Item
                                                className={styles.diffMenuItem}
                                                onClick={() =>
                                                    setHideWhitespaceOnly(
                                                        !hideWhitespaceOnly,
                                                    )
                                                }
                                            >
                                                <Trans>Hide whitespace</Trans>
                                            </Menu.Item>
                                            {compareMode === "external" && (
                                                <>
                                                    <div
                                                        className={
                                                            styles.diffMenuDivider
                                                        }
                                                    />
                                                    <div
                                                        className={
                                                            styles.diffMenuLabel
                                                        }
                                                    >
                                                        <Trans>Compare</Trans>
                                                    </div>
                                                    <div
                                                        className={
                                                            styles.diffToolbarStack
                                                        }
                                                    >
                                                        <div
                                                            className={
                                                                styles.diffToolbarGroup
                                                            }
                                                        >
                                                            <Button
                                                                variant="secondary"
                                                                size="xs"
                                                                onClick={() =>
                                                                    setCompareSourceKind(
                                                                        COMPARE_SOURCE_KIND.EXISTING_PROJECT,
                                                                    )
                                                                }
                                                            >
                                                                <Trans>
                                                                    Project
                                                                </Trans>
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="xs"
                                                                onClick={() =>
                                                                    setCompareSourceKind(
                                                                        COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
                                                                    )
                                                                }
                                                            >
                                                                <Trans>
                                                                    Version
                                                                </Trans>
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="xs"
                                                                onClick={() => {
                                                                    setCompareSourceKind(
                                                                        COMPARE_SOURCE_KIND.REMOTE_LATEST,
                                                                    );
                                                                    void loadCompareRemoteLatest();
                                                                }}
                                                            >
                                                                <Trans>
                                                                    Cloud
                                                                </Trans>
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="xs"
                                                                onClick={() => {
                                                                    setCompareSourceKind(
                                                                        COMPARE_SOURCE_KIND.ZIP_FILE,
                                                                    );
                                                                    fileInputRef.current?.click();
                                                                }}
                                                            >
                                                                <Trans>
                                                                    ZIP...
                                                                </Trans>
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="xs"
                                                                onClick={() => {
                                                                    setCompareSourceKind(
                                                                        COMPARE_SOURCE_KIND.DIRECTORY,
                                                                    );
                                                                    dirInputRef.current?.click();
                                                                }}
                                                            >
                                                                <Trans>
                                                                    Folder...
                                                                </Trans>
                                                            </Button>
                                                        </div>
                                                        {compareSourceKind ===
                                                            COMPARE_SOURCE_KIND.EXISTING_PROJECT && (
                                                            <SelectPrimitive
                                                                items={
                                                                    compareProjectOptions
                                                                }
                                                                value={
                                                                    compareSourceProjectId
                                                                }
                                                                onValueChange={(
                                                                    value,
                                                                ) => {
                                                                    const next =
                                                                        value ??
                                                                        "";
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
                                                            />
                                                        )}
                                                        {compareSourceKind ===
                                                            COMPARE_SOURCE_KIND.PREVIOUS_VERSION && (
                                                            <SelectPrimitive
                                                                items={
                                                                    compareVersionOptions
                                                                }
                                                                value={
                                                                    compareSourceVersionHash
                                                                }
                                                                onValueChange={(
                                                                    value,
                                                                ) => {
                                                                    const next =
                                                                        value ??
                                                                        "";
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
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                            <div
                                                className={
                                                    styles.diffMenuDivider
                                                }
                                            />
                                            <Menu.Item
                                                className={styles.diffMenuItem}
                                                onClick={copyDiffsJson}
                                                disabled={
                                                    !import.meta.env.DEV ||
                                                    !hasChanges
                                                }
                                            >
                                                <Trans>Copy diffs (JSON)</Trans>
                                            </Menu.Item>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.toolbarBand}>
                        <div className={styles.diffToolbarRow}>
                            <ToggleGroup
                                value={compareMode}
                                onValueChange={(value) =>
                                    setCompareMode(value as CompareMode)
                                }
                                items={[
                                    { label: t`My changes`, value: "unsaved" },
                                    {
                                        label: t`Compare with source`,
                                        value: "external",
                                    },
                                ]}
                            />
                            <span className={styles.diffTextMuted}>
                                <Trans>{visibleChapterCount} chapters</Trans> •{" "}
                                <Trans>{visibleDiffCount} diffs</Trans>
                            </span>
                        </div>
                    </div>

                    {compareMode === "external" && (
                        <div className={styles.toolbarBand}>
                            <div className={styles.diffToolbarStack}>
                                <div className={styles.diffToolbarGroup}>
                                    <Menu.Root>
                                        <Menu.Trigger
                                            className={styles.diffMenuTrigger}
                                        >
                                            <span>{sourceLabel}</span>
                                        </Menu.Trigger>
                                        <Menu.Portal>
                                            <Menu.Positioner sideOffset={4}>
                                                <Menu.Popup
                                                    className={
                                                        styles.diffMenuPopup
                                                    }
                                                >
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={() =>
                                                            setCompareSourceKind(
                                                                COMPARE_SOURCE_KIND.EXISTING_PROJECT,
                                                            )
                                                        }
                                                    >
                                                        <Trans>
                                                            Existing project
                                                        </Trans>
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={() =>
                                                            setCompareSourceKind(
                                                                COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
                                                            )
                                                        }
                                                    >
                                                        <Trans>
                                                            Previous version
                                                        </Trans>
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={() => {
                                                            setCompareSourceKind(
                                                                COMPARE_SOURCE_KIND.REMOTE_LATEST,
                                                            );
                                                            void loadCompareRemoteLatest();
                                                        }}
                                                    >
                                                        <Trans>
                                                            Incoming cloud
                                                            changes
                                                        </Trans>
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={() => {
                                                            setCompareSourceKind(
                                                                COMPARE_SOURCE_KIND.ZIP_FILE,
                                                            );
                                                            fileInputRef.current?.click();
                                                        }}
                                                    >
                                                        <Trans>
                                                            ZIP file...
                                                        </Trans>
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={() => {
                                                            setCompareSourceKind(
                                                                COMPARE_SOURCE_KIND.DIRECTORY,
                                                            );
                                                            dirInputRef.current?.click();
                                                        }}
                                                    >
                                                        <Trans>Folder...</Trans>
                                                    </Menu.Item>
                                                </Menu.Popup>
                                            </Menu.Positioner>
                                        </Menu.Portal>
                                    </Menu.Root>

                                    {compareSourceKind ===
                                        COMPARE_SOURCE_KIND.EXISTING_PROJECT && (
                                        <SelectPrimitive
                                            items={compareProjectOptions}
                                            value={compareSourceProjectId}
                                            onValueChange={(value) => {
                                                const next = value ?? "";
                                                setCompareSourceProjectId(next);
                                                if (next) {
                                                    void loadCompareProject(
                                                        next,
                                                    );
                                                }
                                            }}
                                            placeholder={t`Select source project`}
                                            className={styles.compareSelect}
                                        />
                                    )}
                                    {compareSourceKind ===
                                        COMPARE_SOURCE_KIND.PREVIOUS_VERSION && (
                                        <SelectPrimitive
                                            items={compareVersionOptions}
                                            value={compareSourceVersionHash}
                                            onValueChange={(value) => {
                                                const next = value ?? "";
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
                                            className={styles.compareSelect}
                                        />
                                    )}
                                    <span className={styles.diffBadge}>
                                        {compareSummaryText}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={styles.toolbarBand}>
                        <div className={styles.diffToolbarRow}>
                            <div className={styles.diffToolbarGroup}>
                                <ToggleGroup
                                    value={viewMode}
                                    onValueChange={(value) =>
                                        setViewMode(value as "list" | "chapter")
                                    }
                                    items={[
                                        { label: t`List view`, value: "list" },
                                        {
                                            label: t`Chapter view`,
                                            value: "chapter",
                                        },
                                    ]}
                                />
                                {selectedChapter && (
                                    <SelectPrimitive
                                        items={chapterOptions}
                                        value={selectedChapter}
                                        onValueChange={(value) =>
                                            setSelectedChapter(value ?? null)
                                        }
                                        placeholder={t`Select chapter`}
                                        className={styles.chapterSelect}
                                    />
                                )}
                            </div>

                            <div className={styles.diffToolbarGroup}>
                                <Switch
                                    checked={showUsfmMarkers}
                                    onCheckedChange={setShowUsfmMarkers}
                                    label={t`USFM markers`}
                                />
                                <Switch
                                    checked={hideWhitespaceOnly}
                                    onCheckedChange={setHideWhitespaceOnly}
                                    label={t`Hide whitespace`}
                                />

                                <div className={styles.diffToolbarGroup}>
                                    {compareMode === "unsaved" ? (
                                        <>
                                            <Button
                                                variant="primary"
                                                size="xs"
                                                onClick={saveAllChanges}
                                                data-testid={
                                                    TESTING_IDS.save
                                                        .saveAllButton
                                                }
                                            >
                                                <Trans>Save all changes</Trans>
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="xs"
                                                onClick={revertAllChanges}
                                                data-testid={
                                                    TESTING_IDS.save
                                                        .revertAllButton
                                                }
                                            >
                                                <Trans>
                                                    Revert all changes
                                                </Trans>
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                variant="primary"
                                                size="xs"
                                                onClick={takeIncomingAll}
                                                disabled={!canApplyIncomingAll}
                                            >
                                                <Trans>Apply all</Trans>
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="xs"
                                                onClick={resetExternalCompare}
                                            >
                                                <Trans>Reset compare</Trans>
                                            </Button>
                                        </>
                                    )}
                                </div>

                                {import.meta.env.DEV && hasChanges ? (
                                    <Menu.Root>
                                        <Menu.Trigger
                                            className={styles.diffMenuTrigger}
                                        >
                                            <MoreHorizontal size={16} />
                                        </Menu.Trigger>
                                        <Menu.Portal>
                                            <Menu.Positioner sideOffset={4}>
                                                <Menu.Popup
                                                    className={
                                                        styles.diffMenuPopup
                                                    }
                                                >
                                                    <Menu.Item
                                                        className={
                                                            styles.diffMenuItem
                                                        }
                                                        onClick={copyDiffsJson}
                                                    >
                                                        <Trans>
                                                            Copy diffs (JSON)
                                                        </Trans>
                                                    </Menu.Item>
                                                </Menu.Popup>
                                            </Menu.Positioner>
                                        </Menu.Portal>
                                    </Menu.Root>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {compareWarnings.length > 0 && (
                <div className={styles.warningStrip}>
                    <div className={styles.diffToolbarStack}>
                        {compareWarnings.map((warning) => (
                            <span
                                className={styles.diffTextMuted}
                                key={warning.code}
                            >
                                {warning.message}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
