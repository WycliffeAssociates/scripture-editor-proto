import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
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
import { DATA_JS } from "@/app/data/constants.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import {
    Popover,
    PopoverDropdown,
    PopoverTarget,
} from "@/app/ui/components/primitives/Popover/Popover.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as nestedStyles from "@/app/ui/styles/modules/NestedEditor.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type Props = {
    outerMarker: string;
    mainEditor: LexicalEditor;
    initialEditorState: SerializedEditorState<SerializedLexicalNode>;
    onChange: (
        newState: SerializedEditorState<SerializedLexicalNode>,
        mainEditor: LexicalEditor,
    ) => void;
    id: string;
    lintErrors?: LintIssue[];
    isOpen: boolean;
    setIsOpen: (mainEditor: LexicalEditor, isOpen: boolean) => void;
};

/**
 * Inline nested editor used for note-like USFM structures.
 *
 * The main scripture editor owns the surrounding document, but some markers need
 * a focused editing surface with their own Lexical state. This component mounts
 * that temporary nested editor and synchronizes the serialized result back into
 * the main editor when the popover closes.
 */
export function NestedEditor({
    outerMarker,
    mainEditor,
    initialEditorState,
    onChange,
    id,
    lintErrors = [],
    isOpen,
    setIsOpen,
}: Props) {
    const hasErrors = lintErrors.length > 0;

    return (
        <Popover
            defaultOpened={isOpen}
            onChange={(c) => {
                setIsOpen(mainEditor, c);
            }}
            position="bottom"
            offset={8}
        >
            <PopoverTarget
                asChild
                className={nestedStyles.nestedEditorButton}
                data-opened={isOpen}
                data-id={id}
                data-is-lint-error={hasErrors}
                data-is-nested-editor-button="true"
            >
                <Plus size={14} />
            </PopoverTarget>

            <PopoverDropdown>
                <NestedEditorContent
                    outerMarker={outerMarker}
                    mainEditor={mainEditor}
                    initialEditorState={initialEditorState}
                    onChange={onChange}
                    id={id}
                    isOpen={isOpen}
                    setIsOpen={setIsOpen}
                />
            </PopoverDropdown>
        </Popover>
    );
}

function NestedEditorContent({
    outerMarker,
    mainEditor,
    initialEditorState,
    onChange,
    id,
    isOpen,
    setIsOpen,
}: Omit<Props, "lintErrors">) {
    const nestedEditorRef = useRef<LexicalEditor>(null);
    const editorWrapperDomElRef = useRef<HTMLDivElement>(null);
    const { project, projectLanguageDirection } = useWorkspaceContext();
    const { appSettings } = project;
    const editorModeSetting = appSettings.editorMode ?? EDITOR_MODES.regular;
    const [hasOpened, setHasOpened] = useState(false);

    const nestedConfig = {
        namespace: `nested-${outerMarker}-${id}`,
        editable: editorModeSetting !== EDITOR_MODES.view,
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
        editor.setEditable(editorModeSetting !== EDITOR_MODES.view);
    }, [editorModeSetting]);

    const handleSave = useCallback(() => {
        const editor = nestedEditorRef.current;
        if (!editor) return;
        onChange(editor.getEditorState().toJSON(), mainEditor);
    }, [mainEditor, onChange]);

    const handleClose = useCallback(() => {
        handleSave();
        setIsOpen(mainEditor, false);
    }, [handleSave, mainEditor, setIsOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const tryInit = () => {
            const root = document.getElementById(
                "root",
            ) as HTMLDivElement | null;
            const editorWrapper = editorWrapperDomElRef.current;
            if (editorWrapper && root) {
                Object.entries(root.dataset).forEach(([key, value]) => {
                    editorWrapper.dataset[key] = value;
                });
            }

            const editor = nestedEditorRef.current;
            const domEl = document.querySelector(`[data-id="${id}"]`);
            if (editor && domEl) {
                editor.setEditorState(
                    editor.parseEditorState(initialEditorState),
                    {
                        tag: "history-merge",
                    },
                );
                setHasOpened(true);
                editor.update(() => {
                    const rootNode = $getRoot();
                    const firstChild = rootNode.getAllTextNodes()[0];
                    firstChild?.selectEnd();
                });
                return;
            }

            if (!cancelled) {
                requestAnimationFrame(tryInit);
            }
        };

        tryInit();
        return () => {
            cancelled = true;
        };
    }, [id, initialEditorState, isOpen]);

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

        return unregisterTransformWhileTyping;
    }, [editorModeSetting, hasOpened, projectLanguageDirection]);

    return (
        <div className={nestedStyles.editorWrapper} ref={editorWrapperDomElRef}>
            <LexicalComposer initialConfig={nestedConfig}>
                <RichTextPlugin
                    ErrorBoundary={LexicalErrorBoundary}
                    contentEditable={
                        <ContentEditable
                            data-id={id}
                            data-js={DATA_JS.editorContainer}
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
                <EditorRefPlugin editorRef={nestedEditorRef} />
            </LexicalComposer>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                }}
            >
                <Button size="xs" variant="tertiary" onClick={handleClose}>
                    Close
                </Button>
                <Button size="xs" variant="primary" onClick={handleSave}>
                    Save
                </Button>
            </div>
        </div>
    );
}
