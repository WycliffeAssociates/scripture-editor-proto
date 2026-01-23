import { $dfsIterator } from "@lexical/utils";
import type { EditorState, LexicalEditor } from "lexical";
import {
    EDITOR_TAGS_USED,
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import type { DocStructureFxnArgs } from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import {
    $isLockableUSFMTextNode,
    $isToggleableUSFMTextNode,
    $isUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { markerTrimNoSlash, numRangeRe } from "@/core/domain/usfm/lex.ts";
import {
    getMutSidVals,
    type MutSidVals,
} from "@/core/domain/usfm/parseUtils.ts";

export function maintainDocumentMetaData(
    editorState: EditorState,
    editor: LexicalEditor,
    bookCode: string,
    appSettings: Settings,
) {
    const updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        run: () => void;
    }> = [];
    const sidArgs = {
        ...getMutSidVals(bookCode),
        // no id
        mutCurVerse: { val: "0" } as { val: string | null },
        bookCode,
        mutLastPara: { val: null } as { val: string | null },
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
                appSettings,
                updates,
            };
            adjustSidsAsNeededOnTextTokens(args, sidArgs);
            maintainInPara(args, sidArgs);
            monitorMutabilityAndVisibility(args);
        }
    });

    if (updates.length) {
        editor.update(
            () => {
                for (const u of updates) {
                    u.run();
                }
            },
            {
                tag: [
                    EDITOR_TAGS_USED.historyMerge,
                    EDITOR_TAGS_USED.programaticIgnore,
                ],
            },
        );
    }
}

function adjustSidsAsNeededOnTextTokens(
    args: DocStructureFxnArgs,
    sidArgs: MutSidVals & {
        bookCode: string;
    },
) {
    const { node, tokenType, updates } = args;

    // 1. Check if state needs updating based on current node
    if (tokenType === UsfmTokenTypes.marker) {
        const marker = node.getMarker();
        if (marker === "c") {
            // Chapter marker: look ahead for number
            const nextSib = node.getNextSibling();
            if (
                $isUSFMTextNode(nextSib) &&
                nextSib.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                const num = nextSib.getTextContent().trim();
                const isValid = /^\d+/.test(num);
                if (isValid) {
                    sidArgs.mutCurChap.val = num;
                    sidArgs.mutCurVerse.val = "0"; // reset verse
                    const newSid = parseSid(
                        `${sidArgs.bookCode} ${sidArgs.mutCurChap.val}:${sidArgs.mutCurVerse.val}`,
                    );
                    if (newSid) {
                        sidArgs.mutCurSid.val = newSid.toSidString();
                    }
                }
            }
        } else if (marker === "v") {
            // Verse marker: look ahead for number
            const nextSib = node.getNextSibling();
            if (
                $isUSFMTextNode(nextSib) &&
                nextSib.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                const num = nextSib.getTextContent().trim();
                const isValid = numRangeRe.test(num);
                if (isValid) {
                    sidArgs.mutCurVerse.val = num;
                    const newSid = parseSid(
                        `${sidArgs.bookCode} ${sidArgs.mutCurChap.val}:${sidArgs.mutCurVerse.val}`,
                    );
                    if (newSid) {
                        sidArgs.mutCurSid.val = newSid.toSidString();
                    }
                }
            }
        }
    }

    // 2. Apply current state to node
    // Every node gets the current SID
    const currentSid = node.getSid();
    const targetSid = sidArgs.mutCurSid.val;

    if (currentSid !== targetSid) {
        updates.push({
            dbgLabel: "adjustSidsAsNeededOnTextTokens",
            dbgDetail: `Id: ${node.getId()} Current sid: ${currentSid} Expected sid: ${targetSid}`,
            run: () => {
                node.setSid(targetSid);
            },
        });
    }
}

function maintainInPara(
    { node, tokenType, updates }: DocStructureFxnArgs,
    state: { mutLastPara: { val: string | null } },
) {
    let currentMarker: string | undefined;

    // 1. Marker Maintenance (Fixing/Reading)
    if (tokenType === UsfmTokenTypes.marker) {
        const rawText = node.getTextContent();
        const candidateMarker = markerTrimNoSlash(rawText);
        // marker's can't contain spaces, so only use whatever comes before a space if there is one
        const markerWithoutSpace = candidateMarker.split(" ")[0];
        const storedMarker = node.getMarker();

        if (storedMarker && storedMarker !== markerWithoutSpace) {
            updates.push({
                dbgLabel: "maintainInPara",
                run: () => {
                    node.setMarker(markerWithoutSpace);
                },
            });
        }
        currentMarker = markerWithoutSpace || storedMarker;
    }

    // 2. Update State (Forward Propagation)
    if (currentMarker && isValidParaMarker(currentMarker)) {
        state.mutLastPara.val = currentMarker;
    }

    // 3. Apply State to Node
    // Default to empty string if no para marker seen yet (e.g. start of file)
    const targetInPara = state.mutLastPara.val || "";
    const currentInPara = node.getInPara();

    if (currentInPara !== targetInPara) {
        updates.push({
            dbgLabel: "maintainInPara",
            run: () => {
                node.setInPara(targetInPara);
            },
        });
    }
}

function monitorMutabilityAndVisibility({
    node,
    updates,
    appSettings,
}: DocStructureFxnArgs) {
    const isMutable = node.getMutable();
    const isVisible = node.getShow();
    const {
        markersViewState: viewState,
        markersMutableState: mutabilityState,
    } = appSettings;

    if (mutabilityState === EditorMarkersMutableStates.MUTABLE) {
        if (!isMutable && $isLockableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                run: () => {
                    node.setMutable(true);
                },
            });
        }
    } else if (mutabilityState === EditorMarkersMutableStates.IMMUTABLE) {
        if (isMutable && $isLockableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                run: () => {
                    node.setMutable(false);
                },
            });
        }
    }

    if (viewState === EditorMarkersViewStates.NEVER) {
        if (isVisible && $isToggleableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                run: () => {
                    node.setShow(false);
                },
            });
        }
    }
    if (viewState === EditorMarkersViewStates.ALWAYS) {
        if (!isVisible && $isToggleableUSFMTextNode(node)) {
            updates.push({
                dbgLabel: "monitorMutabilityAndVisibility",
                run: () => {
                    node.setShow(true);
                },
            });
        }
    }
}
