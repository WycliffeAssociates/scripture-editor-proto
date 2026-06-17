import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { diffWordsWithSpace } from "diff";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import {
  buildChapterRenderParagraphs,
  type ChapterRenderParagraph,
  type ChapterTokenWithOwner,
} from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import { shouldHideStructuralLineBreak } from "@/app/ui/components/blocks/DiffModal/diffDisplayUtils.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/index.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/useWorkspaceMediaQuery.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

type ChapterActionOverlayEntry = {
  key: string;
  label: string;
  left: number;
  onClick: () => void;
  top: number;
};

function getVisibleChapterTokenText(args: {
  showUsfmMarkers: boolean;
  token: Extract<
    ChapterRenderParagraph["tokens"][number]["token"]["node"],
    { type: string }
  >;
}): string {
  if (!isSerializedUSFMTextNode(args.token)) return "";

  if (!args.showUsfmMarkers) {
    if (
      args.token.tokenType === "marker" ||
      args.token.tokenType === "endMarker"
    ) {
      return "";
    }
    return args.token.text;
  }

  const explicitText = args.token.text ?? "";
  if (explicitText.trim().length > 0) {
    return explicitText;
  }

  if (!args.token.marker) {
    return explicitText;
  }

  if (args.token.tokenType === "endMarker") {
    return `\\${args.token.marker}*`;
  }

  if (args.token.tokenType === "marker") {
    return `\\${args.token.marker}`;
  }

  return explicitText;
}

function renderTokenDiff(args: {
  originalText: string;
  currentText: string;
  viewType: "original" | "current";
}) {
  const wordDiff = diffWordsWithSpace(args.originalText, args.currentText);
  const nodes: ReactNode[] = [];
  let partIndex = 0;

  for (const change of wordDiff) {
    if (args.viewType === "original" && change.added) continue;
    if (args.viewType === "current" && change.removed) continue;

    const className =
      args.viewType === "current"
        ? change.added
          ? styles.diffHighlightAdded
          : ""
        : change.removed
          ? styles.diffHighlightRemoved
          : "";
    nodes.push(
      <span
        key={`part-${partIndex++}`}
        className={className}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {change.value}
      </span>,
    );
  }

  return nodes;
}

function escapeCssValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isRenderedElement(el: HTMLElement): boolean {
  return Boolean(
    el.offsetWidth || el.offsetHeight || el.getClientRects().length,
  );
}

function ChapterStructuredToken({
  tokenWithOwner,
  paragraph,
  tokenIndex,
  showUsfmMarkers,
  viewType,
}: {
  tokenWithOwner: ChapterTokenWithOwner;
  paragraph: ChapterRenderParagraph;
  tokenIndex: number;
  showUsfmMarkers: boolean;
  viewType: "original" | "current";
}) {
  if (tokenWithOwner.token.node.type === "linebreak") {
    const previousToken = paragraph.tokens[tokenIndex - 1]?.token;
    if (
      shouldHideStructuralLineBreak({
        showUsfmMarkers,
        tokenChange: tokenWithOwner.tokenChange,
        previousToken,
      })
    ) {
      return null;
    }

    const linebreakClass =
      viewType === "current"
        ? tokenWithOwner.tokenChange === "added" ||
          tokenWithOwner.tokenChange === "modified"
          ? styles.diffHighlightAdded
          : ""
        : tokenWithOwner.tokenChange === "deleted" ||
            tokenWithOwner.tokenChange === "modified"
          ? styles.diffHighlightRemoved
          : "";

    return (
      <span key={tokenWithOwner.key}>
        {tokenWithOwner.tokenChange !== "unchanged" && (
          <span className={linebreakClass} style={{ whiteSpace: "pre" }}>
            {"↵"}
          </span>
        )}
        <br />
      </span>
    );
  }

  const node = tokenWithOwner.token.node;
  if (!isSerializedUSFMTextNode(node)) return null;

  const displayText = getVisibleChapterTokenText({
    showUsfmMarkers,
    token: node,
  });
  if (!displayText) return null;

  const counterpartNode = tokenWithOwner.counterpartToken?.node;
  const counterpartDisplayText =
    counterpartNode && isSerializedUSFMTextNode(counterpartNode)
      ? getVisibleChapterTokenText({
          showUsfmMarkers,
          token: counterpartNode,
        })
      : "";

  const isModifiedWithPair =
    !!counterpartNode &&
    isSerializedUSFMTextNode(counterpartNode) &&
    displayText !== counterpartDisplayText &&
    (tokenWithOwner.tokenChange === "modified" ||
      tokenWithOwner.tokenChange === "unchanged");
  const wholeTokenClass =
    viewType === "current"
      ? tokenWithOwner.tokenChange === "added"
        ? styles.diffHighlightAdded
        : ""
      : tokenWithOwner.tokenChange === "deleted"
        ? styles.diffHighlightRemoved
        : "";

  return (
    <span
      key={tokenWithOwner.key}
      data-id={node.id}
      data-token-type={node.tokenType}
      data-sid={node.sid}
      data-in-para={node.inPara}
      data-marker={node.marker}
      data-lexical-text="true"
      className={wholeTokenClass}
      style={{ whiteSpace: "pre-wrap" }}
    >
      {isModifiedWithPair
        ? renderTokenDiff({
            originalText:
              viewType === "original" ? displayText : counterpartDisplayText,
            currentText:
              viewType === "current" ? displayText : counterpartDisplayText,
            viewType,
          })
        : displayText}
    </span>
  );
}

