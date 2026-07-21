import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BookOpen, Eye, List, SlidersHorizontal, X } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

import type {
  CompareSide,
  CompareSourceDescriptor,
  CompareSourceKind,
} from "@/app/domain/project/compare/types.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { Checkbox } from "@/app/ui/components/primitives/Checkbox/Checkbox.tsx";
import {
  Popover,
  PopoverDropdown,
  PopoverTarget,
} from "@/app/ui/components/primitives/Popover/Popover.tsx";
import {
  type SelectItem,
  SelectPrimitive,
} from "@/app/ui/components/primitives/Select/Select.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

export type DiffViewMode = "list" | "chapter";

export type DiffViewerToolbarProps = Readonly<{
  onClose: () => void;
  /** Portal target for select/popover dropdowns — must be inside the modal's
   * own overlay, whose z-index otherwise sits above a body-portaled popup. */
  popupPortalContainer: RefObject<HTMLDivElement | null>;
  leftSource: CompareSourceDescriptor | null;
  rightSource: CompareSourceDescriptor | null;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  chapterOptions: readonly { value: string; label: string }[];
  selectedChapter: string | null;
  onSelectedChapterChange: (value: string) => void;
  hideWhitespaceOnly: boolean;
  onHideWhitespaceOnlyChange: (value: boolean) => void;
  hideUsfmStructureOnly: boolean;
  onHideUsfmStructureOnlyChange: (value: boolean) => void;
  hideDecided: boolean;
  onHideDecidedChange: (value: boolean) => void;
  showUsfmMarkers: boolean;
  onShowUsfmMarkersChange: (value: boolean) => void;
  hiddenUnresolvedCount: number;
  onRevealHidden: () => void;
  readOnly: boolean;
  /** Whether the current chapter has a resolvable result to preview at all. */
  canPreview: boolean;
  previewOpen: boolean;
  onPreviewToggle: () => void;
  onGlobalDecision: (decision: CompareSide | null) => void;
  sourceDisabled: boolean;
  decisionDisabled: boolean;
  availableProjects: readonly { value: string; label: string }[];
  versionOptions: readonly { value: string; label: string }[];
  onSourceKind: (side: CompareSide, kind: CompareSourceKind) => void;
  onProject: (side: CompareSide, id: string) => void;
  onVersion: (side: CompareSide, oid: string) => void;
}>;

function SourceSelector({
  side,
  source,
  sourceDisabled,
  availableProjects,
  versionOptions,
  onSourceKind,
  onProject,
  onVersion,
  popupPortalContainer,
}: Pick<
  DiffViewerToolbarProps,
  | "sourceDisabled"
  | "availableProjects"
  | "versionOptions"
  | "onSourceKind"
  | "onProject"
  | "onVersion"
  | "popupPortalContainer"
> & {
  side: CompareSide;
  source: CompareSourceDescriptor | null;
}) {
  const [pendingKind, setPendingKind] = useState<CompareSourceKind | "">(
    source?.locator.kind ?? "",
  );
  useEffect(() => {
    setPendingKind(source?.locator.kind ?? "");
  }, [source?.id, source?.locator.kind]);
  const kind = pendingKind;

  const kindItems: SelectItem[] = [
    { value: "working", label: t`Working copy` },
    { value: "saved", label: t`Saved copy` },
    { value: "remoteLatest", label: t`Incoming shared changes` },
    { value: "previousVersion", label: t`Previous version` },
    { value: "existingProject", label: t`Another project` },
    { value: "zipFile", label: t`ZIP file` },
    { value: "directory", label: t`Folder` },
  ];

  return (
    <div className={styles.compareSourceControl}>
      <span className={styles.compareSourceSide}>
        {side === "left" ? <Trans>Left</Trans> : <Trans>Right</Trans>}
      </span>
      <SelectPrimitive
        items={kindItems}
        value={kind}
        placeholder={t`Choose a source`}
        disabled={sourceDisabled}
        compact
        portalContainer={popupPortalContainer}
        onValueChange={(value) => {
          if (!value) return;
          const next = value as CompareSourceKind;
          setPendingKind(next);
          if (next !== "existingProject" && next !== "previousVersion") {
            onSourceKind(side, next);
          }
        }}
      />
      {kind === "existingProject" ? (
        <SelectPrimitive
          items={[...availableProjects]}
          value={
            source?.locator.kind === "existingProject"
              ? source.locator.projectId
              : ""
          }
          placeholder={t`Choose a project`}
          disabled={sourceDisabled}
          compact
          portalContainer={popupPortalContainer}
          onValueChange={(value) => value && onProject(side, value)}
        />
      ) : null}
      {kind === "previousVersion" ? (
        <SelectPrimitive
          items={[...versionOptions]}
          value={
            source?.locator.kind === "previousVersion" ? source.locator.oid : ""
          }
          placeholder={t`Choose a version`}
          disabled={sourceDisabled}
          compact
          portalContainer={popupPortalContainer}
          onValueChange={(value) => value && onVersion(side, value)}
        />
      ) : null}
      <span className={styles.compareSourceLabel}>
        {source?.label ?? t`Not selected`}
      </span>
    </div>
  );
}

