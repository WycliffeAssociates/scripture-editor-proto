import { t } from "@lingui/core/macro";
import type { RecoveryReportEntry } from "@/app/domain/api/recoverDirtyBuffers.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/UpdateBanner.css.ts";

/**
 * Reopen banner listing backups that could NOT be restored automatically:
 * unreadable/torn files, USFM that failed to parse, or backups for a book no
 * longer on disk. Unlike the restored-work banner this does not block — the
 * project opens normally. It surfaces the file path + reason so a tech can
 * recover the work by hand if needed.
 */
function describeEntry(entry: RecoveryReportEntry): string {
    switch (entry.kind) {
        case "backup-unreadable":
            return t`Backup could not be read (${entry.reason}): ${entry.path}`;
        case "usfm-parse-error":
            return t`Backup for ${entry.bookCode} could not be parsed: ${entry.path}`;
        case "manual-recovery":
            return entry.subKind === "new-book-not-supported"
                ? t`Unsaved new book ${entry.bookCode} cannot be auto-restored: ${entry.path}`
                : t`Book ${entry.bookCode} is no longer in this project: ${entry.path}`;
    }
}

export function RecoveryReportBanner({
    entries,
    onDismiss,
}: {
    entries: RecoveryReportEntry[];
    onDismiss: () => void;
}) {
    if (entries.length === 0) return null;
    return (
        // biome-ignore lint/a11y/useSemanticElements: role="status" polite live region is the right ARIA pattern for an app-level recovery notice.
        <div className={styles.root} role="status" aria-live="polite">
            <div className={styles.message}>
                {t`Some unsaved backups could not be restored automatically:`}
                <ul>
                    {entries.map((entry) => (
                        <li key={`${entry.kind}:${entry.path}`}>
                            {describeEntry(entry)}
                        </li>
                    ))}
                </ul>
            </div>
            <div className={styles.actions}>
                <Button variant="secondary" onClick={onDismiss}>
                    {t`Dismiss`}
                </Button>
            </div>
        </div>
    );
}
