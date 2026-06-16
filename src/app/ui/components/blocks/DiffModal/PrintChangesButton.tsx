import { Popover as BasePopover } from "@base-ui/react/popover";
import { useLingui } from "@lingui/react/macro";
import { Printer } from "lucide-react";
import { type RefObject, useMemo, useState } from "react";

import type {
  PrintGranularity,
  PrintScope,
} from "@/app/domain/project/print/buildPrintChangeSet.ts";
import { printChangeDocument } from "@/app/domain/project/print/renderPrintDocument.ts";
import {
  type SelectItem,
  SelectPrimitive,
} from "@/app/ui/components/primitives/Select/Select.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import type {
  BuildPrintChangesFn,
  PrintCheckpoint,
} from "@/app/ui/hooks/save/useExternalCompare.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/printChangesButton.css.ts";

// Default small so a large change set stays compact; user can bump it.
const FONT_PT: Record<string, number> = {
  small: 8,
  medium: 9.5,
  large: 11,
};

export function PrintChangesButton(props: {
  buildPrintChanges: BuildPrintChangesFn;
  /** Saved checkpoints to choose a baseline from (newest first). */
  checkpoints: PrintCheckpoint[];
  /** Seed the include-USFM toggle from the modal's current display setting. */
  defaultIncludeUsfm: boolean;
  popupPortalContainer: RefObject<HTMLDivElement | null>;
}) {
  const { t, i18n } = useLingui();
  const { loadedProject, bookCodeToProjectLocalizedTitle } =
    useWorkspaceContext();

  // "to" side of the range = the current work, i.e. now. Match the checkpoint
  // label's style (date + time) so the two ends of the range read alike.
  const nowFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.locale],
  );

  const allBookCodes = useMemo(
    () => loadedProject.books.map((book) => book.bookCode),
    [loadedProject.books],
  );

  const [open, setOpen] = useState(false);
  const [baselineHash, setBaselineHash] = useState(
    () => props.checkpoints[0]?.hash ?? "",
  );
  // Selected book codes. Default = all (whole project). Empty = nothing chosen.
  const [bookCodes, setBookCodes] = useState<string[]>(() => allBookCodes);
  const [granularity, setGranularity] = useState<PrintGranularity>("verses");
  const [includeUsfm, setIncludeUsfm] = useState(props.defaultIncludeUsfm);
  const [fontKey, setFontKey] = useState("small");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkpointItems: SelectItem[] = useMemo(
    () =>
      props.checkpoints.map((checkpoint) => ({
        value: checkpoint.hash,
        label: checkpoint.label,
      })),
    [props.checkpoints],
  );

  const selectedSet = useMemo(() => new Set(bookCodes), [bookCodes]);
  const allSelected = bookCodes.length === allBookCodes.length;
  const noneSelected = bookCodes.length === 0;

  const toggleBook = (bookCode: string) => {
    setBookCodes((prev) =>
      prev.includes(bookCode)
        ? prev.filter((code) => code !== bookCode)
        : [...prev, bookCode],
    );
  };

  const handlePrint = async () => {
    if (!baselineHash) {
      setError(t`Pick a checkpoint to compare against.`);
      return;
    }
    if (noneSelected) {
      setError(t`Pick at least one book to print.`);
      return;
    }
    setBusy(true);
    setError(null);

    // All books selected reads as the whole project.
    const scope: PrintScope = allSelected
      ? { kind: "all" }
      : { kind: "books", bookCodes };

    try {
      const result = await props.buildPrintChanges({
        baselineHash,
        scope,
        granularity,
        includeUsfm,
      });

      if (!result.ok) {
        setError(
          result.reason === "no-baseline"
            ? t`That checkpoint is no longer available.`
            : t`No changes since then.`,
        );
        return;
      }

      const sinceLabel =
        checkpointItems.find((item) => item.value === baselineHash)?.label ??
        "";
      const nowLabel = nowFormatter.format(new Date());
      const author = result.baseline.authorName;
      printChangeDocument({
        changeSet: result.changeSet,
        title: t`Changes between ${sinceLabel} and ${nowLabel}`,
        subtitle: t`${loadedProject.displayName} — your current work compared with the version saved by ${author}`,
        beforeLabel: t`Before · ${sinceLabel}`,
        afterLabel: t`Now · ${nowLabel}`,
        legend: t`Underlined text was added; struck-through text was removed.`,
        fontPt: FONT_PT[fontKey] ?? FONT_PT.small,
        bookLabel: (bookCode) => bookCodeToProjectLocalizedTitle({ bookCode }),
      });
      setOpen(false);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Print changes failed", err);
      }
      setError(t`Couldn't prepare the printout. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      <BasePopover.Trigger
        className={styles.trigger}
        disabled={props.checkpoints.length === 0}
      >
        <Printer size={14} />
        {t`Print changes…`}
      </BasePopover.Trigger>
      <BasePopover.Portal container={props.popupPortalContainer}>
        <BasePopover.Positioner
          className={styles.positioner}
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <BasePopover.Popup className={styles.popup}>
            <div className={styles.header}>
              <h3 className={styles.title}>{t`Print changes`}</h3>
              <p className={styles.subtitle}>
                {t`A compact, printer-friendly list of everything that changed since a saved checkpoint.`}
              </p>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{t`Changes since`}</span>
              <SelectPrimitive
                items={checkpointItems}
                value={baselineHash}
                onValueChange={(value) => setBaselineHash(value ?? "")}
                placeholder={t`Select a checkpoint`}
                compact
                portalContainer={props.popupPortalContainer}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.scopeHeader}>
                <span className={styles.label}>{t`Books`}</span>
                <span className={styles.sentinelGroup}>
                  <button
                    type="button"
                    className={styles.sentinelButton}
                    onClick={() => setBookCodes(allBookCodes)}
                    disabled={allSelected}
                  >
                    {t`All`}
                  </button>
                  <button
                    type="button"
                    className={styles.sentinelButton}
                    onClick={() => setBookCodes([])}
                    disabled={noneSelected}
                  >
                    {t`Clear`}
                  </button>
                </span>
              </div>
              <div className={styles.scopeList}>
                {loadedProject.books.map((book) => (
                  <label key={book.bookCode} className={styles.scopeRow}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(book.bookCode)}
                      onChange={() => toggleBook(book.bookCode)}
                    />
                    {bookCodeToProjectLocalizedTitle({
                      bookCode: book.bookCode,
                    })}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{t`Group changes`}</span>
              <ToggleGroup
                value={granularity}
                onValueChange={(value) =>
                  setGranularity(value as PrintGranularity)
                }
                variant="outlinePill"
                compact
                items={[
                  { label: t`By verse`, value: "verses" },
                  { label: t`By edit`, value: "chunks" },
                ]}
              />
              <span className={styles.help}>
                {granularity === "verses"
                  ? t`One line per changed verse.`
                  : t`One line per edit — a verse with several edits is split.`}
              </span>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{t`Print size`}</span>
              <ToggleGroup
                value={fontKey}
                onValueChange={setFontKey}
                variant="outlinePill"
                compact
                items={[
                  { label: t`Small`, value: "small" },
                  { label: t`Medium`, value: "medium" },
                  { label: t`Large`, value: "large" },
                ]}
              />
            </div>

            <label className={styles.usfmToggle}>
              <input
                type="checkbox"
                checked={includeUsfm}
                onChange={(event) => setIncludeUsfm(event.target.checked)}
              />
              {t`Include USFM markers`}
            </label>

            <div className={styles.footer}>
              {error ? <p className={styles.errorText}>{error}</p> : null}
              <button
                type="button"
                className={styles.printButton}
                onClick={() => void handlePrint()}
                disabled={busy}
              >
                {busy ? t`Preparing…` : t`Print`}
              </button>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