function FiltersMenu(
  props: Pick<
    DiffViewerToolbarProps,
    | "hideWhitespaceOnly"
    | "onHideWhitespaceOnlyChange"
    | "hideUsfmStructureOnly"
    | "onHideUsfmStructureOnlyChange"
    | "hideDecided"
    | "onHideDecidedChange"
    | "showUsfmMarkers"
    | "onShowUsfmMarkersChange"
    | "readOnly"
    | "popupPortalContainer"
  >,
) {
  const anyActive =
    props.hideWhitespaceOnly ||
    props.hideUsfmStructureOnly ||
    props.hideDecided ||
    props.showUsfmMarkers;

  return (
    <Popover position="bottom-end" portalContainer={props.popupPortalContainer}>
      <PopoverTarget
        className={styles.toolbarIconToggle}
        aria-label={t`Filters`}
        title={t`Filters`}
        data-pressed={anyActive || undefined}
      >
        <SlidersHorizontal size={16} />
      </PopoverTarget>
      <PopoverDropdown className={styles.diffMenuPopup}>
        <div className={styles.diffMenuLabel}>
          <Trans>Filters</Trans>
        </div>
        <div className={styles.filterMenuItem}>
          <Checkbox
            checked={props.hideWhitespaceOnly}
            onChange={(event) =>
              props.onHideWhitespaceOnlyChange(event.currentTarget.checked)
            }
            label={t`Hide whitespace-only changes`}
          />
        </div>
        <div className={styles.filterMenuItem}>
          <Checkbox
            checked={props.hideUsfmStructureOnly}
            onChange={(event) =>
              props.onHideUsfmStructureOnlyChange(event.currentTarget.checked)
            }
            label={t`Hide USFM-structure-only changes`}
          />
        </div>
        {!props.readOnly ? (
          <div className={styles.filterMenuItem}>
            <Checkbox
              checked={props.hideDecided}
              onChange={(event) =>
                props.onHideDecidedChange(event.currentTarget.checked)
              }
              label={t`Hide already-decided rows`}
            />
          </div>
        ) : null}
        <div className={styles.diffMenuDivider} />
        <div className={styles.filterMenuItem}>
          <Checkbox
            checked={props.showUsfmMarkers}
            onChange={(event) =>
              props.onShowUsfmMarkersChange(event.currentTarget.checked)
            }
            label={t`Show USFM markers`}
          />
        </div>
      </PopoverDropdown>
    </Popover>
  );
}

