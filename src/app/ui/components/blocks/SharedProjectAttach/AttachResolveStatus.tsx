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
          <span className={`${styles.statusIcon} ${styles.statusIconReady}`}>
            <Check size={16} aria-hidden="true" />
          </span>
          {props.targetLabel ? (
            <Trans>Ready to connect to {props.targetLabel}</Trans>
          ) : (
            <Trans>Ready to connect</Trans>
          )}
        </span>
        <div className={styles.action}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={props.onConnect}
            disabled={!props.canRunActions}
            style={{ width: "100%" }}
          >
            {props.isAttaching ? (
              <Trans>Connecting...</Trans>
            ) : (
              <Trans>Connect</Trans>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (props.resolveState === "not-shared") {
    return (
      <div className={styles.root}>
        <div className={styles.summary}>
          <span className={styles.statusLine}>
            <span className={`${styles.statusIcon} ${styles.statusIconMuted}`}>
              <Info size={16} aria-hidden="true" />
            </span>
            <Trans>Can't connect to this project</Trans>
          </span>
          {props.targetLabel ? (
            <span className={styles.identity}>{props.targetLabel}</span>
          ) : null}
          <p className={styles.help}>
            <Trans>
              This project can't be worked on inside Sefer, so you can't connect
              to it.
            </Trans>
          </p>
        </div>
      </div>
    );
  }

  if (props.resolveState === "not-writable") {
    return (
      <div className={styles.root}>
        <div className={styles.summary}>
          <span className={styles.statusLine}>
            <span className={`${styles.statusIcon} ${styles.statusIconMuted}`}>
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
        </div>
        <div className={styles.action}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={props.onSaveOwnCopy}
            disabled={!props.canRunActions || props.isSavingOwnCopy}
            style={{ width: "100%" }}
          >
            {props.isSavingOwnCopy ? (
              <Trans>Saving...</Trans>
            ) : (
              <Trans>Save my own copy online</Trans>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className={styles.root}>
      <span className={styles.statusLine}>
        <span className={`${styles.statusIcon} ${styles.statusIconMuted}`}>
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
