import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Button, Group, Popover } from "@mantine/core";
import {
    $getRoot,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    type SerializedEditorState,
    type SerializedLexicalNode,
    TextNode,
} from "lexical";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as nestedStyles from "@/app/ui/styles/modules/NestedEditor.css.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

type Props = {
    outerMarker: string;
    initialEditorState: SerializedEditorState<SerializedLexicalNode>;
    onChange: (
        newState: SerializedEditorState<SerializedLexicalNode>,
        mainEditor: LexicalEditor,
    ) => void;
    id: string;
    lintErrors?: LintError[];
    isOpen: boolean;
    setIsOpen: (mainEditor: LexicalEditor, isOpen: boolean) => void;
};

export function NestedEditor({
    outerMarker,
    initialEditorState,
    onChange,
    id,
    lintErrors = [],
    isOpen,
    setIsOpen,
}: Props) {
    const nestedEditorRef = useRef<LexicalEditor>(null);
    const editorWrapperDomElRef = useRef<HTMLDivElement>(null);
    const { project, projectLanguageDirection } = useWorkspaceContext();
    const { appSettings } = project;
    const editorModeSetting = appSettings.editorMode ?? "regular";
    const [mainEditor] = useLexicalComposerContext();
    const [hasOpened, setHasOpened] = useState(false);

    const nestedConfig = {
        namespace: `nested-${outerMarker}-${id}`,
        editable: editorModeSetting !== "view",
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            {
                replace: TextNode,
                with: (node: TextNode) => {
                    return $createUSFMTextNode(node.getTextContent(), {
                        id: guidGenerator(),
                        sid: "",
                        inPara: "",
                    });
                },
                withKlass: USFMTextNode,
            },
            // only one, default container for chap
            ParagraphNode,
            LineBreakNode,
        ],
        onError(error: Error) {
            console.error("Nested editor error:", error);
        },
    };

    useEffect(() => {
        const editor = nestedEditorRef.current;
        if (!editor) return;
        editor.setEditable(editorModeSetting !== "view");
    }, [editorModeSetting]);

    const handleSave = useCallback(() => {
        const editor = nestedEditorRef.current;
        if (!editor) return;
        const state = editor.getEditorState();
        const json = state.toJSON();
        // bubble serialized state to parent
        onChange(json, mainEditor);
    }, [onChange, mainEditor]);

    const handleClose = useCallback(() => {
        handleSave();
        setIsOpen(mainEditor, false);
    }, [handleSave, mainEditor, setIsOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const tryInit = () => {
            const root = document.getElementById("root") as HTMLDivElement;
            const editorWrapper = editorWrapperDomElRef.current;
            if (editorWrapper && root) {
                Object.entries(root.dataset).forEach(([key, value]) => {
                    editorWrapper.dataset[key] = value;
                });
                editorWrapper.classList = root.classList.toString();
            }
            const editor = nestedEditorRef.current;
            const domEl = document.querySelector(`[data-id="${id}"]`);
            if (editor && domEl) {
                const parsed = editor.parseEditorState(initialEditorState);
                editor.setEditorState(parsed, { tag: "history-merge" });
                setHasOpened(true);
                editor.update(() => {
                    // when it open select the end of the first textNode:
                    const root = $getRoot();
                    const firstChild = root.getAllTextNodes()[0];
                    firstChild.selectEnd();
                });
            } else if (!cancelled) {
                requestAnimationFrame(tryInit);
            }
        };
        tryInit();
        return () => {
            cancelled = true;
        };
    }, [isOpen, initialEditorState, id]);

    useEffect(() => {
        if (!hasOpened) return;
        const editor = nestedEditorRef.current;
        if (!editor) return;
        const unregisterTransformWhileTyping = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                const arg = {
                    node,
                    editor,
                    editorMode: editorModeSetting,
                    languageDirection: projectLanguageDirection,
                };
                textNodeTransform(arg);
                inverseTextNodeTransform(arg);
            },
        );

        return () => {
            unregisterTransformWhileTyping();
        };
    }, [hasOpened, projectLanguageDirection, editorModeSetting]);

    const hasErrors = lintErrors.length > 0;
    const errorTitle =
        lintErrors.map((e) => e.message).join("; ") || "Open nested editor";

    return (
        <Popover
            defaultOpened={isOpen}
            onChange={(c) => {
                setIsOpen(mainEditor, c);
            }}
            position="bottom"
            shadow="md"
            width={500}
        >
            <Popover.Target>
                <Button
                    variant={hasErrors ? "light" : "subtle"}
                    color={hasErrors ? "red" : "gray"}
                    size="xs"
                    p="0"
                    onClick={() => {
                        setIsOpen(mainEditor, !isOpen);
                    }}
                    data-opened={isOpen}
                    data-id={id}
                    data-is-lint-error={hasErrors}
                    data-is-nested-editor-button="true"
                    title={errorTitle}
                    style={{ display: "inline-flex" }}
                >
                    <Plus size={14} />
                </Button>
            </Popover.Target>

            <Popover.Dropdown p="xs" className="">
                <div
                    className={nestedStyles.editorWrapper}
                    ref={editorWrapperDomElRef}
                >
                    <LexicalComposer initialConfig={nestedConfig}>
                        <RichTextPlugin
                            ErrorBoundary={LexicalErrorBoundary}
                            contentEditable={
                                <ContentEditable
                                    data-id={id}
                                    data-js="editor-container"
                                    className={nestedStyles.contentEditable}
                                />
                            }
                            placeholder={
                                <span className={nestedStyles.placeholder}>
                                    Enter note…
                                </span>
                            }
                        />
                        <HistoryPlugin />
                        {/* <OnChangePlugin
                            onChange={(editorState) => {
                                onChange(editorState.toJSON(), mainEditor);
                            }}
                        /> */}
                        <EditorRefPlugin editorRef={nestedEditorRef} />
                    </LexicalComposer>

                    <Group justify="flex-end" gap="xs">
                        <Button
                            size="xs"
                            variant="default"
                            onClick={handleClose}
                        >
                            Close
                        </Button>
                        <Button size="xs" onClick={handleSave}>
                            Save
                        </Button>
                    </Group>
                </div>
            </Popover.Dropdown>
        </Popover>
    );
}
