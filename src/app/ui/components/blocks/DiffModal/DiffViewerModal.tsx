import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { CompareSessionControllerState } from "@/app/domain/project/compare/CompareSessionController.ts";
import {
  chapterDecisionCompleteness,
  decisionsForChapter,
  iterateChapters,
} from "@/app/domain/project/compare/decisionState.ts";
import type {
  ChapterAddress,
  CompareSide,
  CompareSourceKind,
} from "@/app/domain/project/compare/types.ts";
import {
  countHiddenUnresolved,
  type CompareRowFilters,
} from "@/app/domain/project/compare/viewModels.ts";
import { tokensToReviewText } from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import { ChapterDiffStructuredDocument } from "@/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx";
import {
  type CompareNavigate,
  type ComparePresentationChapter,
  VirtualizedDiffList,
} from "@/app/ui/components/blocks/DiffModal/DiffModalListView.tsx";
import {
  DiffViewerToolbar,
  type DiffViewMode,
} from "@/app/ui/components/blocks/DiffModal/DiffViewerToolbar.tsx";
import { PrintChangesButton } from "@/app/ui/components/blocks/DiffModal/PrintChangesButton.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type {
  BuildPrintChangesFn,
  PrintCheckpoint,
} from "@/app/ui/hooks/useSave.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

export type DiffViewerModalProps = Readonly<{
  state: CompareSessionControllerState;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
  onUnitDecision: (
    address: ChapterAddress,
    unitId: string,
    decision: CompareSide | null,
  ) => void;
  onPresenceDecision: (
    address: ChapterAddress,
    decision: CompareSide | null,
  ) => void;
  onChapterDecision: (
    address: ChapterAddress,
    decision: CompareSide | null,
  ) => void;
  onGlobalDecision: (decision: CompareSide | null) => void;
  onNavigate: CompareNavigate;
  availableProjects: readonly ProjectListItem[];
  versionOptions: readonly { value: string; label: string }[];
  onSelectWorking: (side: CompareSide) => void | Promise<void>;
  onSelectSaved: (side: CompareSide) => void | Promise<void>;
  onSelectProject: (side: CompareSide, id: string) => void | Promise<void>;
  onSelectVersion: (side: CompareSide, oid: string) => void | Promise<void>;
  onSelectRemote: (side: CompareSide) => void | Promise<void>;
  onSelectZip: (side: CompareSide, file: File) => void | Promise<void>;
  onSelectDirectory: (
    side: CompareSide,
    files: FileList,
  ) => void | Promise<void>;
  buildPrintChanges: BuildPrintChangesFn;
  printCheckpoints: readonly PrintCheckpoint[];
}>;

function chapterKey(address: ChapterAddress): string {
  return `${address.bookCode}:${address.chapterNum}`;
}

function parseChapterKey(value: string): ChapterAddress | null {
  const separator = value.lastIndexOf(":");
  if (separator < 1) return null;
  const chapterNum = Number(value.slice(separator + 1));
  return Number.isFinite(chapterNum)
    ? { bookCode: value.slice(0, separator), chapterNum }
    : null;
}

