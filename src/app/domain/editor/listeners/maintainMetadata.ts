import { $dfsIterator } from "@lexical/utils";
import type { EditorState, LexicalEditor } from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import {
    $isUSFMParagraphNode,
    type USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { markerTrimNoSlash, numRangeRe } from "@/core/domain/usfm/lex.ts";
import {
    computeSidsReverse,
    type TokenForSidCalculation,
} from "@/core/domain/usfm/parseUtils.ts";

export function maintainDocumentMetaData(
    editorState: EditorState,
    editor: LexicalEditor,
    bookCode: string,
    _appSettings: Settings,
) {
    const updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        run: () => void;
    }> = [];

    editorState.read(() => {
        const allNodes = [...$dfsIterator()].map((n) => n.node);
        //   .filter($isUSFMTextNode);
        const filteredNodes = allNodes.filter($isUSFMTextNode);

        const tokenTypes: string[] = [];
        const texts: string[] = [];
        const derivedMarkers: Array<string | undefined> = [];

        // 1) Normalize markers (based on text) so downstream logic doesn't depend on stale state.
        for (const node of filteredNodes) {
            const tokenType = node.getTokenType();
            const rawText = node.getTextContent();

            let expectedMarker = node.getMarker();
            if (tokenType === UsfmTokenTypes.marker) {
                const candidateMarker = markerTrimNoSlash(rawText);
                expectedMarker =
                    candidateMarker.split(" ")[0] || expectedMarker;
            }

            // Marker updates are handled here, but we still compute with the derived marker immediately.
            const currentMarker = node.getMarker();
            if (expectedMarker && currentMarker !== expectedMarker) {
                updates.push({
                    dbgLabel: "maintainMetadata.marker",
                    run: () => {
                        node.setMarker(expectedMarker);
                    },
                });
            }

            tokenTypes.push(tokenType);
            texts.push(rawText);
            derivedMarkers.push(expectedMarker);
        }

        // 2) inPara forward propagation (uses the derived marker).
        let lastPara: string | null = null;
        for (let i = 0; i < filteredNodes.length; i++) {
            const node = filteredNodes[i];
            const tokenType = tokenTypes[i];
            const marker = derivedMarkers[i];

            if (tokenType === UsfmTokenTypes.marker && marker) {
                // Keep the old validation behavior for paragraph markers.
                if (
                    isValidParaMarker(marker) ||
                    marker === "c" ||
                    marker === "v"
                ) {
                    // For para markers, propagate forward.
                    if (isValidParaMarker(marker)) lastPara = marker;
                    // For chapter/verse markers, just validate the following number token if present.
                    if (marker === "c" || marker === "v") {
                        const nextSib = node.getNextSibling();
                        if (
                            nextSib &&
                            $isUSFMTextNode(nextSib) &&
                            nextSib.getTokenType() ===
                                UsfmTokenTypes.numberRange
                        ) {
                            const num = nextSib.getTextContent().trim();
                            const isValid =
                                marker === "c"
                                    ? /^\d+/.test(num)
                                    : numRangeRe.test(num);
                            if (!isValid) {
                                // No-op: lint handles the error, but we keep metadata stable.
                            }
                        }
                    }
                }
            }

            const targetInPara = lastPara || "";
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

        // 3) SID computation (reverse attribution within chapters).
        const sidNodes: Array<USFMParagraphNode | USFMTextNode> =
            allNodes.filter(
                (n) => $isUSFMTextNode(n) || $isUSFMParagraphNode(n),
            );
        /* 
    marker
: 
"c"
text
: 
"\\c "
tokenType
: 
"marker"
    */
        const tokenLikes: TokenForSidCalculation[] = sidNodes.map((n) => ({
            tokenType: n.getTokenType(),
            text: n.getTextContent(),
            marker: n.getMarker(),
        }));

        const targetSids = computeSidsReverse(tokenLikes, bookCode);

        for (let i = 0; i < sidNodes.length; i++) {
            const node = sidNodes[i];
            const currentSid = node.getSid();
            const targetSid = targetSids[i];
            if (currentSid !== targetSid) {
                updates.push({
                    dbgLabel: "maintainMetadata.sid",
                    dbgDetail: `Id: ${node.getId()} Current sid: ${currentSid} Expected sid: ${targetSid}`,
                    run: () => {
                        node.setSid(targetSid);
                    },
                });
            }
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