export function DiffViewerToolbar(props: DiffViewerToolbarProps) {
  return (
    <div className={styles.toolbarSection}>
      <div className={styles.overlayHeaderRow}>
        <div className={styles.headerCopy}>
          <h2 className={styles.modalTitle}>
            <Trans>Review changes</Trans>
          </h2>
          <span className={styles.diffTextMuted}>
            <Trans>Choose what the working copy should keep.</Trans>
          </span>
        </div>
        <Button
          variant="default"
          size="md"
          onClick={props.onClose}
          leftIcon={<X size={14} />}
        >
          <Trans>Close</Trans>
        </Button>
      </div>

      <div
        className={styles.compareSourceGrid}
        aria-label={t`Comparison sources`}
      >
        <SourceSelector
          side="left"
          source={props.leftSource}
          sourceDisabled={props.sourceDisabled}
          availableProjects={props.availableProjects}
          versionOptions={props.versionOptions}
          onSourceKind={props.onSourceKind}
          onProject={props.onProject}
          onVersion={props.onVersion}
          popupPortalContainer={props.popupPortalContainer}
        />
        <SourceSelector
          side="right"
          source={props.rightSource}
          sourceDisabled={props.sourceDisabled}
          availableProjects={props.availableProjects}
          versionOptions={props.versionOptions}
          onSourceKind={props.onSourceKind}
          onProject={props.onProject}
          onVersion={props.onVersion}
          popupPortalContainer={props.popupPortalContainer}
        />
      </div>

      <div className={styles.toolbarBand}>
        <div
          className={styles.compareSegmentedControl}
          aria-label={t`Review view`}
        >
          <Button
            variant={props.viewMode === "list" ? "primary" : "default"}
            size="xs"
            onClick={() => props.onViewModeChange("list")}
            leftIcon={<List size={14} />}
          >
            <Trans>List</Trans>
          </Button>
          <Button
            variant={props.viewMode === "chapter" ? "primary" : "default"}
            size="xs"
            onClick={() => props.onViewModeChange("chapter")}
            leftIcon={<BookOpen size={14} />}
          >
            <Trans>Chapter</Trans>
          </Button>
        </div>

        {props.viewMode === "chapter" ? (
          <SelectPrimitive
            items={[...props.chapterOptions]}
            value={props.selectedChapter ?? ""}
            placeholder={t`Choose chapter`}
            compact
            portalContainer={props.popupPortalContainer}
            onValueChange={(value) =>
              value && props.onSelectedChapterChange(value)
            }
          />
        ) : null}

        <span className={styles.ribbonSpacer} />

        {props.hiddenUnresolvedCount > 0 ? (
          <Button variant="default" size="xs" onClick={props.onRevealHidden}>
            <Trans>Reveal {props.hiddenUnresolvedCount} unresolved</Trans>
          </Button>
        ) : null}

        {props.canPreview ? (
          <Button
            variant={props.previewOpen ? "primary" : "default"}
            size="xs"
            onClick={props.onPreviewToggle}
            leftIcon={<Eye size={14} />}
          >
            <Trans>Preview</Trans>
          </Button>
        ) : null}

        <FiltersMenu
          hideWhitespaceOnly={props.hideWhitespaceOnly}
          onHideWhitespaceOnlyChange={props.onHideWhitespaceOnlyChange}
          hideUsfmStructureOnly={props.hideUsfmStructureOnly}
          onHideUsfmStructureOnlyChange={props.onHideUsfmStructureOnlyChange}
          hideDecided={props.hideDecided}
          onHideDecidedChange={props.onHideDecidedChange}
          showUsfmMarkers={props.showUsfmMarkers}
          onShowUsfmMarkersChange={props.onShowUsfmMarkersChange}
          readOnly={props.readOnly}
          popupPortalContainer={props.popupPortalContainer}
        />
      </div>

      {!props.readOnly ? (
        <div
          className={styles.toolbarSecondaryBand}
          aria-label={t`All decisions`}
        >
          <span className={styles.toolbarSecondaryLabel}>
            <Trans>All changes:</Trans>
          </span>
          <Button
            size="xs"
            variant="default"
            disabled={props.decisionDisabled}
            onClick={() => props.onGlobalDecision("left")}
          >
            <Trans>Use all Left</Trans>
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={props.decisionDisabled}
            onClick={() => props.onGlobalDecision("right")}
          >
            <Trans>Use all Right</Trans>
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={props.decisionDisabled}
            onClick={() => props.onGlobalDecision(null)}
          >
            <Trans>Clear all</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
