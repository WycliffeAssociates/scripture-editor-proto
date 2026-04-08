import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { diffWordsWithSpace } from "diff";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import {
    buildEntryRenderParagraphs,
    type ChapterRenderParagraph,
    type ChapterTokenWithOwner,
} from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import { shouldHideStructuralLineBreak } from "@/app/ui/components/blocks/DiffModal/diffDisplayUtils.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/index.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

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
                    <span
                        className={linebreakClass}
                        style={{ whiteSpace: "pre" }}
                    >
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
                          viewType === "original"
                              ? displayText
                              : counterpartDisplayText,
                      currentText:
                          viewType === "current"
                              ? displayText
                              : counterpartDisplayText,
                      viewType,
                  })
                : displayText}
        </span>
    );
}

function EntrySide({
    actionMode,
    diff,
    viewType,
    showUsfmMarkers,
    onRevertDiff,
    onApplyDiffToCurrent,
}: {
    actionMode: "unsaved" | "external";
    diff: ProjectDiff;
    viewType: "original" | "current";
    showUsfmMarkers: boolean;
    onRevertDiff: (diffToRevert: ProjectDiff) => void;
    onApplyDiffToCurrent: (diffToApply: ProjectDiff) => void;
}) {
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const entry = buildEntryRenderParagraphs({
        diff,
        viewType,
        showUsfmMarkers,
    });
    const firstTokenWithOwner = entry.flatMap(
        (paragraph) => paragraph.tokens,
    )[0];
    if (!firstTokenWithOwner) return null;

    const entryMeta = {
        uniqueKey: diff.uniqueKey,
        semanticSid: diff.semanticSid,
        status: diff.status,
        canRevert: diff.status !== "unchanged",
        diffToRevert: diff.status !== "unchanged" ? diff : undefined,
    };

    const localizedSid = entryMeta.diffToRevert
        ? bookCodeToProjectLocalizedTitle({
              bookCode: entryMeta.diffToRevert.bookCode,
              replaceCodeInString: diff.semanticSid,
          })
        : diff.semanticSid;
    const actionLabel =
        actionMode === "external"
            ? t`Accept change in ${localizedSid} to current`
            : localizedSid
              ? t`Undo ${localizedSid}`
              : t`Undo Change`;
    const onActionClick = () => {
        if (!entryMeta.diffToRevert) return;
        if (actionMode === "external") {
            onApplyDiffToCurrent(entryMeta.diffToRevert);
            return;
        }
        onRevertDiff(entryMeta.diffToRevert);
    };

    const actionSide =
        actionMode === "external"
            ? "current"
            : (diff.undoSide ??
              (diff.status === "deleted" ? "original" : "current"));
    const showActionOverlay =
        viewType === actionSide &&
        entryMeta.canRevert &&
        !!entryMeta.diffToRevert;

    return (
        <div className={styles.chapterPartChanged}>
            {showActionOverlay && (
                <ActionIconSimple
                    className={styles.chapterHunkAction}
                    data-testid={TESTING_IDS.save.chapterHunkAction}
                    onClick={onActionClick}
                    aria-label={actionLabel}
                    title={actionLabel}
                >
                    <RotateCw size={12} />
                </ActionIconSimple>
            )}
            {entry.map((paragraph) => (
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
    const [mobileViewType, setMobileViewType] = useState<
        "original" | "current"
    >("current");
    const visibleDiffs = useMemo(
        () =>
            hideWhitespaceOnly
                ? diffs.filter((diff) => !diff.isWhitespaceChange)
                : diffs,
        [diffs, hideWhitespaceOnly],
    );

    return (
        <div
            data-testid={TESTING_IDS.save.chapterPanel}
            className={styles.chapterDiffItem}
        >
            <div className={styles.diffToolbarRow}>
                <span className={styles.diffSidHeader}>{chapterLabel}</span>
                {onChapterAction && (
                    <Button
                        variant="primary"
                        size="xs"
                        onClick={onChapterAction}
                    >
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
                        <div
                            className={styles.chapterDiffBody}
                            data-testid={TEST_ID_GENERATORS.diffCurrentPre(
                                mobileViewType,
                            )}
                            data-editor-mode={
                                showUsfmMarkers ? "usfm" : "regular"
                            }
                            data-editor-read-only="true"
                        >
                            {visibleDiffs.map((diff) => (
                                <EntrySide
                                    key={`${diff.uniqueKey}-${mobileViewType}`}
                                    actionMode={actionMode}
                                    diff={diff}
                                    viewType={mobileViewType}
                                    showUsfmMarkers={showUsfmMarkers}
                                    onRevertDiff={onRevertDiff}
                                    onApplyDiffToCurrent={onApplyDiffToCurrent}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className={styles.chapterGrid}>
                    <div className={styles.chapterColumn}>
                        <span className={styles.diffLabel}>
                            {originalLabel}
                        </span>
                        <div className={styles.chapterDiffPanel}>
                            <div
                                className={styles.chapterDiffBody}
                                data-testid={TEST_ID_GENERATORS.diffCurrentPre(
                                    "original",
                                )}
                                data-editor-mode={
                                    showUsfmMarkers ? "usfm" : "regular"
                                }
                                data-editor-read-only="true"
                            >
                                {visibleDiffs.map((diff) => (
                                    <EntrySide
                                        key={`${diff.uniqueKey}-original`}
                                        actionMode={actionMode}
                                        diff={diff}
                                        viewType="original"
                                        showUsfmMarkers={showUsfmMarkers}
                                        onRevertDiff={onRevertDiff}
                                        onApplyDiffToCurrent={
                                            onApplyDiffToCurrent
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={styles.chapterColumn}>
                        <span className={styles.diffLabel}>{currentLabel}</span>
                        <div className={styles.chapterDiffPanel}>
                            <div
                                className={styles.chapterDiffBody}
                                data-testid={TEST_ID_GENERATORS.diffCurrentPre(
                                    "current",
                                )}
                                data-editor-mode={
                                    showUsfmMarkers ? "usfm" : "regular"
                                }
                                data-editor-read-only="true"
                            >
                                {visibleDiffs.map((diff) => (
                                    <EntrySide
                                        key={`${diff.uniqueKey}-current`}
                                        actionMode={actionMode}
                                        diff={diff}
                                        viewType="current"
                                        showUsfmMarkers={showUsfmMarkers}
                                        onRevertDiff={onRevertDiff}
                                        onApplyDiffToCurrent={
                                            onApplyDiffToCurrent
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
