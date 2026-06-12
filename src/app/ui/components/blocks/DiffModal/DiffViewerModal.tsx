import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type {
  CompareMode,
  CompareSourceKind,
  CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
import type {
  DiffsByChapter,
  ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { buildChapterOptions } from "@/app/ui/components/blocks/DiffModal/chapterOptions.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import { VirtualizedDiffList } from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import { DiffViewerToolbar } from "@/app/ui/components/blocks/DiffModal/DiffViewerToolbar.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

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
  compareProjects: ProjectListItem[];
  compareVersionOptions: Array<{ value: string; label: string }>;
  loadCompareProject: (projectId: string) => Promise<void>;
  loadCompareZip: (file: File) => Promise<void>;
  loadCompareDirectory: (files: FileList) => Promise<void>;
  loadCompareVersion: (commitHash: string) => Promise<void>;
  loadCompareRemoteLatest: () => Promise<void>;
  compareWarnings: CompareWarning[];
  takeIncomingAll: () => void;
  hasComputedCompare: boolean;
  resetExternalCompare: () => void;
};

type DiffViewMode = "list" | "chapter";

/**
 * Shared save/compare review modal.
 *
 * This modal can present unsaved local changes or an external-compare baseline.
 * It owns the overall review workflow shell, while child files handle chapter
 * view models and list/chapter rendering details.
 */
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

function getCompareSourceLabel(args: {
  compareSourceKind: CompareSourceKind;
  compareProjectLabelById: Map<string, string>;
  compareSourceProjectId: string;
  compareVersionOptions: Array<{ value: string; label: string }>;
  compareSourceVersionHash: string;
}) {
  switch (args.compareSourceKind) {
    case COMPARE_SOURCE_KIND.EXISTING_PROJECT:
      return (
        args.compareProjectLabelById.get(args.compareSourceProjectId) ??
        t`No source selected`
      );
    case COMPARE_SOURCE_KIND.PREVIOUS_VERSION:
      return (
        args.compareVersionOptions.find(
          (option) => option.value === args.compareSourceVersionHash,
        )?.label ?? t`No version selected`
      );
    case COMPARE_SOURCE_KIND.REMOTE_LATEST:
      return t`Incoming shared changes`;
    case COMPARE_SOURCE_KIND.ZIP_FILE:
      return t`ZIP file`;
    case COMPARE_SOURCE_KIND.DIRECTORY:
      return t`Folder`;
  }
}

function DiffViewerCenteredState({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className={styles.diffCenter}>
      <p
        className={`${styles.diffTextMuted} ${styles.diffStateMessage}`}
        data-testid={testId}
      >
        {children}
      </p>
    </div>
  );
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
  loadCompareRemoteLatest,
  compareWarnings,
  takeIncomingAll,
  hasComputedCompare,
  resetExternalCompare,
}: DiffViewerModalProps) {
  const hasChanges = (diffs?.length ?? 0) > 0;
  const { bookCodeToProjectLocalizedTitle, project } = useWorkspaceContext();
  const isExternalActionMode = actionMode === "external";
  const [hideWhitespaceOnly, setHideWhitespaceOnly] = useState(false);
  const [showUsfmMarkers, setShowUsfmMarkers] = useState(false);
  const [viewMode, setViewMode] = useState<DiffViewMode>("list");
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const popupPortalContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setViewMode(project.appSettings.diffViewModeDefault ?? "list");
  }, [isOpen, project.appSettings.diffViewModeDefault]);

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
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
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
    return {
      value: project.folderName,
      label:
        project.projectId && project.projectId !== project.displayName
          ? `${project.displayName} (${project.projectId})`
          : project.displayName,
    };
  });

  const compareProjectLabelById = new Map(
    compareProjectOptions.map((option) => [option.value, option.label]),
  );
  const visibleDiffCount = visibleDiffs?.length ?? 0;
  const visibleChapterCount = new Set(
    (visibleDiffs ?? []).map((diff) => `${diff.bookCode}:${diff.chapterNum}`),
  ).size;
  const unsavedBooksCount = new Set((visibleDiffs ?? []).map((d) => d.bookCode))
    .size;
  const sourceLabel = getCompareSourceLabel({
    compareSourceKind,
    compareProjectLabelById,
    compareSourceProjectId,
    compareVersionOptions,
    compareSourceVersionHash,
  });
  const compareSummaryText =
    compareMode === "external"
      ? t`Comparing your current vs ${sourceLabel}`
      : t`Unsaved changes in ${unsavedBooksCount} book(s)`;
  const hasCompareSourceSelection =
    compareSourceKind === COMPARE_SOURCE_KIND.EXISTING_PROJECT
      ? Boolean(compareSourceProjectId)
      : compareSourceKind === COMPARE_SOURCE_KIND.PREVIOUS_VERSION
        ? Boolean(compareSourceVersionHash)
        : hasComputedCompare;
  const canApplyIncomingAll =
    compareMode === "external" &&
    hasComputedCompare &&
    hasCompareSourceSelection &&
    hasVisibleDiffs;

  return (
    <div
      className={styles.overlayShell}
      data-open={isOpen ? "true" : "false"}
      aria-hidden={!isOpen}
      ref={popupPortalContainerRef}
      data-testid={TESTING_IDS.save.modal}
    >
      <div className={styles.modalScrollPaper}>
        <DiffViewerToolbar
          onClose={onClose}
          compareMode={compareMode}
          setCompareMode={setCompareMode}
          viewMode={viewMode}
          setViewMode={setViewMode}
          visibleChapterCount={visibleChapterCount}
          visibleDiffCount={visibleDiffCount}
          compareSummaryText={compareSummaryText}
          hasChanges={hasChanges}
          compareSourceKind={compareSourceKind}
          setCompareSourceKind={setCompareSourceKind}
          compareProjectOptions={compareProjectOptions}
          compareSourceProjectId={compareSourceProjectId}
          setCompareSourceProjectId={setCompareSourceProjectId}
          loadCompareProject={loadCompareProject}
          compareVersionOptions={compareVersionOptions}
          compareSourceVersionHash={compareSourceVersionHash}
          setCompareSourceVersionHash={setCompareSourceVersionHash}
          loadCompareVersion={loadCompareVersion}
          loadCompareRemoteLatest={loadCompareRemoteLatest}
          showUsfmMarkers={showUsfmMarkers}
          setShowUsfmMarkers={setShowUsfmMarkers}
          hideWhitespaceOnly={hideWhitespaceOnly}
          setHideWhitespaceOnly={setHideWhitespaceOnly}
          chapterOptions={chapterOptions}
          selectedChapter={selectedChapter}
          setSelectedChapter={setSelectedChapter}
          fileInputRef={fileInputRef}
          dirInputRef={dirInputRef}
          popupPortalContainer={popupPortalContainerRef}
          compareWarnings={compareWarnings}
          copyDiffsJson={copyDiffsJson}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setCompareSourceKind(COMPARE_SOURCE_KIND.ZIP_FILE);
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
            setCompareSourceKind(COMPARE_SOURCE_KIND.DIRECTORY);
            void loadCompareDirectory(files);
            event.currentTarget.value = "";
          }}
        />

        <div
          className={
            showingChapterView ? styles.modalBodyScrollable : styles.modalBody
          }
        >
          {isCalculating && (
            <div className={styles.fullHeight}>
              <div className={styles.diffCenter}>
                <div className={styles.diffLoader} />
              </div>
            </div>
          )}

          {!isCalculating && !hasChanges && (
            <DiffViewerCenteredState testId={TESTING_IDS.save.noChangesMessage}>
              <Trans>No changes detected.</Trans>
            </DiffViewerCenteredState>
          )}

          {!isCalculating &&
            hasChanges &&
            !showingChapterView &&
            !hasVisibleDiffs && (
              <DiffViewerCenteredState
                testId={TESTING_IDS.save.noChangesMessage}
              >
                <Trans>No changes detected.</Trans>
              </DiffViewerCenteredState>
            )}

          {!isCalculating &&
            hasChanges &&
            !showingChapterView &&
            hasVisibleDiffs && (
              <VirtualizedDiffList
                key={isOpen ? "open" : "closed"}
                diffs={visibleDiffs ?? []}
                actionMode={actionMode}
                onRevertDiff={onRevertDiff}
                onApplyDiffToCurrent={onApplyDiffToCurrent}
                originalLabel={
                  isExternalActionMode ? t`Your current` : t`Original`
                }
                currentLabel={isExternalActionMode ? t`Comparison` : t`Current`}
                showUsfmMarkers={showUsfmMarkers}
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
                  isExternalActionMode ? t`Your current` : t`Original`
                }
                currentLabel={isExternalActionMode ? t`Comparison` : t`Current`}
              />
            )}

          {!isCalculating &&
            hasChanges &&
            showingChapterView &&
            !hasVisibleChapter && (
              <DiffViewerCenteredState
                testId={TESTING_IDS.save.noChangesMessage}
              >
                <Trans>No changes detected.</Trans>
              </DiffViewerCenteredState>
            )}
        </div>

        <div className={styles.diffModalFooter}>
          {compareMode === "unsaved" ? (
            <>
              <Button
                variant="destructive"
                onClick={revertAllChanges}
                data-testid={TESTING_IDS.save.revertAllButton}
              >
                <Trans>Revert all local changes</Trans>
              </Button>
              <Button
                variant="primary"
                onClick={saveAllChanges}
                data-testid={TESTING_IDS.save.saveAllButton}
              >
                <Trans>Save all changes</Trans>
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={resetExternalCompare}>
                <Trans>Clear source</Trans>
              </Button>
              <div className={styles.diffFooterActions}>
                <Button
                  variant="secondary"
                  onClick={takeIncomingAll}
                  disabled={!canApplyIncomingAll}
                >
                  <Trans>Accept all incoming changes in all chapters</Trans>
                </Button>
                <Button
                  variant="primary"
                  onClick={saveAllChanges}
                  data-testid={TESTING_IDS.save.saveAllButton}
                >
                  <Trans>Save all changes</Trans>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
