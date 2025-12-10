import { $dfsIterator } from "@lexical/utils";
import {
    $isLineBreakNode,
    type EditorState,
    type LexicalEditor,
} from "lexical";
import {
    EDITOR_TAGS_USED,
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import type {
    DocStructureFxnArgs,
    MainDocumentStrutureFxn,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import {
    $isUSFMNestedEditorNode,
    type USFMNestedEditorNode,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $isLockableUSFMTextNode,
    $isToggleableUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { markerTrimNoSlash, numRangeRe } from "@/core/domain/usfm/lex.ts";
import {
    getMutSidVals,
    LOOKAHEAD_MARKERS,
    type MutSidVals,
} from "@/core/domain/usfm/parseUtils.ts";

// metadata should be able to only run as a node transform since selection change shouldn't
export function maintainDocumentMetaData(
    editorState: EditorState,
    editor: LexicalEditor,
    bookCode: string,
) {
    const updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        update: () => void;
    }> = [];
    const sidArgs = {
        ...getMutSidVals(bookCode),
        // no id
        mutCurVerse: { val: "0" } as { val: string | null },
        nodeIdsCalculated: new Set<string>(),
        bookCode,
    };
    editorState.read(() => {
        const allNodes = [...$dfsIterator()];
        for (const dfsNode of allNodes) {
            const node = dfsNode.node;
            //   can check other node types above if we want
            if (!$isUSFMTextNode(node)) continue;
            const tokenType = node.getTokenType();
            const args = {
                node,
                tokenType,
                updates,
            };
            adjustSidsAsNeededOnTextTokens(args, sidArgs);
            maintainInPara(args);
            monitorMutabilityAndVisibility(args);
        }
    });

    if (updates.length) {
        editor.update(
            () => {
                updates.forEach((update) => {
                    update.update();
                });
            },
            {
                tag: [
                    EDITOR_TAGS_USED.historyMerge,
                    EDITOR_TAGS_USED.programaticIgnore,
                ],
            },
        );
    }
    //   console.timeEnd("maintainDocumentMetaData");
}

function adjustSidsAsNeededOnTextTokens(
    args: DocStructureFxnArgs,
    sidArgs: MutSidVals & {
        nodeIdsCalculated: Set<string>;
        bookCode: string;
    },
) {
    const { node, tokenType, updates } = args;

    if (sidArgs.nodeIdsCalculated.has(node.getId())) return;
    sidArgs.nodeIdsCalculated.add(node.getId());

    // if it's not marker, and not already assigned, assign current sid if different
    if (tokenType !== UsfmTokenTypes.marker && !node.getSid()) {
        const current = node.getSid();
        if (current === sidArgs.mutCurSid.val) return;
        // get the primitive non reference back out since we are passing to a closure, else if reading the value in the closure it will be whatever latest of shared mut var is
        const val = sidArgs.mutCurSid.val;
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            dbgDetail: `Id: ${node.getId()} Current sid: ${node.getSid()} Expected sid: ${val}`,
            update: () => {
                node.setSid(val);
            },
        });
        return;
    }
    const isChapterMarker =
        tokenType === UsfmTokenTypes.marker && node.getMarker() === "c";
    if (isChapterMarker) {
        // no ws in lexical editor as special token, so nextSib should be num:
        const nextSib = node.getNextSibling();
        if (!$isUSFMTextNode(nextSib)) return;
        if (nextSib.getTokenType() !== UsfmTokenTypes.numberRange) return;
        const nextSibText = nextSib.getTextContent().trim();
        const nextSibNumRange = parseSid(`${sidArgs.bookCode} ${nextSibText}`);
        if (!nextSibNumRange) return;
        sidArgs.mutCurChap.val = String(nextSibNumRange.chapter);
        sidArgs.mutCurVerse.val = "0";
        const parsedNumRange = parseSid(
            `${sidArgs.bookCode} ${sidArgs.mutCurChap.val}:${sidArgs.mutCurVerse.val}`,
        );
        if (!parsedNumRange) return;
        sidArgs.mutCurSid.val = parsedNumRange.toSidString();
        if (sidArgs.mutCurSid.val.trim() === node.getSid().trim()) return;
        // get the primitive non reference back out since we are passing to a closure, else if reading the value in the closure it will be whatever latest of shared mut var is
        const val = sidArgs.mutCurSid.val;
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            dbgDetail: `Id: ${node.getId()} Current sid: ${node.getSid()} Expected sid: ${val}`,
            update: () => {
                node.setSid(val);
            },
        });
        return;
    }
    const isVerseMarker =
        tokenType === UsfmTokenTypes.marker && node.getMarker() === "v";
    if (isVerseMarker) {
        // no special ws in eidotr so next should be numRange
        const nextSib = node.getNextSibling();
        if (!$isUSFMTextNode(nextSib)) return;
        if (nextSib.getTokenType() !== UsfmTokenTypes.numberRange) return;
        const nextSibText = nextSib.getTextContent().trim();
        const nextSibNumRange = parseSid(
            `${sidArgs.bookCode} ${sidArgs.mutCurChap.val}:${nextSibText}`,
        );
        if (!nextSibNumRange) return;
        sidArgs.mutCurVerse.val = String(nextSibNumRange.verseStart);
        sidArgs.mutCurSid.val = nextSibNumRange.toSidString();
        if (sidArgs.mutCurSid.val.trim() === node.getSid().trim()) return;
        // get the primitive non reference back out since we are passing to a closure, else if reading the value in the closure it will be whatever latest of shared mut var is
        const val = sidArgs.mutCurSid.val;
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            dbgDetail: `Id: ${node.getId()} Current sid: ${node.getSid()} Expected sid: ${val}`,
            update: () => {
                node.setSid(val);
            },
        });
        return;
    }
    // most markers and tokens read sid backwards, so if not a look ahead marker, assign current sid
    if (!LOOKAHEAD_MARKERS.has(node.getMarker() ?? "")) {
        const current = node.getSid().trim();
        if (current === sidArgs.mutCurSid.val) return;
        // get the primitive non reference back out since we are passing to a closure, else if reading the value in the closure it will be whatever latest of shared mut var is
        const val = sidArgs.mutCurSid.val;
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            dbgDetail: `Id: ${node.getId()} Current sid: ${node.getSid()} Expected sid: ${val}`,
            update: () => {
                node.setSid(val);
            },
        });
        return;
    }

    // if we get here, we have a look ahead marker, so we need to walk forward until we hit a boundary condition
    $assignSidsUntilBoundaryConditionForLexical(args, sidArgs);
}

