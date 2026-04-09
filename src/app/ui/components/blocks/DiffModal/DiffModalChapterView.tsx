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
    buildChapterRenderParagraphs,
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

function tokenRendersVisible(args: {
    tokenWithOwner: ChapterTokenWithOwner;
    paragraph: ChapterRenderParagraph;
    tokenIndex: number;
    showUsfmMarkers: boolean;
}): boolean {
    if (args.tokenWithOwner.token.node.type === "linebreak") {
        const previousToken = args.paragraph.tokens[args.tokenIndex - 1]?.token;
        return !shouldHideStructuralLineBreak({
            showUsfmMarkers: args.showUsfmMarkers,
            tokenChange: args.tokenWithOwner.tokenChange,
            previousToken,
        });
    }

    const node = args.tokenWithOwner.token.node;
    if (!isSerializedUSFMTextNode(node)) return false;

    return Boolean(
        getVisibleChapterTokenText({
            showUsfmMarkers: args.showUsfmMarkers,
            token: node,
        }),
    );
}

function ChapterStructuredToken({
    tokenWithOwner,
    paragraph,
    tokenIndex,
    showUsfmMarkers,
    viewType,
    actionNode,
}: {
    tokenWithOwner: ChapterTokenWithOwner;
    paragraph: ChapterRenderParagraph;
    tokenIndex: number;
    showUsfmMarkers: boolean;
    viewType: "original" | "current";
    actionNode?: ReactNode;
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
                {actionNode}
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
        <>
            {actionNode}
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
        </>
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
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
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

    function renderChapterSide(viewType: "original" | "current") {
        const paragraphs =
            viewType === "original" ? originalParagraphs : currentParagraphs;
        const renderedActions = new Set<string>();
        const diffByKey = new Map(
            visibleDiffs.map((diff) => [diff.uniqueKey, diff] as const),
        );

        const buildActionNode = (tokenWithOwner: ChapterTokenWithOwner) => {
            const diff = diffByKey.get(tokenWithOwner.entry.uniqueKey);
            if (!diff) return null;
            const actionSide =
                actionMode === "external"
                    ? "current"
                    : (diff.undoSide ??
                      (diff.status === "deleted" ? "original" : "current"));
            if (viewType !== actionSide || diff.status === "unchanged") {
                return null;
            }
            if (renderedActions.has(diff.uniqueKey)) return null;
            renderedActions.add(diff.uniqueKey);

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
            const onActionClick = () => {
                if (actionMode === "external") {
                    onApplyDiffToCurrent(diff);
                    return;
                }
                onRevertDiff(diff);
            };
            return (
                <ActionIconSimple
                    className={styles.chapterHunkAction}
                    data-testid={TESTING_IDS.save.chapterHunkAction}
                    onClick={onActionClick}
                    aria-label={actionLabel}
                    title={actionLabel}
                >
                    <RotateCw size={12} />
                </ActionIconSimple>
            );
        };

        return paragraphs.map((paragraph) => {
            let hasAction = false;
            const tokenNodes = paragraph.tokens.map(
                (tokenWithOwner, tokenIndex) => {
                    const actionNode = tokenRendersVisible({
                        tokenWithOwner,
                        paragraph,
                        tokenIndex,
                        showUsfmMarkers,
                    })
                        ? buildActionNode(tokenWithOwner)
                        : null;
                    if (actionNode) {
                        hasAction = true;
                    }
                    return (
                        <ChapterStructuredToken
                            key={tokenWithOwner.key}
                            tokenWithOwner={tokenWithOwner}
                            paragraph={paragraph}
                            tokenIndex={tokenIndex}
                            showUsfmMarkers={showUsfmMarkers}
                            viewType={viewType}
                            actionNode={actionNode}
                        />
                    );
                },
            );

            return (
                <div
                    key={paragraph.key}
                    className={
                        hasAction
                            ? `usfm-para-container ${styles.chapterParagraphWithAction}`
                            : "usfm-para-container"
                    }
                    data-id={paragraph.key}
                    data-sid={paragraph.sid}
                    data-in-para={paragraph.marker}
                    data-marker={paragraph.marker}
                >
                    {tokenNodes}
                </div>
            );
        });
    }

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
                            {renderChapterSide(mobileViewType)}
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
                                {renderChapterSide("original")}
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
                                {renderChapterSide("current")}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
