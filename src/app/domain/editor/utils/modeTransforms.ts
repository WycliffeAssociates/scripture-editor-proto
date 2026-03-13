import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import {
    type ContentEditorModeSetting,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    nestedEditorMarkers,
    USFM_NESTED_DECORATOR_TYPE,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import {
    isDocumentMarker,
    isValidParaMarker,
} from "@/core/domain/usfm/onionMarkers.ts";

// Re-export shared utilities from their canonical locations
export { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
export { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

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

function markerFromUsfmTokenText(text: string | undefined): string | null {
    if (!text) return null;
    const match = text.match(/^\\(?:\+)?([\w\d]+-?\w*)\*?/u);
    if (!match) return null;
    return match[1] ?? null;
}

function isSerializedMarkerToken(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.marker
    );
}

function isSerializedEndMarkerToken(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.endMarker
    );
}

const isSectionMarker = (marker: string) =>
    marker === "s" || /^s\d+$/u.test(marker);
const isContainerStartMarker = (marker: string) =>
    isValidParaMarker(marker) ||
    isDocumentMarker(marker) ||
    marker === "c" ||
    isSectionMarker(marker);

/**
 * Converts flattened note/crossref streams back into `USFMNestedEditorNodeJSON`.
 *
 * Mode switching flattens nested editor nodes into a token stream:
 *   `\\f ... \\f*`
 *
 * When switching back to Regular mode we want those notes to be nested again,
 * otherwise the footnote content appears inlined in the main text.
 */
export function rewrapNestedEditorNodesFromFlatTokens(
    flatTokens: SerializedLexicalNode[],
    direction: "ltr" | "rtl",
): SerializedLexicalNode[] {
    const out: SerializedLexicalNode[] = [];

    for (let i = 0; i < flatTokens.length; i++) {
        const node = flatTokens[i];

        if (!isSerializedMarkerToken(node)) {
            out.push(node);
            continue;
        }

        const marker = node.marker ?? markerFromUsfmTokenText(node.text);
        if (!marker || !nestedEditorMarkers.has(marker)) {
            out.push(node);
            continue;
        }

        // Find the matching `\\marker*` end marker. If not found, leave as-is.
        let endIndex = -1;
        for (let j = i + 1; j < flatTokens.length; j++) {
            const maybeEnd = flatTokens[j];
            if (!isSerializedEndMarkerToken(maybeEnd)) continue;

            const endMarker =
                maybeEnd.marker ??
                markerFromUsfmTokenText(
                    // text usually looks like "\\f*"
                    (maybeEnd.text ?? "").replace("*", ""),
                );
            if (endMarker === marker) {
                endIndex = j;
                break;
            }
        }

        // If end marker is missing, infer closure at the next paragraph boundary.
        // This mirrors the parser lint autofix behavior which inserts `\\marker*`
        // at the next paragraph marker or newline.
        const boundaryIndex =
            endIndex !== -1
                ? endIndex + 1
                : (() => {
                      for (let j = i + 1; j < flatTokens.length; j++) {
                          const t = flatTokens[j];
                          if (t?.type === "linebreak") return j;
                          if (!isSerializedMarkerToken(t)) continue;
                          const m = t.marker ?? markerFromUsfmTokenText(t.text);
                          if (m && isContainerStartMarker(m)) return j;
                      }
                      return flatTokens.length;
                  })();

        const nestedChildren = flatTokens.slice(
            i + 1,
            endIndex !== -1 ? endIndex + 1 : boundaryIndex,
        );
        if (endIndex === -1) {
            nestedChildren.push(
                createSerializedUSFMTextNode({
                    text: `\\${marker}*`,
                    id: guidGenerator(),
                    sid: node.sid ?? "",
                    tokenType: UsfmTokenTypes.endMarker,
                    marker,
                    inPara: node.inPara,
                    inChars: node.inChars,
                }),
            );
        }

        const paragraph: SerializedElementNode = {
            type: "paragraph",
            version: 1,
            direction,
            format: "",
            indent: 0,
            children: nestedChildren,
        };

        const nestedNode: USFMNestedEditorNodeJSON = {
            type: USFM_NESTED_DECORATOR_TYPE,
            id: node.id ?? guidGenerator(),
            version: 1,
            text: node.text ?? `\\${marker} `,
            marker,
            sid: node.sid ?? undefined,
            tokenType: node.tokenType ?? UsfmTokenTypes.marker,
            inPara: node.inPara ?? undefined,
            inChars: node.inChars ?? undefined,
            attributes:
                (node as unknown as { attributes?: Record<string, string> })
                    .attributes ?? {},
            lintErrors: [],
            editorState: {
                root: {
                    children: [paragraph],
                    direction,
                    format: "",
                    indent: 0,
                    type: "root",
                    version: 1,
                },
            },
        };

        out.push(nestedNode);
        i =
            endIndex !== -1
                ? endIndex
                : // We consumed everything up to (but not including) the boundary token.
                  boundaryIndex - 1;
    }

    return out;
}

/**
 * Transform chapter state to a different editor mode
 */
export function transformToMode(
    state: SerializedEditorState,
    targetMode: ContentEditorModeSetting,
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
        const withNested = rewrapNestedEditorNodesFromFlatTokens(
            flatTokens,
            direction,
        );
        return {
            ...state,
            root: {
                ...state.root,
                children: groupFlatNodesIntoParagraphContainers(
                    withNested,
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
