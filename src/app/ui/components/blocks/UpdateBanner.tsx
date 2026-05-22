import { t } from "@lingui/core/macro";
import { useState } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import {
    availableUpdateFrom,
    useAvailableUpdate,
    useInstallUpdate,
} from "@/app/ui/hooks/useUpdateCheck.ts";
import * as styles from "@/app/ui/styles/modules/UpdateBanner.css.ts";
import type { IUpdaterService } from "@/core/domain/updater/IUpdaterService.ts";

/**
 * Non-modal top-of-viewport banner that appears when an update is available
 * for the current channel. Renders nothing when `updaterService` is null (web)
 * or when no update is pending.
 *
 * State note: the "available update" query is shared with Settings → Advanced
 * via React Query (`useAvailableUpdate`). If the user clicks "Check for
 * updates" in Settings and a release is found, this banner reflects that
 * immediately. "Later" is per-session and only suppresses the banner; the
 * shared query still holds the update so Settings can still surface it.
 */
export function UpdateBanner({
    updaterService,
}: {
    updaterService: IUpdaterService | null;
}) {
    const { data: result } = useAvailableUpdate(updaterService);
    const update = availableUpdateFrom(result);
    const { install, installing } = useInstallUpdate(updaterService);
    const [dismissed, setDismissed] = useState(false);

    if (!update || dismissed) return null;

    return (
        // biome-ignore lint/a11y/useSemanticElements: <div role="status"> is the correct ARIA pattern for a polite live region announcing app-level status; <output> semantically represents a calculation result and doesn't fit an update-available banner.
        <div className={styles.root} role="status" aria-live="polite">
            <div className={styles.message}>
                <span className={styles.version}>v{update.version}</span>
                {t`is ready to install.`}
            </div>
            <div className={styles.actions}>
                <Button
                    variant="secondary"
                    onClick={() => setDismissed(true)}
                    disabled={installing}
                >
                    {t`Later`}
                </Button>
                <Button
                    variant="primary"
                    onClick={install}
                    disabled={installing}
                >
                    {installing ? t`Installing…` : t`Install`}
                </Button>
            </div>
        </div>
    );
}
