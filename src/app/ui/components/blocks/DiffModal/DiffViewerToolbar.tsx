import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BookOpen, List, X } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  CompareSide,
  CompareSourceDescriptor,
  CompareSourceKind,
} from "@/app/domain/project/compare/types.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

export type DiffViewMode = "list" | "chapter";

export type DiffViewerToolbarProps = Readonly<{
  onClose: () => void;
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
}: Pick<
  DiffViewerToolbarProps,
  | "sourceDisabled"
  | "availableProjects"
  | "versionOptions"
  | "onSourceKind"
  | "onProject"
  | "onVersion"
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
  return (
    <div className={styles.compareSourceControl}>
      <span className={styles.compareSourceSide}>
        {side === "left" ? <Trans>Left</Trans> : <Trans>Right</Trans>}
      </span>
      <label className={styles.visuallyHidden} htmlFor={`compare-${side}-kind`}>
        {side === "left" ? (
          <Trans>Choose left source</Trans>
        ) : (
          <Trans>Choose right source</Trans>
        )}
      </label>
      <select
        id={`compare-${side}-kind`}
        className={styles.compareSourceSelect}
        value={kind}
        disabled={sourceDisabled}
        onChange={(event) => {
          const next = event.currentTarget.value as CompareSourceKind;
          setPendingKind(next);
          if (next !== "existingProject" && next !== "previousVersion") {
            onSourceKind(side, next);
          }
        }}
      >
        {!kind ? <option value="">{t`Choose a source`}</option> : null}
        <option value="working">{t`Working copy`}</option>
        <option value="saved">{t`Saved copy`}</option>
        <option value="remoteLatest">{t`Incoming shared changes`}</option>
        <option value="previousVersion">{t`Previous version`}</option>
        <option value="existingProject">{t`Another project`}</option>
        <option value="zipFile">{t`ZIP file`}</option>
        <option value="directory">{t`Folder`}</option>
      </select>
      {kind === "existingProject" ? (
        <select
          aria-label={side === "left" ? t`Left project` : t`Right project`}
          className={styles.compareSourceSelect}
          value={
            source?.locator.kind === "existingProject"
              ? source.locator.projectId
              : ""
          }
          disabled={sourceDisabled}
          onChange={(event) => onProject(side, event.currentTarget.value)}
        >
          <option value="">{t`Choose a project`}</option>
          {availableProjects.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {kind === "previousVersion" ? (
        <select
          aria-label={side === "left" ? t`Left version` : t`Right version`}
          className={styles.compareSourceSelect}
          value={
            source?.locator.kind === "previousVersion" ? source.locator.oid : ""
          }
          disabled={sourceDisabled}
          onChange={(event) => onVersion(side, event.currentTarget.value)}
        >
          <option value="">{t`Choose a version`}</option>
          {versionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <span className={styles.compareSourceLabel}>
        {source?.label ?? t`Not selected`}
      </span>
    </div>
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
          <select
            className={styles.compareSourceSelect}
            aria-label={t`Choose chapter`}
            value={props.selectedChapter ?? ""}
            onChange={(event) =>
              props.onSelectedChapterChange(event.currentTarget.value)
            }
          >
            {props.chapterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        <label className={styles.compareFilterLabel}>
          <input
            type="checkbox"
            checked={props.hideWhitespaceOnly}
            onChange={(event) =>
              props.onHideWhitespaceOnlyChange(event.currentTarget.checked)
            }
          />
          <Trans>Hide whitespace</Trans>
        </label>
        <label className={styles.compareFilterLabel}>
          <input
            type="checkbox"
            checked={props.hideUsfmStructureOnly}
            onChange={(event) =>
              props.onHideUsfmStructureOnlyChange(event.currentTarget.checked)
            }
          />
          <Trans>Hide USFM-only</Trans>
        </label>
        {!props.readOnly ? (
          <label className={styles.compareFilterLabel}>
            <input
              type="checkbox"
              checked={props.hideDecided}
              onChange={(event) =>
                props.onHideDecidedChange(event.currentTarget.checked)
              }
            />
            <Trans>Hide decided</Trans>
          </label>
        ) : null}
        <label className={styles.compareFilterLabel}>
          <input
            type="checkbox"
            checked={props.showUsfmMarkers}
            onChange={(event) =>
              props.onShowUsfmMarkersChange(event.currentTarget.checked)
            }
          />
          <Trans>Show USFM</Trans>
        </label>

        {props.hiddenUnresolvedCount > 0 ? (
          <Button variant="default" size="xs" onClick={props.onRevealHidden}>
            <Trans>Reveal {props.hiddenUnresolvedCount} unresolved</Trans>
          </Button>
        ) : null}

        {!props.readOnly ? (
          <div
            className={styles.compareBulkActions}
            aria-label={t`All decisions`}
          >
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
    </div>
  );
}
