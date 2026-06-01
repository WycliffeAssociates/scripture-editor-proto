import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import {
    type ContentEditorModeSetting,
    EDITOR_MODES,
    EDITOR_SHAPES,
    type EditorShape,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import { isSectionMarker } from "@/app/domain/editor/markerTaxonomy.ts";
import {
    createSerializedBookFrontmatterFormNode,
    isSerializedBookFrontmatterFormNode,
} from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import {
    createSerializedFormBlockNode,
    isSerializedFormBlockNode,
} from "@/app/domain/editor/nodes/FormBlockNode.tsx";
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
import { buildFormBlockTree } from "@/app/domain/editor/utils/formModeBlockTree.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    isDocumentMarker,
    isValidParaMarker,
} from "@/core/domain/usfm/onionMarkers.ts";

// Re-export shared utilities from their canonical locations
export { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

/**
 * Detect the serialized shape used by source/plain mode.
 *
 * Those modes keep the root wrapped in a single generic Lexical paragraph so
 * the editor behaves like a flat text surface. Regular mode, by contrast, uses
 * USFM paragraph containers and nested editor nodes.
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
 * Rewrap flat tokens into the generic paragraph shell expected by
 * source/plain mode.
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
function rewrapNestedEditorNodesFromFlatTokens(
    flatTokens: SerializedLexicalNode[],
    direction: LanguageDirection,
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
 * Rematerialize one serialized chapter state for a different editor mode.
 *
 * Mode switches do not reparse scripture from disk. They reinterpret the
 * already-loaded token/serialized structure into the presentation needed by the
 * next mode, including rebuilding nested note nodes when moving back toward
 * regular mode.
 */
export function transformToMode(
    state: SerializedEditorState,
    targetMode: ContentEditorModeSetting,
): SerializedEditorState {
    const direction = state.root.direction ?? LanguageDirection.LTR;
    const rootChildren = state.root.children as SerializedLexicalNode[];

    const currentShape = detectCurrentShape(rootChildren);
    const targetShape = targetShapeForMode(targetMode);

    // Chapter 0 (book frontmatter) renders the same dedicated form on
    // both Regular and Form modes — we never want to break out the
    // identifiers / titles into either regular paragraphs or
    // discourse-style FormBlockNodes. If the current state is already
    // a single BookFrontmatterFormNode and the target is one of the
    // editable modes that share that shape, short-circuit before
    // `currentShape === targetShape` would mis-classify it as a flat
    // shape that needs reflowing.
    const isAlreadyFrontmatter =
        rootChildren.length === 1 &&
        isSerializedBookFrontmatterFormNode(rootChildren[0]);
    if (
        isAlreadyFrontmatter &&
        (targetShape === "regular" || targetShape === "form")
    ) {
        return state;
    }

    if (currentShape === targetShape) {
        return state;
    }

    // Always reduce to a flat token list first, then rebuild for the target shape.
    const flatTokens = flattenToTokens(rootChildren);

    // Frontmatter detection runs before the form/regular split so
    // both paths produce the BookFrontmatterFormNode shape.
    // Otherwise the form-mode branch below would parse `\id`, `\h`,
    // `\toc*`, `\mt*` markers into ordinary paragraph blocks and the
    // user would lose the dedicated frontmatter UI.
    if (
        (targetShape === EDITOR_SHAPES.form ||
            targetShape === EDITOR_SHAPES.regular) &&
        shouldRenderAsBookFrontmatterForm(flatTokens)
    ) {
        return {
            ...state,
            root: {
                ...state.root,
                children: [
                    createSerializedBookFrontmatterFormNode({
                        direction,
                        tokens: flatTokens,
                    }),
                ],
            },
        };
    }

    if (targetShape === "form") {
        // Discourse-first: each paragraph-class marker becomes a top-level
        // FormBlockNode. Verse markers are fragments inside their block, not
        // top-level containers — so a `\p` containing two verses is one block,
        // and a verse spanning many paragraph markers spans many blocks.
        const blocks = buildFormBlockTree(flatTokens);
        const children: SerializedLexicalNode[] = blocks.map((block) =>
            createSerializedFormBlockNode({
                direction,
                tokens: block.tokens,
                id: block.id,
            }),
        );
        return {
            ...state,
            root: { ...state.root, children },
        };
    }

    if (targetShape === "regular") {
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
    }

    // targetShape === "flat" — wrap in a single Lexical paragraph for usfm/plain.
    return {
        ...state,
        root: {
            ...state.root,
            children: [wrapFlatTokensInLexicalParagraph(flatTokens, direction)],
        },
    };
}

function detectCurrentShape(
    rootChildren: SerializedLexicalNode[],
): EditorShape {
    if (isFormModeRootChildren(rootChildren)) return "form";
    if (isRegularModeRootChildren(rootChildren)) return "regular";
    return "flat";
}

function targetShapeForMode(mode: ContentEditorModeSetting): EditorShape {
    if (mode === EDITOR_MODES.form) return "form";
    if (mode === EDITOR_MODES.regular) return "regular";
    return "flat";
}

function flattenToTokens(
    rootChildren: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    const unwrapped = unwrapFlatTokensFromRootChildren(rootChildren);
    return (
        unwrapped ??
        materializeFlatTokensArray(rootChildren, { nested: "flatten" })
    );
}

export function isFormModeRootChildren(
    rootChildren: SerializedLexicalNode[],
): boolean {
    return rootChildren.some((child) => isSerializedFormBlockNode(child));
}

export function isRegularModeRootChildren(
    rootChildren: SerializedLexicalNode[],
): boolean {
    return rootChildren.some(
        (child) =>
            child.type === "usfm-paragraph-node" ||
            isSerializedBookFrontmatterFormNode(child),
    );
}

function shouldRenderAsBookFrontmatterForm(
    flatTokens: SerializedLexicalNode[],
): boolean {
    const visibleTokens = flatTokens.filter(
        (node) => node.type !== "linebreak",
    );
    if (visibleTokens.length === 0) return false;

    let sawChapterZeroSid = false;

    for (const node of visibleTokens) {
        if (!isSerializedUSFMTextNode(node)) return false;
        const parsed = parseSid(node.sid ?? "");
        if (!parsed) continue;
        if (parsed.chapter !== 0) return false;
        sawChapterZeroSid = true;
    }

    return sawChapterZeroSid;
}
