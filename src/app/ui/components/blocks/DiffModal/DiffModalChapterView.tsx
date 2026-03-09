import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
    ActionIcon,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Text,
    Tooltip,
} from "@mantine/core";
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
} from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import { shouldHideStructuralLineBreak } from "@/app/ui/components/blocks/DiffModal/diffDisplayUtils.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

function getTokenHighlightClass(
    status: "unchanged" | "added" | "deleted" | "modified" | "paired",
    viewType: "original" | "current",
) {
    if (status === "unchanged") return "";
    if (status === "paired") return "";
    if (viewType === "current") {
        if (status === "added" || status === "modified") {
            return styles.diffHighlightAdded;
        }
        return "";
    }
    if (status === "deleted" || status === "modified") {
        return styles.diffHighlightRemoved;
    }
    return "";
}

function renderWordGranularityToken(args: {
    originalText: string;
    currentText: string;
    viewType: "original" | "current";
}) {
    const wordDiff = diffWordsWithSpace(args.originalText, args.currentText);
    const spans: ReactNode[] = [];
    let tokenPart = 0;

    for (const change of wordDiff) {
        const key = `${tokenPart}-${change.value.length}-${change.added ? "a" : change.removed ? "r" : "n"}`;
        tokenPart += 1;

        if (args.viewType === "original") {
            if (change.added) continue;
            spans.push(
                <span
                    key={key}
                    className={
                        change.removed ? styles.diffHighlightRemoved : ""
                    }
                >
                    {change.value}
                </span>,
            );
            continue;
        }

        if (change.removed) continue;
        spans.push(
            <span
                key={key}
                className={change.added ? styles.diffHighlightAdded : ""}
            >
                {change.value}
            </span>,
        );
    }

    return spans;
}

function normalizeTokenChange(args: {
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    token: ChapterRenderParagraph["tokens"][number]["token"];
    counterpartToken?: ChapterRenderParagraph["tokens"][number]["token"];
}) {
    if (args.tokenChange !== "modified") return args.tokenChange;
    const counterpart = args.counterpartToken;
    if (!counterpart) return args.tokenChange;

    if (
        args.token.node.type === "linebreak" &&
        counterpart.node.type === "linebreak"
    ) {
        return "unchanged";
    }

    if (
        isSerializedUSFMTextNode(args.token.node) &&
        isSerializedUSFMTextNode(counterpart.node) &&
        args.token.node.text === counterpart.node.text &&
        args.token.node.tokenType === counterpart.node.tokenType &&
        (args.token.node.marker ?? "") === (counterpart.node.marker ?? "")
    ) {
        return "unchanged";
    }

    return args.tokenChange;
}

