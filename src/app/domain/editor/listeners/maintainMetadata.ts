import { $dfs, $dfsIterator, $reverseDfsIterator } from "@lexical/utils";
import {
    $getRoot,
    $setState,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor";
import type { MainDocumentStrutureFxn } from "@/app/domain/editor/listeners/maintainDocumentStructure";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import { sidState } from "@/app/domain/editor/states";
import { parseSid } from "@/core/data/bible/bible";

// metadata should be able to only run as a node transform since selection change shouldn't
export function maintainDocumentMetaData(
    //   editorState: EditorState,
    //   editor: LexicalEditor
    node: USFMTextNode,
    editor: LexicalEditor,
) {
    const updates: Array<{
        dbgLabel: string;
        update: () => void;
    }> = [];
    //   console.time("maintainDocumentMetaData");
    const tokenType = node.getTokenType();
    const args = {
        node,
        tokenType,
        updates,
    };
    adjustSidsAsNeededOnTextTokens(args);
    maintainInPara(args);
    //   editorState.read(() => {
    //     const root = $getRoot();
    //     root.getAllTextNodes().forEach((node) => {
    //       if (!$isUSFMTextNode(node)) return;
    //       const tokenType = node.getTokenType();
    //       const args = {
    //         node,
    //         tokenType,
    //         updates,
    //       };
    //       adjustSidsAsNeededOnTextTokens(args);
    //       maintainInPara(args);
    //     });
    //   });

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

const adjustSidsAsNeededOnTextTokens: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    const root = $getRoot();
    const last = root.getLastChild();
    if (!last) return;
    if (tokenType === UsfmTokenTypes.numberRange) {
        // recalc and change everything until next numberRange
        const curSid = node.getSid().trim();
        const pendingSid = node.getTextContent().trim();
        const currentSidGroup = parseSid(curSid);
        if (!currentSidGroup) return;
        // const [_whole, bookCode, chapter, numberRange] = currentSidGroup;
        const {
            book,
            chapter,
            verseStart,
            verseEnd: _verseEnd,
        } = currentSidGroup;
        if (!book || !chapter || !verseStart) return;
        const newSid = `${book} ${chapter}:${pendingSid}`;
        if (newSid === curSid) return;
        const nextVerseRangeNode = findNextVerseRangeNode(node, last);
        const prevMarker = node.getPreviousSibling();
        if (
            $isUSFMTextNode(prevMarker) &&
            prevMarker.getTokenType() === UsfmTokenTypes.marker
        ) {
            const update = () => {
                prevMarker.setSid(newSid);
            };
            updates.push({
                dbgLabel: "adjustSidsAsNeededOnTextTokens",
                update,
            });
        }
        if (!nextVerseRangeNode) return;

        const textNodesInBetween = $dfs(node, nextVerseRangeNode);
        // set the numberRange node sid and all in between
        nextVerseRangeNode.setSid(newSid);
        for (const textNode of textNodesInBetween) {
            if (
                $isUSFMTextNode(textNode.node) &&
                textNode.node.getSid().trim() !== newSid
            ) {
                const n = textNode.node; //satisfy t
                updates.push({
                    dbgLabel: "adjustSidsAsNeededOnTextTokens",
                    update: () => {
                        n.setSid(newSid);
                    },
                });
            } else {
                updates.push({
                    dbgLabel: "adjustSidsAsNeededOnTextTokens",
                    update: () => {
                        $setState(textNode.node, sidState, newSid);
                    },
                });
            }
        }
    }
    if (tokenType === UsfmTokenTypes.text) {
        // make sure this node token type matches nearest previous numberRange (trimmed)
        let prevVerseRange: USFMTextNode | null = null;
        for (const prevNode of $reverseDfsIterator(node, root)) {
            if (
                $isUSFMTextNode(prevNode.node) &&
                prevNode.node.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                prevVerseRange = prevNode.node;
                break;
            }
        }
        if (!prevVerseRange) return;
        // sid not text content, due to that sid should be updated when that node is updated
        const prevVerseRangeSid = prevVerseRange.getSid().trim();
        const curSid = node.getSid().trim();
        if (curSid === prevVerseRangeSid) return;
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            update: () => {
                node.setSid(prevVerseRangeSid);
            },
        });
    }
};

const maintainInPara: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    //   a marker should have the same inPara as it's prev sibling until
    // \p \v 1 text \v 2 more \q differrent:
    // a node (such as word 'different') should have inPara of prevNode.marker since prevNode is a marker. else, it should have inPara of prevNode.inPara; a marker itself has an InPara of it's own marker;
    if (tokenType === UsfmTokenTypes.marker) {
        const currentInPara = node.getInPara();
        const marker = node.getMarker();
        if (!marker) return;
        if (currentInPara === marker) return;
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

// util
function findNextVerseRangeNode(
    node: USFMTextNode,
    lastNode: LexicalNode,
): USFMTextNode | null {
    let next: USFMTextNode | null = null;
    for (const nextNode of $dfsIterator(node, lastNode)) {
        if (
            $isUSFMTextNode(nextNode.node) &&
            nextNode.node.getTokenType() === UsfmTokenTypes.numberRange &&
            nextNode.node.getKey() !== node.getKey()
        ) {
            next = nextNode.node;
            break;
        }
    }
    return next;
}
