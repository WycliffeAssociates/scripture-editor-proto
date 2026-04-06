import { Trans, useLingui } from "@lingui/react/macro";
import { Save } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { DiffViewerModal } from "@/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/index.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export function SaveAndReviewChanges() {
    const { t } = useLingui();
    const { save, actions } = useWorkspaceContext();
    const { isXs, isSm } = useWorkspaceMediaQuery();
    const saveLabel = save.versions.isViewingOlderVersion
        ? t`Save as New Version`
        : t`Review and save changes`;

    return (
        <>
            {isXs || isSm ? (
                <ActionIconSimple
                    data-testid={TESTING_IDS.save.trigger}
                    onClick={actions.toggleDiffModal}
                    aria-label={saveLabel}
                    title={saveLabel}
                >
                    <Save size={16} />
                </ActionIconSimple>
            ) : (
                <Button
                    data-testid={TESTING_IDS.save.trigger}
                    onClick={actions.toggleDiffModal}
                    size="sm"
                >
                    {save.versions.isViewingOlderVersion ? (
                        <Trans>Save as New Version</Trans>
                    ) : (
                        <Trans>Review &amp; Save</Trans>
                    )}
                </Button>
            )}
        </>
    );
}

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
            saveAllChanges={save.save.saveProjectToDisk}
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
            loadCompareRemoteLatest={save.compare.loadFromRemoteLatest}
            compareWarnings={save.compare.warnings}
            takeIncomingAll={save.compare.applyIncomingAll}
            hasComputedCompare={save.compare.hasComputed}
            resetExternalCompare={save.compare.reset}
        />
    );
}
