import { Dialog } from "@base-ui/react/dialog";
import { Trans } from "@lingui/react/macro";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/ImportProgressModal.css.ts";

export type ImportModalAction = {
  label: ReactNode;
  onClick: () => void;
};

/**
 * The create screen's single import-lifecycle surface. One modal, three phases:
 *
 *  - `importing` — progress, deliberately un-closeable (no close button, no
 *    click-outside) so an in-flight download can't be dismissed by accident.
 *  - `done` — success or error; carries the same actions the old toasts did
 *    (open/review the project, plus an optional merged "download source text"
 *    offer), and a close button.
 *  - `closed` — not shown.
 *
 * Replaces every toast the create flow used to raise; nothing else on that route
 * raises notifications anymore.
 */
export type ImportModalState =
  | { phase: "closed" }
  | { phase: "importing" }
  | {
      phase: "done";
      tone: "success" | "error";
      message: ReactNode;
      /** Open / review the just-imported project (success only). */
      openAction?: ImportModalAction;
      /** Merged "download the declared source text" offer, when applicable. */
      offerAction?: ImportModalAction;
      /** Non-fatal note carried alongside a success (e.g. no version history). */
      warning?: string;
    };

export function ImportProgressModal(props: {
  state: ImportModalState;
  onClose: () => void;
}) {
  const { state } = props;
  return (
    <Dialog.Root
      open={state.phase !== "closed"}
      // Deliberate-close-only: the modal closes solely via its Close button or a
      // navigation action. Ignore backdrop/Esc dismissal so an in-flight import
      // can't be lost to a stray click.
      onOpenChange={() => {}}
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {state.phase === "importing" ? (
            <ImportingBody />
          ) : state.phase === "done" ? (
            <DoneBody state={state} onClose={props.onClose} />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportingBody() {
  // Just a spinner + one plain line — the streamed step copy ("creating version
  // history", etc.) is noise to the user.
  return (
    <div className={styles.progressRow}>
      <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />
      <Dialog.Title className={styles.title}>
        <Trans>Downloading project</Trans>
      </Dialog.Title>
    </div>
  );
}

function DoneBody(props: {
  state: Extract<ImportModalState, { phase: "done" }>;
  onClose: () => void;
}) {
  const { state, onClose } = props;
  return (
    <>
      <Dialog.Title className={styles.title}>
        {state.tone === "error" ? (
          <Trans>Couldn't bring it in</Trans>
        ) : (
          <Trans>Ready</Trans>
        )}
      </Dialog.Title>
      <div className={styles.message}>{state.message}</div>
      {state.warning ? <p className={styles.warning}>{state.warning}</p> : null}
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          <Trans>Close</Trans>
        </Button>
        {state.offerAction ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={state.offerAction.onClick}
          >
            {state.offerAction.label}
          </Button>
        ) : null}
        {state.openAction ? (
          <Button
            variant="primary"
            size="sm"
            onClick={state.openAction.onClick}
          >
            {state.openAction.label}
          </Button>
        ) : null}
      </div>
    </>
  );
}
