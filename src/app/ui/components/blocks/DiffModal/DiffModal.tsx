import { DiffViewerModal } from "@/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export function SaveAndReviewChangesOverlay() {
  const { save } = useWorkspaceContext();

  const sorted = sortListBySidCanonical(
    save.diff.diffs.map((diff) => ({ sid: diff.semanticSid, ...diff })),
  );
  const isExternalCompare = save.compare.mode === "external";

  return (
    <DiffViewerModal
      isOpen={save.diff.isOpen}
      onClose={save.diff.close}
      diffs={sorted}
      diffsByChapter={save.diff.diffsByChapter}
      isCalculating={save.diff.isCalculating}
      actionMode={isExternalCompare ? "external" : "unsaved"}
      onRevertDiff={save.revert.diff}
      onRevertChapter={save.revert.chapter}
      onApplyDiffToCurrent={save.compare.applyIncomingHunk}
      onApplyChapterToCurrent={save.compare.applyIncomingChapter}
      saveAllChanges={
        isExternalCompare
          ? save.save.saveProjectToDisk
          : save.save.saveReviewedWork
      }
      revertAllChanges={save.revert.all}
      compareMode={save.compare.mode}
      setCompareMode={save.compare.setMode}
      compareSourceKind={save.compare.sourceKind}
      setCompareSourceKind={save.compare.setSourceKind}
      compareSourceProjectId={save.compare.sourceProjectId}
      setCompareSourceProjectId={save.compare.setSourceProjectId}
      compareSourceVersionHash={save.compare.sourceVersionHash}
      setCompareSourceVersionHash={save.compare.setSourceVersionHash}
      compareProjects={save.compare.availableProjects}
      compareVersionOptions={save.compare.versionOptions}
      loadCompareProject={save.compare.loadFromProject}
      loadCompareZip={save.compare.loadFromZip}
      loadCompareDirectory={save.compare.loadFromDirectory}
      loadCompareVersion={save.compare.loadFromVersion}
      buildPrintChanges={save.compare.buildPrintChanges}
      printCheckpoints={save.compare.printCheckpoints}
      loadCompareRemoteLatest={save.compare.loadFromRemoteLatest}
      compareWarnings={save.compare.warnings}
      takeIncomingAll={save.compare.applyIncomingAll}
      hasComputedCompare={save.compare.hasComputed}
      resetExternalCompare={save.compare.reset}
    />
  );
}
