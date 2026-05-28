import { t } from "@lingui/core/macro";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/UpdateBanner.css.ts";

/**
 * Reopen banner shown when the crash-recovery system restored unsaved work from
 * a previous session. Word-style: a single plain choice, no technical detail —
 * Keep the restored work, or Discard it back to the last saved state.
 *
 * The workspace gate stays blocked until the user chooses, so this is a
 * decision the user must make before editing.
 *
 * `conflictedBookCodes` is the subset of `bookCodes` whose disk baseline moved
 * underneath the backup (file changed outside the app since the last session).
 * Behavior is unchanged either way — the restored work is layered on top of
 * current disk — but a second line of copy surfaces the conflict so the user
 * knows to review before saving.
 */
export function RestoredBuffersBanner({
    bookCodes,
    conflictedBookCodes,
    onKeep,
    onDiscard,
}: {
    bookCodes: string[];
    conflictedBookCodes: string[];
    onKeep: () => void;
    onDiscard: () => void;
}) {
    if (bookCodes.length === 0) return null;
    const hasConflicts = conflictedBookCodes.length > 0;
    return (
        // biome-ignore lint/a11y/useSemanticElements: role="status" polite live region is the right ARIA pattern for an app-level recovery notice.
        <div className={styles.root} role="status" aria-live="polite">
            <div className={styles.message}>
                {t`We restored unsaved work from your last session. It will be kept until you save your file, and you can review the changes in the review panel.`}
                {hasConflicts && (
                    <>
                        {" "}
                        {t`Some of these files changed on disk since your last edits. Your changes are kept and layered on top — review them in the review panel before saving.`}
                    </>
                )}
            </div>
            <div className={styles.actions}>
                <Button variant="secondary" onClick={onDiscard}>
                    {t`Discard`}
                </Button>
                <Button variant="primary" onClick={onKeep}>
                    {t`Keep`}
                </Button>
            </div>
        </div>
    );
}
