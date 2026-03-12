import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Tooltip } from "@mantine/core";
import { Save } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { DiffViewerModal } from "@/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export function SaveAndReviewChanges() {
    const { t } = useLingui();
    const { saveDiff, actions } = useWorkspaceContext();
    const { isXs, isSm } = useWorkspaceMediaQuery();
    const saveLabel = saveDiff.isViewingOlderVersion
        ? t`Save as New Version`
        : t`Review and save changes`;

    const sorted = sortListBySidCanonical(
        saveDiff.diffs.map((diff) => ({ sid: diff.semanticSid, ...diff })),
    );
    const isExternalCompare = saveDiff.compareMode === "external";

    return (
        <>
            <DiffViewerModal
                isOpen={saveDiff.openDiffModal}
                onClose={saveDiff.closeModal}
                diffs={sorted}
                diffsByChapter={saveDiff.diffsByChapter}
                isCalculating={saveDiff.isCalculatingDiffs}
                actionMode={isExternalCompare ? "external" : "unsaved"}
                onRevertDiff={saveDiff.handleRevert}
                onRevertChapter={saveDiff.handleRevertChapter}
                onApplyDiffToCurrent={saveDiff.applyExternalIncomingHunk}
                onApplyChapterToCurrent={saveDiff.applyExternalIncomingChapter}
                saveAllChanges={saveDiff.saveProjectToDisk}
                revertAllChanges={saveDiff.handleRevertAll}
                compareMode={saveDiff.compareMode}
                setCompareMode={saveDiff.setCompareMode}
                compareSourceKind={saveDiff.compareSourceKind}
                setCompareSourceKind={saveDiff.setCompareSourceKind}
                compareSourceProjectId={saveDiff.compareSourceProjectId}
                setCompareSourceProjectId={saveDiff.setCompareSourceProjectId}
                compareSourceVersionHash={saveDiff.compareSourceVersionHash}
                setCompareSourceVersionHash={
                    saveDiff.setCompareSourceVersionHash
                }
                compareProjects={saveDiff.availableCompareProjects}
                compareVersionOptions={saveDiff.compareVersionOptions}
                loadCompareProject={
                    saveDiff.loadExternalCompareSourceFromProject
                }
                loadCompareZip={saveDiff.loadExternalCompareSourceFromZip}
                loadCompareDirectory={
                    saveDiff.loadExternalCompareSourceFromDirectory
                }
                loadCompareVersion={
                    saveDiff.loadExternalCompareSourceFromVersion
                }
                compareWarnings={saveDiff.compareWarnings}
                takeIncomingAll={saveDiff.applyExternalIncomingAll}
                hasComputedCompare={saveDiff.hasComputedCompare}
                resetExternalCompare={saveDiff.resetExternalCompare}
                isSm={isSm}
                isXs={isXs}
            />

            {isXs || isSm ? (
                <Tooltip label={saveLabel} withArrow position="top">
                    <ActionIconSimple
                        data-testid={TESTING_IDS.save.trigger}
                        onClick={actions.toggleDiffModal}
                        aria-label={saveLabel}
                        title={saveLabel}
                    >
                        <Save size={16} />
                    </ActionIconSimple>
                </Tooltip>
            ) : (
                <Button
                    data-testid={TESTING_IDS.save.trigger}
                    color="primary.7"
                    onClick={actions.toggleDiffModal}
                    size="sm"
                >
                    {saveDiff.isViewingOlderVersion ? (
                        <Trans>Save as New Version</Trans>
                    ) : (
                        <Trans>Review &amp; Save</Trans>
                    )}
                </Button>
            )}
        </>
    );
}
