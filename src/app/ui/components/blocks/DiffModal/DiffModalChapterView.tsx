import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Button, Group, Paper, Text, Tooltip } from "@mantine/core";
import { diffWordsWithSpace } from "diff";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    buildChapterRenderParagraphs,
    type ChapterRenderParagraph,
} from "@/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts";
import type { ProjectDiff } from "@/app/ui/hooks/useSave.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

function getTokenHighlightClass(
    status: ProjectDiff["status"],
    viewType: "original" | "current",
) {
    if (status === "unchanged") return "";
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

function ChapterStructuredToken({
    paragraph,
    tokenIndex,
    viewType,
    revertDiff,
}: {
    paragraph: ChapterRenderParagraph;
    tokenIndex: number;
    viewType: "original" | "current";
    revertDiff: (diffToRevert: ProjectDiff) => void;
}) {
    const { bookCodeToProjectLocalizedTitle } = useWorkspaceContext();
    const tokenWithOwner = paragraph.tokens[tokenIndex];
    if (!tokenWithOwner) return null;
    const { entry, isFirstTokenOfEntry, entryTokenIndex, token } =
        tokenWithOwner;

    if (token.node.type === "linebreak") {
        return <br key={tokenWithOwner.key} />;
    }
    if (!isSerializedUSFMTextNode(token.node)) {
        return null;
    }

    const highlightClass = getTokenHighlightClass(entry.status, viewType);
    const showUndoOverlay =
        viewType === "current" &&
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

    const sideTokens =
        viewType === "original"
            ? (entry.diffToRevert?.originalRenderTokens ?? [])
            : (entry.diffToRevert?.currentRenderTokens ?? []);
    const counterpartTokens =
        viewType === "original"
            ? (entry.diffToRevert?.currentRenderTokens ?? [])
            : (entry.diffToRevert?.originalRenderTokens ?? []);
    const sideToken = sideTokens[entryTokenIndex]?.node;
    const counterpartToken = counterpartTokens[entryTokenIndex]?.node;
    const useWordGranularity =
        entry.status === "modified" &&
        sideToken &&
        counterpartToken &&
        isSerializedUSFMTextNode(sideToken) &&
        isSerializedUSFMTextNode(counterpartToken);

    const tokenWordContent =
        useWordGranularity && isSerializedUSFMTextNode(sideToken)
            ? renderWordGranularityToken({
                  originalText:
                      viewType === "original"
                          ? sideToken.text
                          : (counterpartToken as typeof sideToken).text,
                  currentText:
                      viewType === "current"
                          ? sideToken.text
                          : (counterpartToken as typeof sideToken).text,
                  viewType,
              })
            : null;

    return (
        <span key={tokenWithOwner.key} className={styles.chapterPartChanged}>
            {showUndoOverlay && (
                <Tooltip label={undoLabel} withArrow position="top">
                    <Button
                        className={styles.chapterHunkAction}
                        data-testid={TESTING_IDS.save.chapterHunkAction}
                        onClick={() =>
                            revertDiff(entry.diffToRevert as ProjectDiff)
                        }
                        size="compact-xs"
                        variant="light"
                        color="blue"
                        leftSection={<RotateCw size={12} />}
                        aria-label={undoLabel}
                        title={undoLabel}
                    >
                        <Trans>Undo</Trans>
                    </Button>
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
                {tokenWordContent ?? token.node.text}
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
            <Group justify="space-between" align="center" gap="xs">
                <Text className={styles.diffSidHeader}>{chapterLabel}</Text>
                {onRevertChapter && (
                    <Button
                        variant="outline"
                        color="red"
                        size="xs"
                        onClick={onRevertChapter}
                    >
                        <Trans>Revert chapter changes</Trans>
                    </Button>
                )}
            </Group>

            <div className={styles.chapterGrid}>
                <div className={styles.chapterColumn}>
                    <Text className={styles.diffLabel}>
                        <Trans>Original</Trans>
                    </Text>
                    <Paper p="xs" className={styles.chapterDiffPanel}>
                        <ChapterStructuredText
                            paragraphs={originalParagraphs}
                            showUsfmMarkers={showUsfmMarkers}
                            viewType="original"
                            revertDiff={revertDiff}
                        />
                    </Paper>
                </div>
                <div className={styles.chapterColumn}>
                    <Text className={styles.diffLabel}>
                        <Trans>Current</Trans>
                    </Text>
                    <Paper p="xs" className={styles.chapterDiffPanel}>
                        <ChapterStructuredText
                            paragraphs={currentParagraphs}
                            showUsfmMarkers={showUsfmMarkers}
                            viewType="current"
                            revertDiff={revertDiff}
                        />
                    </Paper>
                </div>
            </div>
        </div>
    );
}
