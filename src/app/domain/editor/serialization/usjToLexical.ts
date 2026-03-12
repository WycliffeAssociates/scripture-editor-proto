import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    USFM_NESTED_DECORATOR_TYPE,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    createSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    groupFlatNodesIntoParagraphContainers,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import type {
    DocumentTreeDocument,
    DocumentTreeElement,
    DocumentTreeNode,
    FlatToken,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

type ChapterNodeMap = Record<number, SerializedLexicalNode[]>;

type DocumentTreeBuilderState = {
    nextId: number;
    bookCode: string;
    currentChapter: number;
    currentSid: string;
    currentPara: string | null;
    charStack: string[];
    chapters: ChapterNodeMap;
    direction: "ltr" | "rtl";
    nestedNotes: "decorator" | "flat";
};

const NOTE_STRUCTURAL_MARKERS = new Set([
    "fr",
    "ft",
    "fk",
    "fq",
    "fqa",
    "fl",
    "fw",
    "fp",
    "fv",
    "fdc",
    "xop",
    "xot",
    "xnt",
    "xdc",
    "xo",
    "xt",
    "xta",
    "xk",
    "xq",
]);

function makeId(state: DocumentTreeBuilderState): string {
    const id = String(state.nextId);
    state.nextId += 1;
    return id;
}

function currentChapterNodes(
    state: DocumentTreeBuilderState,
): SerializedLexicalNode[] {
    state.chapters[state.currentChapter] ??= [];
    return state.chapters[state.currentChapter];
}

function pushNode(
    state: DocumentTreeBuilderState,
    node: SerializedLexicalNode,
    target?: SerializedLexicalNode[],
) {
    (target ?? currentChapterNodes(state)).push(node);
}

function makeTextNode(
    state: DocumentTreeBuilderState,
    text: string,
    tokenType: string,
    opts: {
        marker?: string;
        sid?: string;
        inPara?: string;
        inChars?: string[];
    } = {},
): SerializedUSFMTextNode {
    return createSerializedUSFMTextNode({
        text,
        id: makeId(state),
        sid: opts.sid ?? state.currentSid,
        tokenType,
        marker: opts.marker,
        inPara: opts.inPara ?? state.currentPara ?? undefined,
        inChars:
            opts.inChars ??
            (state.charStack.length ? [...state.charStack] : undefined),
    });
}

function pushTextNode(
    state: DocumentTreeBuilderState,
    text: string,
    tokenType: string,
    target?: SerializedLexicalNode[],
    opts: {
        marker?: string;
        sid?: string;
        inPara?: string;
        inChars?: string[];
    } = {},
) {
    pushNode(state, makeTextNode(state, text, tokenType, opts), target);
}

function pushLineBreak(
    state: DocumentTreeBuilderState,
    target?: SerializedLexicalNode[],
) {
    pushNode(
        state,
        { type: "linebreak", version: 1 } as SerializedLexicalNode,
        target,
    );
}

function markerText(marker: string): string {
    return `\\${marker}`;
}

function markerTextFromNode(node: DocumentTreeElement): string {
    if (typeof (node as Record<string, unknown>).markerText === "string") {
        return String((node as Record<string, unknown>).markerText);
    }
    if (node.type === "note") {
        const caller = typeof node.caller === "string" ? node.caller : "";
        return caller ? `\\${node.marker} ` : `\\${node.marker}`;
    }
    const marker = markerFromElement(node);
    return marker ? markerText(marker) : "";
}

function closeMarkerTextFromNode(node: DocumentTreeElement): string | null {
    if (typeof (node as Record<string, unknown>).closeMarkerText === "string") {
        return String((node as Record<string, unknown>).closeMarkerText);
    }
    const marker = markerFromElement(node);
    return marker ? `${markerText(marker)}*` : null;
}

function markerFromElement(element: DocumentTreeElement): string | null {
    if ("marker" in element && typeof element.marker === "string") {
        return element.marker;
    }
    if (element.type === "periph") return "periph";
    if (element.type === "ref") return "ref";
    return null;
}

function chapterFromSid(
    sid: string | null | undefined,
    fallback: number,
): number {
    if (!sid) return fallback;
    const parts = sid.split(/\s+/, 2);
    if (parts.length < 2) return fallback;
    const chapterPart = parts[1]?.split(":")[0] ?? "";
    return Number.parseInt(chapterPart, 10) || fallback;
}

export function groupFlatTokensByChapter(
    tokens: FlatToken[],
): Record<number, FlatToken[]> {
    const chapters: Record<number, FlatToken[]> = {};
    let currentChapter = 0;

    for (const token of tokens) {
        if (token.marker === "c" && token.kind === "marker") {
            const nextChapter = Number.parseInt(
                tokens.find(
                    (candidate) =>
                        candidate.span.start >= token.span.end &&
                        candidate.kind === "number",
                )?.text ?? "",
                10,
            );
            if (Number.isFinite(nextChapter) && nextChapter > 0) {
                currentChapter = nextChapter;
            } else {
                currentChapter = chapterFromSid(token.sid, currentChapter);
            }
        } else {
            currentChapter = chapterFromSid(token.sid, currentChapter);
        }

        chapters[currentChapter] ??= [];
        chapters[currentChapter].push(token);
    }

    return chapters;
}

function flatTokenKindToLexicalTokenType(kind: string): string {
    switch (kind) {
        case "marker":
        case "milestone":
            return UsfmTokenTypes.marker;
        case "endMarker":
        case "milestoneEnd":
            return UsfmTokenTypes.endMarker;
        case "verticalWhitespace":
            return UsfmTokenTypes.verticalWhitespace;
        case "number":
            return UsfmTokenTypes.numberRange;
        default:
            return kind;
    }
}

export function flatTokensToLoadedLexicalStatesByChapter(
    tokens: FlatToken[],
    direction: "ltr" | "rtl",
): Record<number, SerializedEditorState<SerializedLexicalNode>> {
    const chapters = groupFlatTokensByChapter(tokens);
    return Object.fromEntries(
        Object.entries(chapters).map(([chapterNum, chapterTokens]) => {
            const nodes = chapterTokens.flatMap((token) => {
                if (token.kind === "verticalWhitespace") {
                    return [
                        {
                            type: "linebreak",
                            version: 1,
                        } as SerializedLexicalNode,
                    ];
                }

                return [
                    createSerializedUSFMTextNode({
                        text: token.text,
                        id: token.id,
                        sid: token.sid ?? "",
                        tokenType: flatTokenKindToLexicalTokenType(token.kind),
                        marker: token.marker ?? undefined,
                    }) as SerializedLexicalNode,
                ];
            });

            return [
                Number(chapterNum),
                {
                    root: {
                        children: [
                            wrapFlatTokensInLexicalParagraph(nodes, direction),
                        ],
                        type: "root",
                        version: 1,
                        direction,
                        format: "start",
                        indent: 0,
                    },
                } satisfies SerializedEditorState<SerializedLexicalNode>,
            ];
        }),
    );
}

function makeNestedNoteNode(
    state: DocumentTreeBuilderState,
    note: Extract<DocumentTreeElement, { type: "note" }>,
): USFMNestedEditorNodeJSON {
    const nestedChildren: SerializedLexicalNode[] = [];
    if (note.caller) {
        const callerText =
            note.content?.length && !/\s$/u.test(note.caller)
                ? `${note.caller} `
                : note.caller;
        nestedChildren.push(
            makeTextNode(state, callerText, UsfmTokenTypes.text, {
                inPara: state.currentPara ?? undefined,
            }),
        );
    }

    note.content?.forEach((child) => {
        walkDocumentTreeNode(state, child, nestedChildren);
    });
    const explicitlyClosed = (note as Record<string, unknown>).closed !== false;
    if (explicitlyClosed) {
        nestedChildren.push(
            makeTextNode(state, `\\${note.marker}*`, UsfmTokenTypes.endMarker, {
                marker: note.marker,
                inPara: state.currentPara ?? undefined,
            }),
        );
    }

    return {
        type: USFM_NESTED_DECORATOR_TYPE,
        id: makeId(state),
        version: 1,
        text: `\\${note.marker} `,
        marker: note.marker,
        sid: state.currentSid,
        tokenType: UsfmTokenTypes.marker,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
        attributes: {},
        lintErrors: [],
        editorState: {
            root: {
                children: [
                    wrapFlatTokensInLexicalParagraph(
                        nestedChildren,
                        state.direction,
                    ),
                ],
                direction: state.direction,
                format: "",
                indent: 0,
                type: "root",
                version: 1,
            },
        },
    };
}

function pushFlatNoteTokens(
    state: DocumentTreeBuilderState,
    note: Extract<DocumentTreeElement, { type: "note" }>,
    target?: SerializedLexicalNode[],
) {
    pushTextNode(
        state,
        markerTextFromNode(note),
        UsfmTokenTypes.marker,
        target,
        {
            marker: note.marker,
            inPara: state.currentPara ?? undefined,
        },
    );

    if (note.caller) {
        const callerText =
            note.content?.length && !/\s$/u.test(note.caller)
                ? `${note.caller} `
                : note.caller;
        pushTextNode(state, callerText, UsfmTokenTypes.text, target, {
            inPara: state.currentPara ?? undefined,
        });
    }

    note.content?.forEach((child) => {
        walkDocumentTreeNode(state, child, target);
    });

    const explicitlyClosed = (note as Record<string, unknown>).closed !== false;
    if (explicitlyClosed) {
        pushTextNode(
            state,
            `\\${note.marker}*`,
            UsfmTokenTypes.endMarker,
            target,
            {
                marker: note.marker,
                inPara: state.currentPara ?? undefined,
            },
        );
    }
}

function walkDocumentTreeNode(
    state: DocumentTreeBuilderState,
    node: DocumentTreeNode,
    target?: SerializedLexicalNode[],
) {
    if (typeof node === "string") {
        pushTextNode(state, node, UsfmTokenTypes.text, target);
        return;
    }

    switch (node.type) {
        case "text": {
            pushTextNode(state, node.value, UsfmTokenTypes.text, target);
            return;
        }
        case "book": {
            state.bookCode = node.code;
            state.currentChapter = 0;
            state.currentSid = `${node.code} 0:0`;
            pushTextNode(
                state,
                markerTextFromNode(node),
                UsfmTokenTypes.marker,
                target,
                {
                    marker: node.marker,
                    sid: state.currentSid,
                    inPara: undefined,
                },
            );
            pushTextNode(state, node.code, "bookCode", target, {
                sid: state.currentSid,
                inPara: undefined,
            });
            node.content?.forEach((child) => {
                walkDocumentTreeNode(state, child, target);
            });
            return;
        }
        case "chapter": {
            const nextChapter = Number.parseInt(node.number, 10) || 0;
            state.currentChapter = nextChapter;
            state.currentSid =
                typeof (node as Record<string, unknown>).sid === "string"
                    ? String((node as Record<string, unknown>).sid)
                    : `${state.bookCode} ${nextChapter}:0`;
            pushTextNode(
                state,
                markerTextFromNode(node),
                UsfmTokenTypes.marker,
                target,
                {
                    marker: node.marker,
                    sid: state.currentSid,
                    inPara: undefined,
                },
            );
            pushTextNode(
                state,
                node.number,
                UsfmTokenTypes.numberRange,
                target,
                {
                    sid: state.currentSid,
                    inPara: undefined,
                },
            );
            return;
        }
        case "verse": {
            state.currentSid =
                typeof (node as Record<string, unknown>).sid === "string"
                    ? String((node as Record<string, unknown>).sid)
                    : `${state.bookCode} ${state.currentChapter}:${node.number}`;
            pushTextNode(
                state,
                markerTextFromNode(node),
                UsfmTokenTypes.marker,
                target,
                {
                    marker: node.marker,
                },
            );
            pushTextNode(
                state,
                node.number,
                UsfmTokenTypes.numberRange,
                target,
            );
            return;
        }
        case "para": {
            const previousPara = state.currentPara;
            state.currentPara = node.marker;
            const markerTextValue =
                typeof (node as Record<string, unknown>).markerText === "string"
                    ? String((node as Record<string, unknown>).markerText)
                    : markerText(node.marker);
            pushTextNode(
                state,
                markerTextValue,
                UsfmTokenTypes.marker,
                target,
                {
                    marker: node.marker,
                    inPara: node.marker,
                },
            );
            node.content?.forEach((child) => {
                walkDocumentTreeNode(state, child, target);
            });
            state.currentPara = previousPara;
            return;
        }
        case "char":
        case "ref":
        case "unknown":
        case "unmatched":
        case "figure":
        case "sidebar":
        case "periph":
        case "table":
        case "table:row":
        case "table:cell": {
            const marker = markerFromElement(node);
            if (!marker) {
                node.content?.forEach((child) => {
                    walkDocumentTreeNode(state, child, target);
                });
                return;
            }
            const explicitlyClosed =
                (node as Record<string, unknown>).closed !== false;
            const closeMarkerTextValue = closeMarkerTextFromNode(node);

            pushTextNode(
                state,
                markerTextFromNode(node),
                UsfmTokenTypes.marker,
                target,
                {
                    marker,
                },
            );
            const previousChars = state.charStack;
            if (node.type === "char" || node.type === "ref") {
                state.charStack = [...state.charStack, marker];
            }
            node.content?.forEach((child) => {
                walkDocumentTreeNode(state, child, target);
            });
            if (
                (node.type === "char" || node.type === "ref") &&
                (!NOTE_STRUCTURAL_MARKERS.has(marker) || explicitlyClosed)
            ) {
                pushTextNode(
                    state,
                    closeMarkerTextValue ?? `${markerText(marker)}*`,
                    UsfmTokenTypes.endMarker,
                    target,
                    {
                        marker,
                    },
                );
            }
            state.charStack = previousChars;
            return;
        }
        case "note": {
            if (state.nestedNotes === "decorator") {
                pushNode(state, makeNestedNoteNode(state, node), target);
                return;
            }
            pushFlatNoteTokens(state, node, target);
            return;
        }
        case "ms": {
            pushTextNode(
                state,
                `${markerText(node.marker)} `,
                UsfmTokenTypes.marker,
                target,
                {
                    marker: node.marker,
                },
            );
            return;
        }
        case "optbreak":
        case "linebreak": {
            pushLineBreak(state, target);
            return;
        }
        default: {
            const exhaustive: never = node;
            return exhaustive;
        }
    }
}

function buildFlatLexicalNodesByChapter(
    document: DocumentTreeDocument,
    direction: "ltr" | "rtl",
    nestedNotes: "decorator" | "flat",
): ChapterNodeMap {
    const state: DocumentTreeBuilderState = {
        nextId: 1,
        bookCode: "UNK",
        currentChapter: 0,
        currentSid: "UNK 0:0",
        currentPara: null,
        charStack: [],
        chapters: { 0: [] },
        direction,
        nestedNotes,
    };

    document.content.forEach((node) => {
        walkDocumentTreeNode(state, node);
    });
    return state.chapters;
}

export function editorTreeToLexicalStatesByChapter(args: {
    tree: DocumentTreeDocument;
    direction: "ltr" | "rtl";
    needsParagraphs: boolean;
    loadedTokensByChapter?: Record<
        number,
        SerializedEditorState<SerializedLexicalNode>
    >;
}): Record<
    number,
    {
        lexicalState: SerializedEditorState<SerializedLexicalNode>;
        loadedLexicalState: SerializedEditorState<SerializedLexicalNode>;
    }
> {
    const flatNodesByChapter = buildFlatLexicalNodesByChapter(
        args.tree,
        args.direction,
        args.needsParagraphs ? "decorator" : "flat",
    );
    const chapterNums = new Set<number>([
        ...Object.keys(flatNodesByChapter).map(Number),
        ...Object.keys(args.loadedTokensByChapter ?? {}).map(Number),
    ]);

    const entries = [...chapterNums]
        .sort((a, b) => a - b)
        .map((chapterNum) => {
            const flatNodes = flatNodesByChapter[chapterNum] ?? [];
            const loadedLexicalState = args.loadedTokensByChapter?.[
                chapterNum
            ] ?? {
                root: {
                    children: [
                        wrapFlatTokensInLexicalParagraph(
                            flatNodes,
                            args.direction,
                        ),
                    ],
                    type: "root",
                    version: 1,
                    direction: args.direction,
                    format: "start",
                    indent: 0,
                },
            };

            const lexicalState: SerializedEditorState<SerializedLexicalNode> =
                args.needsParagraphs
                    ? {
                          root: {
                              children: groupFlatNodesIntoParagraphContainers(
                                  flatNodes,
                                  args.direction,
                              ),
                              type: "root",
                              version: 1,
                              direction: args.direction,
                              format: "start",
                              indent: 0,
                          },
                      }
                    : {
                          root: {
                              children: [
                                  wrapFlatTokensInLexicalParagraph(
                                      flatNodes,
                                      args.direction,
                                  ),
                              ],
                              type: "root",
                              version: 1,
                              direction: args.direction,
                              format: "start",
                              indent: 0,
                          },
                      };

            return [
                chapterNum,
                {
                    lexicalState,
                    loadedLexicalState,
                },
            ];
        });

    return Object.fromEntries(entries);
}
