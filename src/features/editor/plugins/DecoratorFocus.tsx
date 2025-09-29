import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $getSelection,
    $isNodeSelection,
    COMMAND_PRIORITY_HIGH,
    CUT_COMMAND,
    PASTE_COMMAND,
} from "lexical";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/contexts/ProjectContext";
import { lexicalToUSFM, moveDecoratorNode } from "@/lib/editorNodeFunctions";
import { getSerializedLexicalNodes } from "@/lib/getEditorState";
import { parseUSFM } from "@/lib/parse";
import {
    $isUSFMDecoratorNode,
    USFM_DECORATOR_TYPE,
} from "../nodes/USFMMarkerDecoratorNode";

export function DecoratorFocusPlugin() {
    const [editor] = useLexicalComposerContext();
    const {
        setDragState,
        dragState,
        pickedFile,
        currentChapter,
        currentFile,
        updateChapterLexical,
    } = useProjectContext();
    const bookSlug = pickedFile?.identifier?.toUpperCase();

    useEffect(() => {
        const unregisterFocusDecorators = editor.registerUpdateListener(
            ({ editorState }) => {
                editorState.read(() => {
                    const selection = $getSelection();
                    const isNodeSel = $isNodeSelection(selection);
                    if (!isNodeSel) return;

                    // Check if anchor/focus node is a decorator
                    const node = selection.getNodes()[0];
                    console.log(node);
                    // Replace with your check for USFMDecoratorNode
                    const isDecorator =
                        node.getType?.() === USFM_DECORATOR_TYPE;
                    console.log(node.getType?.());
                    if (isDecorator) {
                        // Find the DOM element
                        const domNode = editor.getElementByKey(node.getKey());
                        const popoverTrigger = domNode?.querySelector(
                            "[data-js='usfm-decorator-trigger']",
                        );
                        console.log({ domNode });
                        if (popoverTrigger instanceof HTMLElement) {
                            console.log("FOCUSING");
                            popoverTrigger.focus();
                        }
                    }
                });
            },
        );

        const unregisterCut = editor.registerCommand(
            CUT_COMMAND,
            (payload) => {
                const selection = $getSelection();
                const nodesSelected = selection?.getNodes();
                if (!nodesSelected?.length) return false;
                if (nodesSelected?.length > 1) return false;
                if ($isNodeSelection(selection)) {
                    const node = selection.getNodes()[0];
                    if ($isUSFMDecoratorNode(node)) {
                        // Put this node into drag mode instead of actual cut
                        console.log("CUT COMMAND");
                        const nodeKey = node.getKey();
                        setDragState({ draggingNodeKey: nodeKey });
                        return true;
                    }
                }
                return false; // let default behavior happen for others
            },
            COMMAND_PRIORITY_HIGH,
        );

        const unregisterPaste = editor.registerCommand(
            PASTE_COMMAND,
            (payload) => {
                console.log("PASTE COMMAND");
                if (!dragState?.draggingNodeKey) return false;
                moveDecoratorNode(editor, dragState.draggingNodeKey);
                setDragState(null);
                setTimeout(() => {
                    const newUsfm = lexicalToUSFM(editor);
                    const asTokens = parseUSFM(newUsfm, bookSlug).chapters;
                    const asLexical = getSerializedLexicalNodes(asTokens[0]);
                    editor.update(() => {
                        const editorState = editor.parseEditorState(asLexical);
                        editor.setEditorState(editorState, {
                            tag: "history-merge",
                        });
                    });
                    if (currentChapter && currentFile) {
                        updateChapterLexical({
                            newLexical: editor.getEditorState().toJSON(),
                            chap: currentChapter,
                            file: currentFile,
                        });
                    }
                    // updateChapterLexical({newLexical: asLexical., chap: currentChapter, file: currentFile})
                    console.log(asTokens);
                    console.log(asLexical);
                }, 100);
                return true;
            },
            COMMAND_PRIORITY_HIGH,
        );

        return () => {
            unregisterFocusDecorators();
            unregisterCut();
            unregisterPaste();
        };
    }, [
        editor,
        dragState,
        bookSlug,
        currentChapter,
        currentFile,
        setDragState,
        updateChapterLexical,
    ]);

    return null;
}
