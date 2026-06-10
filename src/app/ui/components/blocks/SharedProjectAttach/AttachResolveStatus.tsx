import { Trans } from "@lingui/react/macro";
import { Check, Info } from "lucide-react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type { AttachResolveState } from "@/app/ui/hooks/useSharedProjectPicker.ts";
import * as styles from "./attachResolveStatus.css.ts";

/**
 * The verdict shown once a chosen/pasted project resolves — shared by the cloud
 * status popover and the settings attach picker so the copy, hierarchy, and
 * actions stay identical. Renders the connectable, no-access (fork), and
 * not-a-shared-project outcomes; the parent owns the resolve state machine
 * (see {@link useSharedProjectPicker}).
 */
export function AttachResolveStatus(props: {
    resolveState: AttachResolveState;
    /** owner/name (or the pasted link) to show as the resolved identity. */
    targetLabel: string | null;
    canRunActions: boolean;
    isAttaching: boolean;
    isSavingOwnCopy: boolean;
    onConnect: () => void;
    onSaveOwnCopy: () => void;
}) {
    if (props.resolveState === "idle") {
        return null;
    }

    if (props.resolveState === "resolving") {
        return (
            <div className={styles.root}>
                <span className={styles.help}>
                    <Trans>Checking access…</Trans>
                </span>
            </div>
        );
    }

    if (props.resolveState === "writable") {
        return (
            <div className={styles.root}>
                <span className={styles.statusLine}>
                    <span
                        className={`${styles.statusIcon} ${styles.statusIconReady}`}
                    >
                        <Check size={16} aria-hidden="true" />
                    </span>
                    <Trans>Ready to connect</Trans>
                </span>
                {props.targetLabel ? (
                    <span className={styles.identity}>{props.targetLabel}</span>
                ) : null}
                <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={props.onConnect}
                    disabled={!props.canRunActions}
                >
                    {props.isAttaching ? (
                        <Trans>Connecting...</Trans>
                    ) : (
                        <Trans>Connect</Trans>
                    )}
                </Button>
            </div>
        );
    }

    if (props.resolveState === "not-shared") {
        return (
            <div className={styles.root}>
                <span className={styles.statusLine}>
                    <span
                        className={`${styles.statusIcon} ${styles.statusIconMuted}`}
                    >
                        <Info size={16} aria-hidden="true" />
                    </span>
                    <Trans>Not a shared project</Trans>
                </span>
                {props.targetLabel ? (
                    <span className={styles.identity}>{props.targetLabel}</span>
                ) : null}
                <p className={styles.help}>
                    <Trans>
                        This project isn't set up to be shared, so you can't
                        connect to it. Ask its owner to share it, or save your
                        work as a new shared project.
                    </Trans>
                </p>
            </div>
        );
    }

    if (props.resolveState === "not-writable") {
        return (
            <div className={styles.root}>
                <span className={styles.statusLine}>
                    <span
                        className={`${styles.statusIcon} ${styles.statusIconMuted}`}
                    >
                        <Info size={16} aria-hidden="true" />
                    </span>
                    <Trans>You don't have edit access</Trans>
                </span>
                {props.targetLabel ? (
                    <span className={styles.identity}>{props.targetLabel}</span>
                ) : null}
                <p className={styles.help}>
                    <Trans>Save your own copy online to keep working.</Trans>
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={props.onSaveOwnCopy}
                    disabled={!props.canRunActions || props.isSavingOwnCopy}
                >
                    {props.isSavingOwnCopy ? (
                        <Trans>Saving...</Trans>
                    ) : (
                        <Trans>Save my own copy online</Trans>
                    )}
                </Button>
            </div>
        );
    }

    // error
    return (
        <div className={styles.root}>
            <span className={styles.statusLine}>
                <span
                    className={`${styles.statusIcon} ${styles.statusIconMuted}`}
                >
                    <Info size={16} aria-hidden="true" />
                </span>
                <Trans>Couldn't open that project</Trans>
            </span>
            <p className={styles.help}>
                <Trans>Check the link, or try another.</Trans>
            </p>
        </div>
    );
}
