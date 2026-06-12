import { Dialog } from "@base-ui/react/dialog";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import type { ChapterLabelTally } from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/ChapterLabelPicker.css.ts";

/**
 * Project-wide chapter-label (`\cl`) standardize picker.
 *
 * Dumb/controlled: the parent computes the `tally` (from the working files) and
 * owns open/close. The breakdown defends the legitimate-variation case (e.g.
 * Psalms) by never silently forcing the dominant label — the user picks the
 * target. Confirm hands back the chosen stem; the parent decides what to do
 * with it (Phase 2b: fabricate the multi-book stem swap).
 */
export type ChapterLabelPickerProps = {
  isOpen: boolean;
  tally: ChapterLabelTally | null;
  onClose: () => void;
  onConfirm: (targetStem: string) => void;
};

export function ChapterLabelPicker({
  isOpen,
  tally,
  onClose,
  onConfirm,
}: ChapterLabelPickerProps) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<string | null>(
    tally?.dominant ?? null,
  );

  // Re-seed the default selection (the dominant label) whenever a fresh tally
  // arrives — i.e. each time the picker is opened for a new issue.
  useEffect(() => {
    setSelected(tally?.dominant ?? null);
  }, [tally]);

  const counts = tally?.counts ?? [];
  const canConfirm = selected !== null && counts.length > 1;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className={styles.title}>
            <Trans>Standardize chapter labels</Trans>
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            <Trans>
              Pick the label to use for every chapter in the project. Each
              chapter keeps its own number.
            </Trans>
          </Dialog.Description>

          <ul className={styles.list}>
            {counts.map(({ stem, count }) => (
              <li key={stem}>
                <label className={styles.row}>
                  <input
                    type="radio"
                    name="chapter-label-target"
                    value={stem}
                    checked={selected === stem}
                    onChange={() => setSelected(stem)}
                  />
                  <span className={styles.rowLabel}>
                    {stem}
                    {stem === tally?.dominant ? (
                      <span className={styles.dominantTag}>
                        {" "}
                        <Trans>(most used)</Trans>
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.count}>{t`${count}×`}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canConfirm}
              onClick={() => {
                if (selected) onConfirm(selected);
              }}
            >
              <Trans>Standardize</Trans>
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