const maintainInPara: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    //   a marker should have the same inPara as it's prev sibling until
    // \p \v 1 text \v 2 more \q differrent:
    // a node (such as word 'different') should have inPara of prevNode.marker since prevNode is a marker. else, it should have inPara of prevNode.inPara; a marker itself has an InPara of it's own marker;
    if (tokenType === UsfmTokenTypes.marker) {
        const candidateMarker = markerTrimNoSlash(node.getTextContent());
        const marker = node.getMarker();
        if (!marker) return;
        if (marker !== candidateMarker) {
            updates.push({
                dbgLabel: "maintainInPara",
                update: () => {
                    node.setMarker(candidateMarker);
                },
            });
        }
        const currentInPara = node.getInPara();
        if (currentInPara === marker) return;
        if (!isValidParaMarker(marker)) return;
        updates.push({
            dbgLabel: "maintainInPara",
            update: () => {
                node.setInPara(marker);
            },
        });
    } else {
        const currentInPara = node.getInPara();
        const prevNode = node.getPreviousSibling();
        if (!$isUSFMTextNode(prevNode)) return;
        const prevInPara = prevNode.getInPara();
        if (currentInPara === prevInPara) return;
        updates.push({
            dbgLabel: "maintainInPara",
            update: () => {
                node.setInPara(prevInPara);
            },
        });
    }
};

const monitorMutabilityAndVisibility: MainDocumentStrutureFxn = ({
    node,
    updates,
}) => {
    const rootDomEl = document.getElementById("root");
    if (!rootDomEl) return;
    const isMutable = node.getMutable();
    const isVisible = node.getShow();
    const viewState = rootDomEl?.dataset.markerViewState;
    const mutabilityState = rootDomEl?.dataset.markersMutableState;
    if (mutabilityState === EditorMarkersMutableStates.MUTABLE) {
        if (!isMutable && $isLockableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                update: () => {
                    node.setMutable(true);
                },
            });
        }
    } else if (mutabilityState === EditorMarkersMutableStates.IMMUTABLE) {
        if (isMutable && $isLockableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                update: () => {
                    node.setMutable(false);
                },
            });
        }
    }

    if (viewState === EditorMarkersViewStates.NEVER) {
        if (isVisible && $isToggleableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                update: () => {
                    node.setShow(false);
                },
            });
        }
    }
    if (viewState === EditorMarkersViewStates.ALWAYS) {
        if (!isVisible && $isToggleableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                update: () => {
                    node.setShow(true);
                },
            });
        }
    }
};

