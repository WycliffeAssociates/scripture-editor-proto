import type {
    SerializedEditorState,
    SerializedLexicalNode,
    SerializedLineBreakNode,
} from "lexical";
import type { USFMNodeJSON } from "@/app/data/editor";
import { createSerializedUSFMElementNode } from "@/app/domain/editor/nodes/USFMElementNode";
import {
    getSerializedNestedEditorNode,
    nestedEditorMarkers,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";
import type { ParsedToken } from "@/core/data/usfm/parse";
import { TokenMap } from "@/core/domain/usfm/lex";

export function parsedUsfmTokensToJsonLexicalNode(
    tokens: ParsedToken[],
    languageDirection: "ltr" | "rtl",
): SerializedEditorState<SerializedLexicalNode> {
    const wrappedPara = {
        type: "paragraph",
        version: 1,
        direction: languageDirection,
        format: "start",
        indent: 0,
        children: tokens
            .map((t) => serializeToken(t, languageDirection))
            .filter(Boolean),
    };
    return {
        root: {
            children: [wrappedPara],
            type: "root",
            version: 1,
            direction: languageDirection,
            format: "start",
            indent: 0,
        },
    };
}
function serializeToken(
    t: ParsedToken,
    languageDirection: "ltr" | "rtl",
): USFMNodeJSON {
    const token = normalizeToken(t);
    if (nestedEditorMarkers.has(token.marker ?? "")) {
        return getSerializedNestedEditorNode({
            token,
            childrenCb: () =>
                token.content?.map((c) =>
                    serializeToken(c, languageDirection),
                ) ?? [],
            languageDirection,
        });
    }

    // If token has children → element node
    // if (Array.isArray(token.content) && token.content.length > 0) {
    //   const openSerializedMarker = createSerializedUSFMTextNode({
    //     text: token.text,
    //     id: token.id,
    //     sid: token.sid || "",
    //     tokenType: token.tokenType,
    //     marker: t.marker,
    //     inPara: t.inPara,
    //   });
    //   const children =
    //     t.content?.map((c) => serializeToken(c, languageDirection)) ?? [];
    //   const close = createSerializedUSFMTextNode({
    //     text: `\\${t.marker}*`,
    //     id: t.id,
    //     sid: t.sid || "",
    //     tokenType: "endMarker",
    //     marker: t.marker,
    //     inPara: t.inPara,
    //   });
    //   return createSerializedUSFMElementNode(t, languageDirection, [
    //     openSerializedMarker,
    //     ...children,
    //     close,
    //   ]);
    // }

    // if (token.marker === "b") {
    //   const lb: SerializedLineBreakNode = {
    //     type: "linebreak",
    //     version: 1,
    //   };
    //   return lb;
    // }
    if (token.tokenType === TokenMap.verticalWhitespace) {
        const lb: SerializedLineBreakNode = {
            type: "linebreak",
            version: 1,
        };
        return lb;
    }
    // else it is a text node

    return createSerializedUSFMTextNode({
        text: token.text,
        id: token.id,
        sid: token.sid || "",
        tokenType: token.tokenType,
        marker: token.marker,
        inPara: token.inPara,
        lintErrors: token.lintErrors,
        // maybe set isMutable and show from parse if remembering settings? Right now we just adjust once we've rendered the stuff. NOt sure
    });
}

function normalizeToken(t: ParsedToken): ParsedToken {
    const token =
        t.tokenType === "idMarker"
            ? {
                  ...t,
                  marker: "id",
                  tokenType: "marker",
                  text: t.text.replace("id", ""),
                  id: t.id,
              }
            : t;
    return token;
}