function ChapterStructuredToken({
    paragraph,
    tokenIndex,
    viewType,
    showUsfmMarkers,
    revertDiff,
}: {
    paragraph: ChapterRenderParagraph;
    tokenIndex: number;
    viewType: "original" | "current";
    showUsfmMarkers: boolean;
    revertDiff: (diffToRevert: ProjectDiff) => void;
}) {
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const tokenWithOwner = paragraph.tokens[tokenIndex];
    if (!tokenWithOwner) return null;
    const { entry, isFirstTokenOfEntry, token, tokenChange, counterpartToken } =
        tokenWithOwner;
    const effectiveTokenChange = normalizeTokenChange({
        tokenChange,
        token,
        counterpartToken,
    });

    const highlightClass = getTokenHighlightClass(
        effectiveTokenChange,
        viewType,
    );

    if (token.node.type === "linebreak") {
        const prevToken = paragraph.tokens[tokenIndex - 1]?.token;
        if (
            shouldHideStructuralLineBreak({
                showUsfmMarkers,
                tokenChange: effectiveTokenChange,
                previousToken: prevToken,
            })
        ) {
            return null;
        }

        const showMarker = effectiveTokenChange !== "unchanged";
        return (
            <span key={tokenWithOwner.key}>
                {showMarker && (
                    <span
                        className={highlightClass}
                        style={{ whiteSpace: "pre" }}
                    >
                        {"↵"}
                    </span>
                )}
                <br />
            </span>
        );
    }
    if (!isSerializedUSFMTextNode(token.node)) {
        return null;
    }

    const undoSide =
        entry.diffToRevert?.undoSide ??
        (entry.status === "deleted" ? "original" : "current");
    const isUndoSide = viewType === undoSide;
    const showUndoOverlay =
        isUndoSide &&
        isFirstTokenOfEntry &&
        entry.canRevert &&
        entry.diffToRevert;
    const localizedSid = entry.diffToRevert
        ? bookCodeToProjectLocalizedTitle({
              bookCode: entry.diffToRevert.bookCode,
              replaceCodeInString: entry.semanticSid,
          })
        : entry.semanticSid;
    const undoLabel = localizedSid ? t`Undo ${localizedSid}` : t`Undo Change`;

    const sideToken = token.node;
    const pairedCounterpartNode = counterpartToken?.node;
    const useWordGranularity =
        effectiveTokenChange === "modified" &&
        sideToken &&
        pairedCounterpartNode &&
        isSerializedUSFMTextNode(sideToken) &&
        isSerializedUSFMTextNode(pairedCounterpartNode);

    const tokenWordContent =
        useWordGranularity && isSerializedUSFMTextNode(sideToken)
            ? renderWordGranularityToken({
                  originalText:
                      viewType === "original"
                          ? sideToken.text
                          : (pairedCounterpartNode as typeof sideToken).text,
                  currentText:
                      viewType === "current"
                          ? sideToken.text
                          : (pairedCounterpartNode as typeof sideToken).text,
                  viewType,
              })
            : null;

    return (
        <span key={tokenWithOwner.key} className={styles.chapterPartChanged}>
            {showUndoOverlay && (
                <Tooltip label={undoLabel} withArrow position="top">
                    <ActionIcon
                        className={styles.chapterHunkAction}
                        data-testid={TESTING_IDS.save.chapterHunkAction}
                        onClick={() =>
                            revertDiff(entry.diffToRevert as ProjectDiff)
                        }
                        size="xs"
                        variant="subtle"
                        color="blue"
                        aria-label={undoLabel}
                        title={undoLabel}
                    >
                        <RotateCw size={12} />
                    </ActionIcon>
                </Tooltip>
            )}
            <span
                className={useWordGranularity ? "" : highlightClass}
                data-id={token.node.id}
                data-token-type={token.node.tokenType}
                data-sid={token.node.sid}
                data-in-para={token.node.inPara}
                data-marker={token.node.marker}
                data-lexical-text="true"
            >
                {tokenWordContent ?? sideToken.text}
            </span>
        </span>
    );
}