// util
function $assignSidsUntilBoundaryConditionForLexical(
    args: Parameters<typeof adjustSidsAsNeededOnTextTokens>[0],
    sidArgs: Parameters<typeof adjustSidsAsNeededOnTextTokens>[1],
) {
    const { node, tokenType, updates } = args;
    // just to be sure
    if (tokenType !== UsfmTokenTypes.marker) return;
    const collectedTokens: Array<USFMTextNode | USFMNestedEditorNode> = [node];
    // no loop index, so just while on the nextSibling until breaking boundary conditons;
    let nextSibling = node.getNextSibling();
    while (nextSibling) {
        // don't push to collectedSids cause we don't want to assign sids to linebreaks, but don't break on them either
        if ($isLineBreakNode(nextSibling)) {
            nextSibling = nextSibling.getNextSibling();
            continue;
        }
        if (
            !$isUSFMTextNode(nextSibling) &&
            !$isUSFMNestedEditorNode(nextSibling)
        )
            break;
        collectedTokens.push(nextSibling);
        const nextTokenMarker = nextSibling.getMarker();
        // never read past chapter, which should be impossible in a chapter in lexical, but for consistency
        if (nextTokenMarker === "c") break;

        // don't read past plain text
        if (
            nextSibling.getTokenType() === UsfmTokenTypes.text &&
            !nextSibling.getTextContent().trim().length
        ) {
            break;
        }

        // don't read past markers that don't read forward such as a \cl, which semantically makes sense to read back towards what's likely a nearest c
        if (
            nextSibling.getTokenType() === UsfmTokenTypes.marker &&
            !LOOKAHEAD_MARKERS.has(nextTokenMarker ?? "")
        ) {
            break;
        }

        // if we read past a v marker, break after checking the next token to ensure it's a number range
        if (nextTokenMarker === "v") {
            const candidateNumRangeToken = nextSibling.getNextSibling();
            if (!$isUSFMTextNode(candidateNumRangeToken)) break;
            if (
                candidateNumRangeToken.getTokenType() !==
                UsfmTokenTypes.numberRange
            )
                break;
            const candidateNumRangeText = candidateNumRangeToken
                .getTextContent()
                .trim();
            if (
                !candidateNumRangeText ||
                !numRangeRe.test(candidateNumRangeText)
            )
                break;
            // if we get here, it's a v marker + valid num range, so we know their sid can be added to the forwarded walk
            collectedTokens.push(candidateNumRangeToken);
            sidArgs.mutCurVerse.val = candidateNumRangeText;
            const possibleNewSid = parseSid(
                `${sidArgs.bookCode} ${sidArgs.mutCurChap.val}:${sidArgs.mutCurVerse.val}`,
            );
            if (!possibleNewSid) break;
            sidArgs.mutCurSid.val = possibleNewSid.toSidString();
            // no further processing after handling v
            break;
        }
        // continue while loop til break
        collectedTokens.push(nextSibling);
        nextSibling = nextSibling.getNextSibling();
    }
    if (collectedTokens.length === 0) return;
    collectedTokens.forEach((token) => {
        sidArgs.nodeIdsCalculated.add(token.getId());
        const current = token.getSid();
        if (current === sidArgs.mutCurSid.val) return;
        // get the primitive non reference back out since we are passing to a closure, else if reading the value in the closure it will be whatever latest of shared mut var is
        const val = sidArgs.mutCurSid.val;
        updates.push({
            dbgLabel: "assignSidsUntilBoundaryConditionForLexical",
            dbgDetail: `Id: ${token.getId()} Current sid: ${token.getSid()} Expected sid: ${val}`,
            update: () => {
                token.setSid(val);
            },
        });
    });
}
