import { Combobox } from "@base-ui/react/combobox";
import { Menu } from "@base-ui/react/menu";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Toggle } from "@base-ui/react/toggle";
import { Toolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  ChevronLeft,
  ChevronRight,
  FileDiff,
  MoreHorizontal,
  Pilcrow,
  X,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  CompareMode,
  CompareSourceKind,
  CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
import { PrintChangesButton } from "@/app/ui/components/blocks/DiffModal/PrintChangesButton.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/index.ts";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import type {
  BuildPrintChangesFn,
  PrintCheckpoint,
} from "@/app/ui/hooks/save/useExternalCompare.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

type DiffViewerToolbarProps = {
  onClose: () => void;
  compareMode: CompareMode;
  setCompareMode: (mode: CompareMode) => void;
  viewMode: "list" | "chapter";
  setViewMode: (mode: "list" | "chapter") => void;
  visibleChapterCount: number;
  visibleDiffCount: number;
  compareSummaryText: string;
  hasChanges: boolean;
  compareSourceKind: CompareSourceKind;
  setCompareSourceKind: (kind: CompareSourceKind) => void;
  compareProjectOptions: Array<{ value: string; label: string }>;
  compareSourceProjectId: string;
  setCompareSourceProjectId: (id: string) => void;
  loadCompareProject: (projectId: string) => Promise<void>;
  compareVersionOptions: Array<{ value: string; label: string }>;
  compareSourceVersionHash: string;
  setCompareSourceVersionHash: (id: string) => void;
  loadCompareVersion: (commitHash: string) => Promise<void>;
  buildPrintChanges: BuildPrintChangesFn;
  printCheckpoints: PrintCheckpoint[];
  loadCompareRemoteLatest: () => void | Promise<void>;
  showUsfmMarkers: boolean;
  setShowUsfmMarkers: (value: boolean) => void;
  hideWhitespaceOnly: boolean;
  setHideWhitespaceOnly: (value: boolean) => void;
  chapterOptions: Array<{ value: string; label: string }>;
  selectedChapter: string | null;
  setSelectedChapter: (value: string | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  dirInputRef: RefObject<HTMLInputElement | null>;
  popupPortalContainer: RefObject<HTMLDivElement | null>;
  compareWarnings: CompareWarning[];
  copyDiffsJson: () => void;
};

type ChapterOption = { value: string; label: string };
type CompareTargetOption = {
  value: string;
  label: string;
  description?: string;
};

const COMPARE_TARGET_UNSAVED = "unsaved";

function getCompareTargetValue(args: {
  compareMode: CompareMode;
  compareSourceKind: CompareSourceKind;
}) {
  if (args.compareMode === "unsaved") {
    return COMPARE_TARGET_UNSAVED;
  }
  return args.compareSourceKind;
}

export function DiffViewerToolbar({
  onClose,
  compareMode,
  setCompareMode,
  viewMode,
  setViewMode,
  visibleChapterCount,
  visibleDiffCount,
  compareSummaryText,
  hasChanges,
  compareSourceKind,
  setCompareSourceKind,
  compareProjectOptions,
  compareSourceProjectId,
  setCompareSourceProjectId,
  loadCompareProject,
  compareVersionOptions,
  compareSourceVersionHash,
  setCompareSourceVersionHash,
  loadCompareVersion,
  buildPrintChanges,
  printCheckpoints,
  loadCompareRemoteLatest,
  showUsfmMarkers,
  setShowUsfmMarkers,
  hideWhitespaceOnly,
  setHideWhitespaceOnly,
  chapterOptions,
  selectedChapter,
  setSelectedChapter,
  fileInputRef,
  dirInputRef,
  popupPortalContainer,
  compareWarnings,
  copyDiffsJson,
}: DiffViewerToolbarProps) {
  // External compare is the user-facing boundary for incoming-source flows.
  // Block entry while recovered conflicts are unresolved OR the workspace is
  // gated (a recovery decision is pending / a save is in flight) — a
  // baseline-matched restore leaves the tracker empty but the gate closed, so
  // both signals matter. The public loader actions also refuse, as the safety
  // net below this control.
  const { recoveredConflictTracker, interactionGate } = useWorkspaceContext();
  const recoveredChapters = useSyncExternalStore(
    recoveredConflictTracker.subscribe.bind(recoveredConflictTracker),
    recoveredConflictTracker.getSnapshot.bind(recoveredConflictTracker),
  );
  const gate = useSyncExternalStore(
    interactionGate.subscribe.bind(interactionGate),
    interactionGate.getSnapshot.bind(interactionGate),
  );
  const externalCompareBlocked =
    recoveredChapters.length > 0 || gate.kind !== "open";

  const selectedChapterOption =
    chapterOptions.find((option) => option.value === selectedChapter) ?? null;
  const compareTargetOptions: CompareTargetOption[] = [
    {
      value: COMPARE_TARGET_UNSAVED,
      label: t`Current changes`,
      description: t`Your edits since you last saved.`,
    },
    {
      value: COMPARE_SOURCE_KIND.REMOTE_LATEST,
      label: t`Incoming shared`,
      description: t`The latest version saved online by you or your team.`,
    },
    {
      value: COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
      label: t`Saved version`,
      description: t`An earlier snapshot saved on this device.`,
    },
    {
      value: COMPARE_SOURCE_KIND.ZIP_FILE,
      label: t`ZIP file`,
      description: t`A project exported as a .zip file.`,
    },
    {
      value: COMPARE_SOURCE_KIND.DIRECTORY,
      label: t`Folder`,
      description: t`A project stored in a folder on your device.`,
    },
  ];
  const compareTargetValue = getCompareTargetValue({
    compareMode,
    compareSourceKind,
  });

  const handleCompareTargetChange = (value: string | null) => {
    const next = value ?? COMPARE_TARGET_UNSAVED;
    if (next === COMPARE_TARGET_UNSAVED) {
      setCompareMode("unsaved");
      return;
    }
    // Refuse entry into external compare while recovered conflicts remain.
    if (externalCompareBlocked) {
      return;
    }

    setCompareMode("external");
    setCompareSourceKind(next as CompareSourceKind);

    switch (next) {
      case COMPARE_SOURCE_KIND.EXISTING_PROJECT:
        if (compareSourceProjectId) {
          void loadCompareProject(compareSourceProjectId);
        }
        break;
      case COMPARE_SOURCE_KIND.PREVIOUS_VERSION:
        if (compareSourceVersionHash) {
          void loadCompareVersion(compareSourceVersionHash);
        }
        break;
      case COMPARE_SOURCE_KIND.REMOTE_LATEST:
        void loadCompareRemoteLatest();
        break;
      case COMPARE_SOURCE_KIND.ZIP_FILE:
        fileInputRef.current?.click();
        break;
      case COMPARE_SOURCE_KIND.DIRECTORY:
        dirInputRef.current?.click();
        break;
    }
  };

  return (
    <div className={styles.toolbarSection}>
      <div className={styles.overlayHeaderRow}>
        <div className={styles.headerCopy}>
          <h2 className={styles.modalTitle}>
            <Trans>Review changes</Trans>
          </h2>
          <span className={styles.diffTextMuted}>{compareSummaryText}</span>
        </div>
        <Button
          variant="destructive"
          size="md"
          onClick={onClose}
          leftIcon={<X size={14} />}
        >
          <Trans>Close</Trans>
        </Button>
      </div>

      <Toolbar.Root className={styles.toolbarBand}>
        <Toolbar.Group
          className={styles.ribbonGroup}
          aria-label={t`Comparison target`}
        >
          <SelectPrimitive
            items={compareTargetOptions}
            value={compareTargetValue}
            onValueChange={handleCompareTargetChange}
            className={styles.ribbonSelect}
            icon={<FileDiff size={14} />}
            portalContainer={popupPortalContainer}
            disabled={externalCompareBlocked}
            compact
          />
          {compareMode === "external" &&
          compareSourceKind === COMPARE_SOURCE_KIND.EXISTING_PROJECT ? (
            <SelectPrimitive
              items={compareProjectOptions}
              value={compareSourceProjectId}
              onValueChange={(value) => {
                const next = value ?? "";
                setCompareSourceProjectId(next);
                if (next) {
                  setCompareMode("external");
                  void loadCompareProject(next);
                }
              }}
              placeholder={t`Select project`}
              className={styles.ribbonSelect}
              popupClassName={styles.ribbonPopup}
              portalContainer={popupPortalContainer}
            />
          ) : null}
          {compareMode === "external" &&
          compareSourceKind === COMPARE_SOURCE_KIND.PREVIOUS_VERSION ? (
            <SelectPrimitive
              items={compareVersionOptions}
              value={compareSourceVersionHash}
              onValueChange={(value) => {
                const next = value ?? "";
                setCompareSourceVersionHash(next);
                if (next) {
                  setCompareMode("external");
                  void loadCompareVersion(next);
                }
              }}
              placeholder={t`Select version`}
              className={styles.ribbonSelect}
              popupClassName={styles.ribbonPopup}
              portalContainer={popupPortalContainer}
            />
          ) : null}
        </Toolbar.Group>

        <Toolbar.Separator className={styles.ribbonSeparator} />

        <Toolbar.Group className={styles.ribbonGroup} aria-label={t`Scope`}>
          <ToggleGroup
            value={viewMode}
            onValueChange={(value) => setViewMode(value as "list" | "chapter")}
            variant="outlinePill"
            items={[
              { label: t`By verse`, value: "list" },
              { label: t`By chapter`, value: "chapter" },
            ]}
            className={styles.ribbonScopeToggle}
          />
        </Toolbar.Group>

        <Toolbar.Separator className={styles.ribbonSeparator} />

        <Toolbar.Group
          className={styles.ribbonGroup}
          aria-label={t`Diff summary`}
        >
          <span className={styles.ribbonMeta}>
            <Trans>{visibleChapterCount} chapters</Trans>
          </span>
          <span className={styles.ribbonMeta}>
            <Trans>{visibleDiffCount} diffs</Trans>
          </span>
        </Toolbar.Group>

        <Toolbar.Separator className={styles.ribbonSeparator} />

        <Toolbar.Group
          className={styles.ribbonGroup}
          aria-label={t`Display options`}
        >
          <ToolbarToggle
            label={t`Hide whitespace-only diffs`}
            pressed={hideWhitespaceOnly}
            onPressedChange={setHideWhitespaceOnly}
            icon={<Pilcrow size={14} />}
          />
          <ToolbarToggle
            label={t`Show USFM markers`}
            pressed={showUsfmMarkers}
            onPressedChange={setShowUsfmMarkers}
            icon={<UsfmGlyph />}
          />
          {import.meta.env.DEV && hasChanges ? (
            <Menu.Root>
              <Menu.Trigger className={styles.diffMenuTrigger}>
                <MoreHorizontal size={16} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={4}>
                  <Menu.Popup className={styles.diffMenuPopup}>
                    <Menu.Item
                      className={styles.diffMenuItem}
                      onClick={copyDiffsJson}
                    >
                      <Trans>Copy diffs (JSON)</Trans>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
        </Toolbar.Group>

        <Toolbar.Separator className={styles.ribbonSeparator} />

        <Toolbar.Group className={styles.ribbonGroup} aria-label={t`Print`}>
          <PrintChangesButton
            buildPrintChanges={buildPrintChanges}
            checkpoints={printCheckpoints}
            defaultIncludeUsfm={showUsfmMarkers}
            popupPortalContainer={popupPortalContainer}
          />
        </Toolbar.Group>

        <div className={styles.ribbonSpacer} />

        {viewMode === "chapter" ? (
          <Toolbar.Group
            className={styles.ribbonGroup}
            aria-label={t`Chapter picker`}
          >
            <ChapterPicker
              options={chapterOptions}
              selectedOption={selectedChapterOption}
              popupPortalContainer={popupPortalContainer}
              onValueChange={(value) => setSelectedChapter(value ?? null)}
            />
          </Toolbar.Group>
        ) : null}
      </Toolbar.Root>

      {compareWarnings.length > 0 && (
        <div className={styles.warningStrip}>
          <div className={styles.diffToolbarStack}>
            {compareWarnings.map((warning) => (
              <span className={styles.diffTextMuted} key={warning.code}>
                {warning.message}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChapterPicker(props: {
  options: ChapterOption[];
  selectedOption: ChapterOption | null;
  popupPortalContainer: RefObject<HTMLDivElement | null>;
  onValueChange: (value: string | null) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const selectedIndex = props.selectedOption
    ? props.options.findIndex(
        (option) => option.value === props.selectedOption?.value,
      )
    : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext =
    selectedIndex >= 0 && selectedIndex < props.options.length - 1;
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return props.options;
    return props.options.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [inputValue, props.options]);

  return (
    <Combobox.Root<ChapterOption>
      items={props.options}
      value={props.selectedOption}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onValueChange={(value) => props.onValueChange(value?.value ?? null)}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
    >
      <div className={styles.chapterComboboxControl}>
        <button
          type="button"
          className={styles.chapterComboboxStepper}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!hasPrev) return;
            const previous = props.options[selectedIndex - 1];
            props.onValueChange(previous?.value ?? null);
          }}
          aria-label={t`Previous chapter`}
          disabled={!hasPrev}
        >
          <ChevronLeft size={14} />
        </button>
        <Combobox.Trigger
          className={styles.chapterComboboxTrigger}
          aria-label={t`Choose chapter`}
        >
          <span className={styles.chapterComboboxValue}>
            {props.selectedOption?.label ?? t`Choose chapter`}
          </span>
          <span className={styles.chapterComboboxChevron}>⌄</span>
        </Combobox.Trigger>
        <button
          type="button"
          className={styles.chapterComboboxStepper}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!hasNext) return;
            const next = props.options[selectedIndex + 1];
            props.onValueChange(next?.value ?? null);
          }}
          aria-label={t`Next chapter`}
          disabled={!hasNext}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <Combobox.Portal container={props.popupPortalContainer}>
        <Combobox.Positioner sideOffset={8} align="end">
          <Combobox.Popup className={styles.chapterComboboxPopup}>
            <div className={styles.chapterComboboxHeader}>
              <Combobox.Input
                className={styles.chapterComboboxInput}
                aria-label={t`Search chapters`}
                placeholder={t`Search chapters`}
                autoFocus
              />
            </div>
            <ScrollArea.Root className={styles.chapterComboboxScrollArea}>
              <ScrollArea.Viewport
                className={styles.chapterComboboxScrollViewport}
              >
                <Combobox.List className={styles.chapterComboboxList}>
                  {filteredOptions.map((option) => (
                    <Combobox.Item
                      key={option.value}
                      value={option}
                      className={styles.chapterComboboxItem}
                    >
                      {option.label}
                    </Combobox.Item>
                  ))}
                </Combobox.List>
                <Combobox.Empty className={styles.chapterComboboxEmpty}>
                  <Trans>No chapters available.</Trans>
                </Combobox.Empty>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function UsfmGlyph() {
  return <span className={styles.usfmGlyph}>{"\\v"}</span>;
}

function ToolbarToggle(props: {
  label: string;
  pressed: boolean;
  onPressedChange: (value: boolean) => void;
  icon: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Toolbar.Button
            render={
              <Toggle
                pressed={props.pressed}
                onPressedChange={props.onPressedChange}
              />
            }
            className={styles.toolbarIconToggle}
            aria-label={props.label}
          >
            {props.icon}
          </Toolbar.Button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" align="center">
          <Tooltip.Popup className={styles.toolbarTooltipPopup}>
            {props.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
