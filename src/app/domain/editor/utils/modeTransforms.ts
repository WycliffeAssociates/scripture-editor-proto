import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";

import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

// Re-export shared utilities from their canonical locations
export { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
export {
    isSerializedUSFMParagraphContainer,
    materializeFlatTokensArray,
} from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

/**
 * Detects if root children are wrapped in a single paragraph container (Source/Plain mode)
 */
export function unwrapFlatTokensFromRootChildren(
    rootChildren: SerializedLexicalNode[],
): SerializedLexicalNode[] | null {
    const onlyChild = rootChildren.length === 1 ? rootChildren[0] : undefined;
    if (onlyChild?.type !== "paragraph") return null;
    const maybeChildren = (onlyChild as { children?: unknown }).children;
    return Array.isArray(maybeChildren)
        ? (maybeChildren as SerializedLexicalNode[])
        : null;
}

/**
 * Wraps flat tokens in a Lexical paragraph container (for Source/Plain mode)
 */
export function wrapFlatTokensInLexicalParagraph(
    flatTokens: SerializedLexicalNode[],
    languageDirection: "ltr" | "rtl" = "ltr",
): SerializedElementNode {
    return {
        type: "paragraph",
        version: 1,
        direction: languageDirection,
        format: "",
        indent: 0,
        children: flatTokens,
    };
}

/**
 * Transform chapter state to a different editor mode
 */
export function transformToMode(
    state: SerializedEditorState,
    targetMode: "regular" | "usfm" | "plain",
): SerializedEditorState {
    const direction = (state.root.direction ?? "ltr") as "ltr" | "rtl";
    const rootChildren = state.root.children as SerializedLexicalNode[];

    // Check current format
    const isCurrentlyParagraphMode = rootChildren.some(
        (child) => (child as { type?: string }).type === "usfm-paragraph-node",
    );
    const wantsParagraphMode = targetMode === "regular";

    if (isCurrentlyParagraphMode === wantsParagraphMode) {
        // Already in correct format
        return state;
    }

    // Unwrap if wrapped in paragraph element
    const unwrapped = unwrapFlatTokensFromRootChildren(rootChildren);

    if (wantsParagraphMode) {
        // Transform TO regular mode (paragraph containers)
        const flatTokens =
            unwrapped ??
            materializeFlatTokensArray(rootChildren, { nested: "flatten" });
        return {
            ...state,
            root: {
                ...state.root,
                children: groupFlatNodesIntoParagraphContainers(
                    flatTokens,
                    direction,
                ),
            },
        };
    } else {
        // Transform TO usfm/plain mode (flat tokens wrapped in paragraph)
        const flatTokens =
            unwrapped ??
            materializeFlatTokensArray(rootChildren, { nested: "flatten" });
        return {
            ...state,
            root: {
                ...state.root,
                children: [
                    wrapFlatTokensInLexicalParagraph(flatTokens, direction),
                ],
            },
        };
    }
}
