import type { SerializedLexicalNode } from "lexical";

function serializeNode(node: SerializedLexicalNode): string {
    if (
        "type" in node &&
        node.type === "usfm-text-node" &&
        "text" in node &&
        typeof node.text === "string"
    ) {
        return node.text;
    }

    if ("type" in node && node.type === "linebreak") {
        return "\n";
    }

    if (
        "children" in node &&
        Array.isArray((node as { children?: unknown }).children)
    ) {
        return (node as { children: SerializedLexicalNode[] }).children
            .map(serializeNode)
            .join("");
    }

    if (
        "editorState" in node &&
        node.editorState &&
        typeof node.editorState === "object" &&
        "root" in node.editorState &&
        node.editorState.root &&
        typeof node.editorState.root === "object" &&
        "children" in node.editorState.root &&
        Array.isArray(
            (node.editorState.root as { children?: unknown }).children,
        )
    ) {
        const marker =
            "marker" in node && typeof node.marker === "string"
                ? node.marker
                : "";
        const children = (
            node.editorState.root as {
                children: SerializedLexicalNode[];
            }
        ).children;
        return `\\${marker} ${children.map(serializeNode).join("")} \\${marker}*`;
    }

    return "";
}

export function serializeToUsfmString(nodes: SerializedLexicalNode[]): string {
    return nodes.map(serializeNode).join("");
}
