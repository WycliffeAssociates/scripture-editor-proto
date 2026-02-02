import { $dfsIterator } from "@lexical/utils";
import { $getNodeByKey, type EditorState, type LexicalEditor } from "lexical";
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
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { markerTrimNoSlash, numRangeRe } from "@/core/domain/usfm/lex.ts";
import {
    computeSidsReverse,
    type TokenForSidCalculation,
} from "@/core/domain/usfm/parseUtils.ts";

export function maintainDocumentMetaData(
    _editorState: EditorState,
    editor: LexicalEditor,
    bookCode: string,
    _appSettings: Settings,
) {
    // NOTE: This function is often invoked from an update listener that also runs
    // structural fixes (which call `editor.update`). Computing metadata using the
    // passed `editorState` snapshot can therefore become stale. We always compute
    // against the editor's latest state, and apply changes by re-fetching nodes by key.

    const markerUpdates: Array<{ key: string; marker: string | undefined }> =
        [];
    const inParaUpdates: Array<{ key: string; inPara: string }> = [];
    const sidUpdates: Array<{ key: string; sid: string }> = [];

    const derivedMarkerByKey = new Map<string, string | undefined>();

    editor.getEditorState().read(() => {
        const allNodes = [...$dfsIterator()].map((n) => n.node);
        const filteredNodes = allNodes.filter($isUSFMTextNode);

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

            derivedMarkerByKey.set(node.getKey(), expectedMarker);

            const currentMarker = node.getMarker();
            if (expectedMarker && currentMarker !== expectedMarker) {
                markerUpdates.push({
                    key: node.getKey(),
                    marker: expectedMarker,
                });
            }
        }

        // 2) inPara forward propagation (uses the derived marker).
        let lastPara: string | null = null;
        for (const node of filteredNodes) {
            const tokenType = node.getTokenType();
            const marker = derivedMarkerByKey.get(node.getKey());

            if (tokenType === UsfmTokenTypes.marker && marker) {
                if (
                    isValidParaMarker(marker) ||
                    marker === "c" ||
                    marker === "v"
                ) {
                    if (isValidParaMarker(marker)) lastPara = marker;

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
            const currentInPara = node.getInPara() ?? "";
            if (currentInPara !== targetInPara) {
                inParaUpdates.push({
                    key: node.getKey(),
                    inPara: targetInPara,
                });
            }
        }

        // 3) SID computation (reverse attribution within chapters).
        const sidNodes: Array<USFMParagraphNode | USFMTextNode> =
            allNodes.filter(
                (n) => $isUSFMTextNode(n) || $isUSFMParagraphNode(n),
            );

        const tokenLikes: TokenForSidCalculation[] = sidNodes.map((n) => {
            if ($isUSFMTextNode(n)) {
                return {
                    tokenType: n.getTokenType(),
                    text: n.getTextContent(),
                    marker: derivedMarkerByKey.get(n.getKey()) ?? n.getMarker(),
                };
            }
            return {
                tokenType: n.getTokenType(),
                text: n.getTextContent(),
                marker: n.getMarker(),
            };
        });

        const targetSids = computeSidsReverse(tokenLikes, bookCode);
        for (let i = 0; i < sidNodes.length; i++) {
            const node = sidNodes[i];
            const currentSid = node.getSid();
            const targetSid = targetSids[i];
            if (currentSid !== targetSid) {
                sidUpdates.push({ key: node.getKey(), sid: targetSid });
            }
        }
    });

    if (!markerUpdates.length && !inParaUpdates.length && !sidUpdates.length) {
        return;
    }

    editor.update(
        () => {
            for (const u of markerUpdates) {
                const node = $getNodeByKey(u.key);
                if (!node || !node.isAttached()) continue;
                if (!$isUSFMTextNode(node)) continue;
                node.setMarker(u.marker);
            }

            for (const u of inParaUpdates) {
                const node = $getNodeByKey(u.key);
                if (!node || !node.isAttached()) continue;
                if (!$isUSFMTextNode(node)) continue;
                node.setInPara(u.inPara);
            }

            for (const u of sidUpdates) {
                const node = $getNodeByKey(u.key);
                if (!node || !node.isAttached()) continue;
                if (!$isUSFMTextNode(node) && !$isUSFMParagraphNode(node))
                    continue;
                node.setSid(u.sid);
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