function ChapterActionOverlays({
  actionMode,
  diffs,
  onApplyDiffToCurrent,
  onRevertDiff,
  rootRef,
  viewType,
}: {
  actionMode: "unsaved" | "external";
  diffs: ProjectDiff[];
  onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
  onRevertDiff: (diffToRevert: ProjectDiff) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  viewType: "original" | "current";
}) {
  const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
  const [entries, setEntries] = useState<ChapterActionOverlayEntry[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      const nextEntries: ChapterActionOverlayEntry[] = [];

      for (const diff of diffs) {
        const actionSide =
          actionMode === "external"
            ? "current"
            : (diff.undoSide ??
              (diff.status === "deleted" ? "original" : "current"));
        if (viewType !== actionSide || diff.status === "unchanged") {
          continue;
        }

        const sidSelector = `[data-sid="${escapeCssValue(diff.semanticSid)}"]`;
        const numberRanges = Array.from(
          root.querySelectorAll<HTMLElement>(
            `${sidSelector}[data-token-type="numberRange"]`,
          ),
        );
        const allSidNodes = Array.from(
          root.querySelectorAll<HTMLElement>(sidSelector),
        );
        const anchor =
          numberRanges.find((element) => isRenderedElement(element)) ??
          numberRanges[0] ??
          allSidNodes.find((element) => isRenderedElement(element)) ??
          allSidNodes[0];
        if (!anchor) continue;

        const rect = anchor.getBoundingClientRect();
        const localizedSid = bookCodeToProjectLocalizedTitle({
          bookCode: diff.bookCode,
          replaceCodeInString: diff.semanticSid,
        });
        const actionLabel =
          actionMode === "external"
            ? t`Accept change in ${localizedSid} to current`
            : localizedSid
              ? t`Undo ${localizedSid}`
              : t`Undo Change`;
        const onClick = () => {
          if (actionMode === "external") {
            onApplyDiffToCurrent(diff);
            return;
          }
          onRevertDiff(diff);
        };

        nextEntries.push({
          key: diff.uniqueKey,
          label: actionLabel,
          left: Math.max(rect.left - rootRect.left - 24, 0),
          top: Math.max(rect.top - rootRect.top + (rect.height - 16) / 2, 0),
          onClick,
        });
      }

      setEntries(nextEntries);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    actionMode,
    bookCodeToProjectLocalizedTitle,
    diffs,
    onApplyDiffToCurrent,
    onRevertDiff,
    rootRef,
    viewType,
  ]);

  if (entries.length === 0) return null;

  return (
    <div className={styles.chapterActionOverlayHost} aria-hidden="true">
      {entries.map((entry) => (
        <IconTooltip key={entry.key} label={entry.label}>
          <ActionIconSimple
            className={styles.chapterHunkAction}
            data-testid={TESTING_IDS.save.chapterHunkAction}
            onClick={entry.onClick}
            aria-label={entry.label}
            title={entry.label}
            style={{ left: `${entry.left}px`, top: `${entry.top}px` }}
          >
            <RotateCw size={16} />
          </ActionIconSimple>
        </IconTooltip>
      ))}
    </div>
  );
}

function ChapterDiffSide({
  actionMode,
  diffs,
  onApplyDiffToCurrent,
  onRevertDiff,
  paragraphs,
  showUsfmMarkers,
  testId,
  viewType,
}: {
  actionMode: "unsaved" | "external";
  diffs: ProjectDiff[];
  onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
  onRevertDiff: (diffToRevert: ProjectDiff) => void;
  paragraphs: ChapterRenderParagraph[];
  showUsfmMarkers: boolean;
  testId: string;
  viewType: "original" | "current";
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={rootRef}
      className={styles.chapterDiffBody}
      data-testid={testId}
      data-editor-mode={showUsfmMarkers ? "usfm" : "regular"}
      data-editor-read-only="true"
    >
      {paragraphs.map((paragraph) => (
        <div
          key={paragraph.key}
          className="usfm-para-container"
          data-id={paragraph.key}
          data-sid={paragraph.sid}
          data-in-para={paragraph.marker}
          data-marker={paragraph.marker}
        >
          {paragraph.tokens.map((tokenWithOwner, tokenIndex) => (
            <ChapterStructuredToken
              key={tokenWithOwner.key}
              tokenWithOwner={tokenWithOwner}
              paragraph={paragraph}
              tokenIndex={tokenIndex}
              showUsfmMarkers={showUsfmMarkers}
              viewType={viewType}
            />
          ))}
        </div>
      ))}
      <ChapterActionOverlays
        actionMode={actionMode}
        diffs={diffs}
        onApplyDiffToCurrent={onApplyDiffToCurrent}
        onRevertDiff={onRevertDiff}
        rootRef={rootRef}
        viewType={viewType}
      />
    </div>
  );
}

