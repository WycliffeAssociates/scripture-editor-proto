import { RecoveryReportBanner } from "@/app/ui/components/blocks/RecoveryReportBanner.tsx";
import { RestoredBuffersBanner } from "@/app/ui/components/blocks/RestoredBuffersBanner.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Crash-recovery banner pair, mounted by the workspace view shell. Reads all
 * state and handlers from `WorkspaceContext.recovery` — no prop drilling.
 *
 * Lives here (instead of inside `ProjectProvider`) so the provider stays a
 * provider: it composes state and exposes context, and the view layer decides
 * where and how the banners are rendered.
 */
export function RecoveryBanners() {
    const { recovery } = useWorkspaceContext();
    return (
        <>
            {recovery.isRestoredBannerOpen && (
                <RestoredBuffersBanner
                    bookCodes={recovery.restoredBookCodes}
                    conflictedBookCodes={recovery.conflictedBookCodes}
                    onKeep={recovery.keepRecoveredWork}
                    onDiscard={recovery.discardRecoveredWork}
                />
            )}
            {recovery.isRecoveryReportOpen && (
                <RecoveryReportBanner
                    entries={recovery.recoveryReportEntries}
                    onDismiss={recovery.dismissRecoveryReport}
                />
            )}
        </>
    );
}
