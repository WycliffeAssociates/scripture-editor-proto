import { $dfsIterator } from "@lexical/utils";
import {
    $getRoot,
    $getSelection,
    $isLineBreakNode,
    $isRangeSelection,
    $isTextNode,
    type LexicalNode,
} from "lexical";
import { $isUSFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

type CondensedNodeSummary = {
    key: string;
    type: string;
    parentKey: string | null;
    marker?: string;
    tokenType?: string;
    text?: string;
};

type CondensedPointSummary = {
    key: string;
    offset: number;
    type: "text" | "element";
    node: CondensedNodeSummary | null;
};

function summarizeNode(node: LexicalNode): CondensedNodeSummary {
    const summary: CondensedNodeSummary = {
        key: node.getKey(),
        type: node.getType(),
        parentKey: node.getParent()?.getKey() ?? null,
    };

    if ($isUSFMParagraphNode(node)) {
        summary.marker = node.getMarker();
        summary.tokenType = node.getTokenType();
        return summary;
    }

    if ($isUSFMTextNode(node)) {
        summary.marker = node.getMarker();
        summary.tokenType = node.getTokenType();
        summary.text = node.getTextContent().slice(0, 10);
        return summary;
    }

    if ($isLineBreakNode(node)) {
        return summary;
    }

    if ($isTextNode(node)) {
        summary.text = node.getTextContent().slice(0, 10);
    }

    return summary;
}

function summarizePoint(
    point: {
        getNode: () => LexicalNode;
        key: string;
        offset: number;
        type: "text" | "element";
    } | null,
): CondensedPointSummary | null {
    if (!point) return null;
    const node = point.getNode();
    return {
        key: point.key,
        offset: point.offset,
        type: point.type,
        node: node ? summarizeNode(node) : null,
    };
}

export function buildCondensedLexicalSelectionSnapshot(): string {
    const selection = $getSelection();
    const allNodes = [...$dfsIterator()].map((entry) => entry.node);
    const nodeSummaries = allNodes.map(summarizeNode);
    const indexByKey = new Map(
        nodeSummaries.map((node, index) => [node.key, index]),
    );

    const anchorSummary = $isRangeSelection(selection)
        ? summarizePoint(selection.anchor)
        : null;
    const focusSummary = $isRangeSelection(selection)
        ? summarizePoint(selection.focus)
        : null;

    const selectedIndices = [anchorSummary?.key, focusSummary?.key]
        .filter((key): key is string => Boolean(key))
        .map((key) => indexByKey.get(key))
        .filter((index): index is number => index !== undefined);

    const minIndex = selectedIndices.length ? Math.min(...selectedIndices) : 0;
    const maxIndex = selectedIndices.length ? Math.max(...selectedIndices) : 0;
    const windowStart = Math.max(0, minIndex - 3);
    const windowEnd = Math.min(nodeSummaries.length, maxIndex + 3);

    return buildLexicalSnapshotJson({
        nearbyNodes: nodeSummaries.slice(windowStart, windowEnd),
        anchorSummary,
        focusSummary,
    });
}

export function buildFullLexicalSelectionSnapshot(): string {
    const allNodes = [...$dfsIterator()].map((entry) => entry.node);
    const selection = $getSelection();
    const anchorSummary = $isRangeSelection(selection)
        ? summarizePoint(selection.anchor)
        : null;
    const focusSummary = $isRangeSelection(selection)
        ? summarizePoint(selection.focus)
        : null;

    return buildLexicalSnapshotJson({
        nearbyNodes: allNodes.map(summarizeNode),
        anchorSummary,
        focusSummary,
    });
}

function buildLexicalSnapshotJson(args: {
    nearbyNodes: CondensedNodeSummary[];
    anchorSummary: CondensedPointSummary | null;
    focusSummary: CondensedPointSummary | null;
}): string {
    const selection = $getSelection();

    const payload = {
        selection: $isRangeSelection(selection)
            ? {
                  kind: "range",
                  isCollapsed: selection.isCollapsed(),
                  anchor: args.anchorSummary,
                  focus: args.focusSummary,
              }
            : selection
              ? { kind: selection.constructor.name }
              : null,
        root: summarizeNode($getRoot()),
        nearbyNodes: args.nearbyNodes,
    };

    return JSON.stringify(payload, null, 2);
}