export function ChapterDiffStructuredDocument({
  diffs,
  actionMode,
  hideWhitespaceOnly,
  showUsfmMarkers,
  chapterLabel,
  onRevertDiff,
  onApplyDiffToCurrent,
  onChapterAction,
  originalLabel,
  currentLabel,
}: {
  diffs: ProjectDiff[];
  actionMode: "unsaved" | "external";
  hideWhitespaceOnly: boolean;
  showUsfmMarkers: boolean;
  chapterLabel: string;
  onRevertDiff: (diffToRevert: ProjectDiff) => void;
  onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
  onChapterAction?: () => void;
  originalLabel: string;
  currentLabel: string;
}) {
  const { isSm } = useWorkspaceMediaQuery();
  const [mobileViewType, setMobileViewType] = useState<"original" | "current">(
    "current",
  );
  const visibleDiffs = useMemo(
    () =>
      hideWhitespaceOnly
        ? diffs.filter((diff) => !diff.isWhitespaceChange)
        : diffs,
    [diffs, hideWhitespaceOnly],
  );
  const originalParagraphs = useMemo(
    () =>
      buildChapterRenderParagraphs({
        diffs: visibleDiffs,
        viewType: "original",
        hideWhitespaceOnly,
        showUsfmMarkers,
      }),
    [visibleDiffs, hideWhitespaceOnly, showUsfmMarkers],
  );
  const currentParagraphs = useMemo(
    () =>
      buildChapterRenderParagraphs({
        diffs: visibleDiffs,
        viewType: "current",
        hideWhitespaceOnly,
        showUsfmMarkers,
      }),
    [visibleDiffs, hideWhitespaceOnly, showUsfmMarkers],
  );

  return (
    <div
      data-testid={TESTING_IDS.save.chapterPanel}
      className={styles.chapterDiffItem}
    >
      <div className={styles.diffToolbarRow}>
        <span className={styles.diffSidHeader}>{chapterLabel}</span>
        {onChapterAction && (
          <Button variant="primary" size="xs" onClick={onChapterAction}>
            {actionMode === "external" ? (
              <Trans>Take all changes in this chapter</Trans>
            ) : (
              <Trans>Revert changes in this chapter</Trans>
            )}
          </Button>
        )}
      </div>

      {isSm ? (
        <div>
          <ToggleGroup
            value={mobileViewType}
            onValueChange={(value) =>
              setMobileViewType(value as "original" | "current")
            }
            items={[
              { label: currentLabel, value: "current" },
              { label: originalLabel, value: "original" },
            ]}
            className={styles.chapterMobileToggle}
          />
          <div className={styles.chapterDiffPanel}>
            <ChapterDiffSide
              actionMode={actionMode}
              diffs={visibleDiffs}
              onApplyDiffToCurrent={onApplyDiffToCurrent}
              onRevertDiff={onRevertDiff}
              paragraphs={
                mobileViewType === "original"
                  ? originalParagraphs
                  : currentParagraphs
              }
              showUsfmMarkers={showUsfmMarkers}
              testId={TEST_ID_GENERATORS.diffCurrentPre(mobileViewType)}
              viewType={mobileViewType}
            />
          </div>
        </div>
      ) : (
        <div className={styles.chapterGrid}>
          <div className={styles.chapterColumn}>
            <span className={styles.diffLabel}>{originalLabel}</span>
            <div className={styles.chapterDiffPanel}>
              <ChapterDiffSide
                actionMode={actionMode}
                diffs={visibleDiffs}
                onApplyDiffToCurrent={onApplyDiffToCurrent}
                onRevertDiff={onRevertDiff}
                paragraphs={originalParagraphs}
                showUsfmMarkers={showUsfmMarkers}
                testId={TEST_ID_GENERATORS.diffCurrentPre("original")}
                viewType="original"
              />
            </div>
          </div>
          <div className={styles.chapterColumn}>
            <span className={styles.diffLabel}>{currentLabel}</span>
            <div className={styles.chapterDiffPanel}>
              <ChapterDiffSide
                actionMode={actionMode}
                diffs={visibleDiffs}
                onApplyDiffToCurrent={onApplyDiffToCurrent}
                onRevertDiff={onRevertDiff}
                paragraphs={currentParagraphs}
                showUsfmMarkers={showUsfmMarkers}
                testId={TEST_ID_GENERATORS.diffCurrentPre("current")}
                viewType="current"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
