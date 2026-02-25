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

    const sorted = sortListBySidCanonical(
        saveDiff.diffs.map((diff) => ({ sid: diff.semanticSid, ...diff })),
    );

    return (
        <>
            <DiffViewerModal
                isOpen={saveDiff.openDiffModal}
                onClose={saveDiff.closeModal}
                diffs={sorted}
                diffsByChapter={saveDiff.diffsByChapter}
                isCalculating={saveDiff.isCalculatingDiffs}
                revertDiff={
                    saveDiff.compareMode === "external"
                        ? saveDiff.applyExternalIncomingHunk
                        : saveDiff.handleRevert
                }
                revertChapter={
                    saveDiff.compareMode === "external"
                        ? saveDiff.applyExternalIncomingChapter
                        : saveDiff.handleRevertChapter
                }
                saveAllChanges={saveDiff.saveProjectToDisk}
                revertAllChanges={saveDiff.handleRevertAll}
                compareMode={saveDiff.compareMode}
                setCompareMode={saveDiff.setCompareMode}
                compareBaseline={saveDiff.compareBaseline}
                setCompareBaseline={saveDiff.setCompareBaseline}
                compareSourceProjectId={saveDiff.compareSourceProjectId}
                setCompareSourceProjectId={saveDiff.setCompareSourceProjectId}
                compareProjects={saveDiff.availableCompareProjects}
                loadCompareProject={
                    saveDiff.loadExternalCompareSourceFromProject
                }
                loadCompareZip={saveDiff.loadExternalCompareSourceFromZip}
                loadCompareDirectory={
                    saveDiff.loadExternalCompareSourceFromDirectory
                }
                compareWarnings={saveDiff.compareWarnings}
                takeIncomingAll={saveDiff.applyExternalIncomingAll}
                isSm={isSm}
                isXs={isXs}
            />

            {isXs || isSm ? (
                <Tooltip
                    label={<Trans>Review and save changes</Trans>}
                    withArrow
                    position="top"
                >
                    <ActionIconSimple
                        data-testid={TESTING_IDS.save.trigger}
                        onClick={actions.toggleDiffModal}
                        aria-label={t`Review and save changes`}
                        title={t`Review and save changes`}
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
                    <Trans>Review &amp; Save</Trans>
                </Button>
            )}
        </>
    );
}
