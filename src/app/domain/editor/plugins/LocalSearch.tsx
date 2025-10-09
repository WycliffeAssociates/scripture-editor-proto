import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, EditorState, LexicalEditor, TextNode } from "lexical";
import { useEffect } from "react";

interface SearchHighlightPluginProps {
    searchTerm: string;
    highlightName?: string; // Optional CSS highlight name
    currentEditorState: EditorState | null;
}

export function SearchHighlightPlugin({
    searchTerm,
    highlightName = "search-term",
    currentEditorState,
}: SearchHighlightPluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (!searchTerm) {
            CSS.highlights.clear();
            return;
        }

        const applyHighlights = () => {
            currentEditorState?.read(() => {
                const root = $getRoot();
                console.log("applyHighlights reading root", root);
                const matchHighlight = new Highlight();
                const matchedRanges = [];

                root.getAllTextNodes().forEach((textNode: TextNode) => {
                    const text = textNode.getTextContent();
                    let startIndex = 0;
                    const domNode = editor.getElementByKey(textNode.getKey());
                    if (!domNode) return;

                    while (true) {
                        const index = text.indexOf(searchTerm, startIndex);
                        if (index === -1) break;

                        const range = new Range();
                        // If TextNode contains multiple child nodes, pick firstChild
                        const firstChild = domNode.firstChild || domNode;
                        range.setStart(firstChild, index);
                        range.setEnd(firstChild, index + searchTerm.length);
                        matchHighlight.add(range);
                        // matchedRanges.push(range);
                        startIndex = index + searchTerm.length;
                    }
                });
                // Apply all highlights
                CSS.highlights.set(highlightName, matchHighlight);
            });
        };

        applyHighlights();

        // Optional: Cleanup when unmount or searchTerm changes
        return () => {
            CSS.highlights.clear();
            // CSS.highlights.delete(highlightName);
        };
    }, [editor, searchTerm, highlightName, currentEditorState]);

    return null;
}