export function DiffViewerModal(props: DiffViewerModalProps) {
  const { bookCodeToProjectLocalizedTitle, project } = useWorkspaceContext();
  const [viewMode, setViewMode] = useState<DiffViewMode>(
    project.appSettings.diffViewModeDefault ?? "list",
  );
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [hideWhitespaceOnly, setHideWhitespaceOnly] = useState(false);
  const [hideUsfmStructureOnly, setHideUsfmStructureOnly] = useState(false);
  const [hideDecided, setHideDecided] = useState(false);
  const [showUsfmMarkers, setShowUsfmMarkers] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const modalPaperRef = useRef<HTMLDivElement | null>(null);
  const fileInputs = {
    left: useRef<HTMLInputElement | null>(null),
    right: useRef<HTMLInputElement | null>(null),
  };
  const directoryInputs = {
    left: useRef<HTMLInputElement | null>(null),
    right: useRef<HTMLInputElement | null>(null),
  };

  const active = props.state.status === "active" ? props.state : null;
  const readOnly = active?.session.snapshot.sources.writableSide === null;
  const lifecycle = active?.session.lifecycle;
  const filters: CompareRowFilters = useMemo(
    () => ({
      hideWhitespaceOnly,
      hideUsfmStructureOnly,
      hideDecided: !readOnly && hideDecided,
    }),
    [hideDecided, hideUsfmStructureOnly, hideWhitespaceOnly, readOnly],
  );

  const chapters = useMemo<readonly ComparePresentationChapter[]>(() => {
    if (!active) return [];
    return Array.from(
      iterateChapters(active.session.snapshot),
      (comparison) => ({
        comparison,
        label: `${bookCodeToProjectLocalizedTitle({ bookCode: comparison.address.bookCode })} ${comparison.address.chapterNum}`,
        decisions: decisionsForChapter(active.session.decisions, comparison),
      }),
    ).filter(
      (chapter) =>
        chapterDecisionCompleteness(chapter.comparison, chapter.decisions)
          .changed > 0,
    );
  }, [active, bookCodeToProjectLocalizedTitle]);

  const chapterOptions = useMemo(
    () =>
      chapters.map((chapter) => ({
        value: chapterKey(chapter.comparison.address),
        label: chapter.label,
      })),
    [chapters],
  );

  useEffect(() => {
    if (!chapterOptions.length) {
      setSelectedChapter(null);
      return;
    }
    if (!chapterOptions.some((option) => option.value === selectedChapter)) {
      setSelectedChapter(chapterOptions[0]?.value ?? null);
    }
  }, [chapterOptions, selectedChapter]);

  const selectedPresentation = useMemo(() => {
    const address = selectedChapter ? parseChapterKey(selectedChapter) : null;
    return address
      ? (chapters.find(
          (chapter) =>
            chapter.comparison.address.bookCode === address.bookCode &&
            chapter.comparison.address.chapterNum === address.chapterNum,
        ) ?? null)
      : null;
  }, [chapters, selectedChapter]);

  const hiddenUnresolvedCount = useMemo(
    () =>
      chapters.reduce(
        (count, chapter) =>
          count +
          countHiddenUnresolved({
            skeleton: chapter.comparison.skeleton,
            decisions: chapter.decisions.units,
            filters,
          }),
        0,
      ),
    [chapters, filters],
  );

  const unresolvedCount = useMemo(
    () =>
      chapters.reduce(
        (count, chapter) =>
          count +
          chapterDecisionCompleteness(chapter.comparison, chapter.decisions)
            .unresolved,
        0,
      ),
    [chapters],
  );

  const projectedChapter = useMemo(() => {
    if (!selectedPresentation || active?.projection.status !== "ready") {
      return null;
    }
    return (
      active.projection.artifact.chapters.find(
        (chapter) =>
          chapter.address.bookCode ===
            selectedPresentation.comparison.address.bookCode &&
          chapter.address.chapterNum ===
            selectedPresentation.comparison.address.chapterNum,
      ) ?? null
    );
  }, [active?.projection, selectedPresentation]);

  const structuralSummary = useMemo(() => {
    if (active?.projection.status !== "ready") return null;
    const actions = active.projection.artifact.chapters.reduce(
      (counts, chapter) => {
        if (chapter.structuralAction === "add") counts.add += 1;
        if (chapter.structuralAction === "delete") counts.delete += 1;
        if (chapter.structuralAction === "update") counts.update += 1;
        return counts;
      },
      { add: 0, delete: 0, update: 0 },
    );
    return actions;
  }, [active?.projection]);

  const projectOptions = props.availableProjects.map((item) => ({
    value: item.folderName,
    label:
      item.projectId && item.projectId !== item.displayName
        ? `${item.displayName} (${item.projectId})`
        : item.displayName,
  }));

  const sourceDisabled =
    props.state.status !== "active" || lifecycle?.status === "applying";
  const decisionDisabled = sourceDisabled || lifecycle?.status === "applied";
  const canApply =
    Boolean(active) &&
    !readOnly &&
    lifecycle?.status === "ready" &&
    active?.projection.status === "ready" &&
    active.projection.artifact.complete;

  const revealHidden = () => {
    setHideWhitespaceOnly(false);
    setHideUsfmStructureOnly(false);
    setHideDecided(false);
  };

  const handleSourceKind = (side: CompareSide, kind: CompareSourceKind) => {
    switch (kind) {
      case "working":
        void props.onSelectWorking(side);
        break;
      case "saved":
        void props.onSelectSaved(side);
        break;
      case "remoteLatest":
        void props.onSelectRemote(side);
        break;
      case "zipFile":
        fileInputs[side].current?.click();
        break;
      case "directory":
        directoryInputs[side].current?.click();
        break;
      case "existingProject":
      case "previousVersion":
        break;
    }
  };

  return (
    <div
      className={styles.overlayShell}
      data-open={props.state.status === "closed" ? "false" : "true"}
      aria-hidden={props.state.status === "closed"}
      data-testid={TESTING_IDS.save.modal}
    >
      <div ref={modalPaperRef} className={styles.modalScrollPaper}>
        <DiffViewerToolbar
          onClose={props.onClose}
          leftSource={active?.session.snapshot.sources.left ?? null}
          rightSource={active?.session.snapshot.sources.right ?? null}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          chapterOptions={chapterOptions}
          selectedChapter={selectedChapter}
          onSelectedChapterChange={setSelectedChapter}
          hideWhitespaceOnly={hideWhitespaceOnly}
          onHideWhitespaceOnlyChange={setHideWhitespaceOnly}
          hideUsfmStructureOnly={hideUsfmStructureOnly}
          onHideUsfmStructureOnlyChange={setHideUsfmStructureOnly}
          hideDecided={hideDecided}
          onHideDecidedChange={setHideDecided}
          showUsfmMarkers={showUsfmMarkers}
          onShowUsfmMarkersChange={setShowUsfmMarkers}
          hiddenUnresolvedCount={hiddenUnresolvedCount}
          onRevealHidden={revealHidden}
          readOnly={Boolean(readOnly)}
          onGlobalDecision={props.onGlobalDecision}
          sourceDisabled={sourceDisabled}
          decisionDisabled={decisionDisabled}
          availableProjects={projectOptions}
          versionOptions={props.versionOptions}
          onSourceKind={handleSourceKind}
          onProject={(side, id) => void props.onSelectProject(side, id)}
          onVersion={(side, oid) => void props.onSelectVersion(side, oid)}
        />

        {(["left", "right"] as const).map((side) => (
          <span key={side}>
            <input
              ref={fileInputs[side]}
              className={styles.visuallyHidden}
              type="file"
              accept=".zip,application/zip"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void props.onSelectZip(side, file);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={directoryInputs[side]}
              className={styles.visuallyHidden}
              type="file"
              webkitdirectory="true"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                if (event.currentTarget.files?.length) {
                  void props.onSelectDirectory(side, event.currentTarget.files);
                }
                event.currentTarget.value = "";
              }}
            />
          </span>
        ))}

        <main className={styles.optionCBody}>
          {props.state.status === "loading" ? (
            <div className={styles.diffCenter} role="status">
              <div className={styles.compareLoadingState}>
                <span className={styles.diffLoader} aria-hidden="true" />
                <Trans>Preparing a frozen comparison…</Trans>
              </div>
            </div>
          ) : null}

          {active && lifecycle?.status === "applied" ? (
            <section className={styles.compareReceipt} role="status">
              <CheckCircle2 size={28} aria-hidden="true" />
              <h3>
                <Trans>Changes applied</Trans>
              </h3>
              <p>
                <Trans>
                  The reviewed result is now saved in your working copy.
                </Trans>
              </p>
              {structuralSummary ? (
                <p className={styles.diffTextMuted}>
                  <Trans>
                    {structuralSummary.add} chapters added,{" "}
                    {structuralSummary.update} updated,{" "}
                    {structuralSummary.delete} removed.
                  </Trans>
                </p>
              ) : null}
              <Button
                size="sm"
                variant="default"
                onClick={() => void props.onRefresh()}
                leftIcon={<RefreshCw size={14} />}
              >
                <Trans>Refresh comparison</Trans>
              </Button>
            </section>
          ) : null}

          {active && lifecycle?.status !== "applied" ? (
            <>
              {lifecycle?.status === "stale" ? (
                <div className={styles.compareWarningBanner} role="alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <div>
                    <strong>
                      <Trans>The working copy changed</Trans>
                    </strong>
                    <p>
                      <Trans>
                        This frozen review is still visible, but it cannot be
                        applied. Refresh to compare the latest content; current
                        decisions will be cleared.
                      </Trans>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => void props.onRefresh()}
                    leftIcon={<RefreshCw size={14} />}
                  >
                    <Trans>Refresh</Trans>
                  </Button>
                </div>
              ) : null}

              {lifecycle?.status === "error" ||
              active.projection.status === "error" ? (
                <div className={styles.compareErrorBanner} role="alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <span>
                    {lifecycle?.status === "error"
                      ? lifecycle.message
                      : active.projection.status === "error"
                        ? active.projection.message
                        : t`The comparison could not be prepared.`}
                  </span>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => void props.onRefresh()}
                  >
                    <Trans>Try again</Trans>
                  </Button>
                </div>
              ) : null}

              <div className={styles.compareCoverageSummary}>
                <span>
                  <Trans>{chapters.length} changed chapters</Trans>
                </span>
                {!readOnly ? (
                  <span>
                    <Trans>{unresolvedCount} unresolved decisions</Trans>
                  </span>
                ) : (
                  <span>
                    <Trans>Read-only comparison</Trans>
                  </span>
                )}
                {active.session.snapshot.coverage.leftOnly.length > 0 ? (
                  <span>
                    <Trans>
                      {active.session.snapshot.coverage.leftOnly.length} only on
                      Left
                    </Trans>
                  </span>
                ) : null}
                {active.session.snapshot.coverage.rightOnly.length > 0 ? (
                  <span>
                    <Trans>
                      {active.session.snapshot.coverage.rightOnly.length} only
                      on Right
                    </Trans>
                  </span>
                ) : null}
                {structuralSummary && !readOnly ? (
                  <span>
                    <Trans>
                      {structuralSummary.add} to add ·{" "}
                      {structuralSummary.delete} to remove
                    </Trans>
                  </span>
                ) : null}
              </div>

              {chapters.length === 0 ? (
                <div className={styles.diffCenter}>
                  <p className={styles.diffStateMessage}>
                    <Trans>These sources have no differences.</Trans>
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <VirtualizedDiffList
                  chapters={chapters}
                  filters={filters}
                  leftLabel={active.session.snapshot.sources.left.label}
                  rightLabel={active.session.snapshot.sources.right.label}
                  readOnly={Boolean(readOnly)}
                  showUsfmMarkers={showUsfmMarkers}
                  onDecisionChange={readOnly ? undefined : props.onUnitDecision}
                  onPresenceDecision={
                    readOnly ? undefined : props.onPresenceDecision
                  }
                  onNavigate={props.onNavigate}
                />
              ) : selectedPresentation ? (
                <ChapterDiffStructuredDocument
                  chapter={selectedPresentation}
                  filters={filters}
                  leftLabel={active.session.snapshot.sources.left.label}
                  rightLabel={active.session.snapshot.sources.right.label}
                  readOnly={Boolean(readOnly)}
                  showUsfmMarkers={showUsfmMarkers}
                  onDecisionChange={readOnly ? undefined : props.onUnitDecision}
                  onPresenceDecision={
                    readOnly ? undefined : props.onPresenceDecision
                  }
                  onChapterDecision={
                    readOnly ? undefined : props.onChapterDecision
                  }
                  onNavigate={props.onNavigate}
                />
              ) : null}

              {!readOnly && selectedPresentation ? (
                <details
                  className={styles.comparePreview}
                  open={previewOpen}
                  onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
                >
                  <summary className={styles.comparePreviewSummary}>
                    <span>
                      <Trans>
                        Result preview · {selectedPresentation.label}
                      </Trans>
                    </span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div className={styles.comparePreviewBody}>
                    {active.projection.status === "running" ? (
                      <p className={styles.diffTextMuted}>
                        <Trans>Updating preview…</Trans>
                      </p>
                    ) : projectedChapter ? (
                      projectedChapter.present ? (
                        <pre className={styles.compareReadingPreview}>
                          {tokensToReviewText({
                            tokens: projectedChapter.tokens,
                            showUsfmMarkers,
                          })}
                        </pre>
                      ) : (
                        <p className={styles.diffTextMuted}>
                          <Trans>This decision removes the chapter.</Trans>
                        </p>
                      )
                    ) : (
                      <p className={styles.diffTextMuted}>
                        <Trans>
                          Resolve this chapter to preview its result.
                        </Trans>
                      </p>
                    )}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </main>

        {active && lifecycle?.status !== "applied" ? (
          <footer className={styles.diffModalFooter}>
            <span className={styles.diffTextMuted}>
              {active.projection.status === "running" ? (
                <Trans>Updating result…</Trans>
              ) : !readOnly && unresolvedCount > 0 ? (
                <Trans>Resolve every decision before applying.</Trans>
              ) : null}
            </span>
            <div className={styles.diffModalFooterActions}>
              <PrintChangesButton
                buildPrintChanges={props.buildPrintChanges}
                checkpoints={[...props.printCheckpoints]}
                defaultIncludeUsfm={showUsfmMarkers}
                popupPortalContainer={modalPaperRef}
              />
              {lifecycle?.status !== "stale" ? (
                <Button
                  variant="default"
                  onClick={() => void props.onRefresh()}
                  disabled={lifecycle?.status === "applying"}
                >
                  <Trans>Refresh</Trans>
                </Button>
              ) : null}
              {!readOnly ? (
                <Button
                  data-testid={TESTING_IDS.save.saveAllButton}
                  disabled={!canApply}
                  onClick={() => void props.onApply()}
                >
                  {lifecycle?.status === "applying" ? (
                    <Trans>Applying…</Trans>
                  ) : (
                    <Trans>Apply result</Trans>
                  )}
                </Button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