function ChapterStructuredText({
    paragraphs,
    showUsfmMarkers,
    viewType,
    revertDiff,
}: {
    paragraphs: ChapterRenderParagraph[];
    showUsfmMarkers: boolean;
    viewType: "original" | "current";
    revertDiff: (diffToRevert: ProjectDiff) => void;
}) {
    return (
        <div
            className={styles.chapterDiffBody}
            data-testid={TEST_ID_GENERATORS.diffCurrentPre(viewType)}
            data-editor-mode={showUsfmMarkers ? "usfm" : "regular"}
            data-editor-read-only="true"
        >
            {paragraphs.map((paragraph) => (
                <div
                    key={paragraph.key}
                    className="usfm-para-container"
                    data-id={paragraph.key}
                    data-token-type="marker"
                    data-sid={paragraph.sid}
                    data-in-para={paragraph.marker}
                    data-marker={paragraph.marker}
                >
                    {paragraph.tokens.map((_, tokenIndex) => (
                        <ChapterStructuredToken
                            key={`${paragraph.key}-${tokenIndex}`}
                            paragraph={paragraph}
                            tokenIndex={tokenIndex}
                            viewType={viewType}
                            showUsfmMarkers={showUsfmMarkers}
                            revertDiff={revertDiff}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function ChapterDiffStructuredDocument({
    diffs,
    hideWhitespaceOnly,
    showUsfmMarkers,
    chapterLabel,
    revertDiff,
    onRevertChapter,
}: {
    diffs: ProjectDiff[];
    hideWhitespaceOnly: boolean;
    showUsfmMarkers: boolean;
    chapterLabel: string;
    revertDiff: (diffToRevert: ProjectDiff) => void;
    onRevertChapter?: () => void;
}) {
    const { isSm } = useWorkspaceMediaQuery();
    const [mobileViewType, setMobileViewType] = useState<
        "original" | "current"
    >("current");
    const originalParagraphs = useMemo(
        () =>
            buildChapterRenderParagraphs({
                diffs,
                viewType: "original",
                hideWhitespaceOnly,
                showUsfmMarkers,
            }),
        [diffs, hideWhitespaceOnly, showUsfmMarkers],
    );
    const currentParagraphs = useMemo(
        () =>
            buildChapterRenderParagraphs({
                diffs,
                viewType: "current",
                hideWhitespaceOnly,
                showUsfmMarkers,
            }),
        [diffs, hideWhitespaceOnly, showUsfmMarkers],
    );

    return (
        <div
            data-testid={TESTING_IDS.save.chapterPanel}
            className={styles.chapterDiffItem}
        >
            <Group justify="space-between" align="center" mb="0">
                <Text className={styles.diffSidHeader}>{chapterLabel}</Text>
                {onRevertChapter && (
                    <Button
                        variant="light"
                        color="red"
                        size="xs"
                        onClick={onRevertChapter}
                    >
                        <Trans>Revert chapter changes</Trans>
                    </Button>
                )}
            </Group>

            {isSm ? (
                <div>
                    <SegmentedControl
                        value={mobileViewType}
                        onChange={(value) =>
                            setMobileViewType(value as "original" | "current")
                        }
                        data={[
                            { label: t`Current`, value: "current" },
                            { label: t`Original`, value: "original" },
                        ]}
                        size="xs"
                        fullWidth
                        mb="xs"
                    />
                    <Text className={styles.diffLabel} mb="xs">
                        {mobileViewType === "current" ? (
                            <Trans>Current</Trans>
                        ) : (
                            <Trans>Original</Trans>
                        )}
                    </Text>
                    <Paper p="md" className={styles.chapterDiffPanel}>
                        <ChapterStructuredText
                            paragraphs={
                                mobileViewType === "current"
                                    ? currentParagraphs
                                    : originalParagraphs
                            }
                            showUsfmMarkers={showUsfmMarkers}
                            viewType={mobileViewType}
                            revertDiff={revertDiff}
                        />
                    </Paper>
                </div>
            ) : (
                <div className={styles.chapterGrid}>
                    <div className={styles.chapterColumn}>
                        <Text className={styles.diffLabel} mb="xs">
                            <Trans>Original</Trans>
                        </Text>
                        <Paper p="md" className={styles.chapterDiffPanel}>
                            <ChapterStructuredText
                                paragraphs={originalParagraphs}
                                showUsfmMarkers={showUsfmMarkers}
                                viewType="original"
                                revertDiff={revertDiff}
                            />
                        </Paper>
                    </div>
                    <div className={styles.chapterColumn}>
                        <Text className={styles.diffLabel} mb="xs">
                            <Trans>Current</Trans>
                        </Text>
                        <Paper p="md" className={styles.chapterDiffPanel}>
                            <ChapterStructuredText
                                paragraphs={currentParagraphs}
                                showUsfmMarkers={showUsfmMarkers}
                                viewType="current"
                                revertDiff={revertDiff}
                            />
                        </Paper>
                    </div>
                </div>
            )}
        </div>
    );
}
