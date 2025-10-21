import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Button, Group, Popover } from "@mantine/core";
import { remove } from "@tauri-apps/plugin-fs";
import {
    type EditorState,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    type SerializedEditorState,
    type SerializedLexicalNode,
} from "lexical";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { USFMElementNode } from "@/app/domain/editor/nodes/USFMElementNode";
import { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";
import type { LintError } from "@/core/domain/usfm/parse";

type Props = {
    outerMarker: string;
    initialEditorState: any;
    onChange: (
        newState: SerializedEditorState<SerializedLexicalNode>,
        mainEditor: LexicalEditor,
    ) => void;
    id: string;
    lintErrors?: LintError[];
};

export function NestedEditor({
    outerMarker,
    initialEditorState,
    onChange,
    id,
    lintErrors = [],
}: Props) {
    const nestedRef = useRef<LexicalEditor>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false);
    const [hasSetInitialContent, setHasSetInitialContent] = useState(false);
    //   const [opened, setOpened] = useState(false);

    const nestedConfig = {
        namespace: `nested-${outerMarker}-${id}`,
        editable: true,
        nodes: [ParagraphNode, LineBreakNode, USFMTextNode, USFMElementNode],
        onError(error: Error) {
            console.error("Nested editor error:", error);
        },
    };

    const handleSave = useCallback(() => {
        const editor = nestedRef.current;
        if (!editor) return;
        const json = editor.getEditorState().toJSON();
        // bubble serialized state to parent
        onChange(json, editor);
        setHasOpened(false);
    }, [onChange]);

    const handleClose = useCallback(() => {
        handleSave();
        setHasOpened(false);
    }, [handleSave]);

    useEffect(() => {
        if (!hasOpened) return;
        let cancelled = false;

        const tryInit = () => {
            const editor = nestedRef.current;
            if (editor) {
                const parsed = editor.parseEditorState(initialEditorState);
                editor.setEditorState(parsed, { tag: "history-merge" });
                setHasSetInitialContent(true);
            } else if (!cancelled) {
                requestAnimationFrame(tryInit);
            }
        };
        if (!hasSetInitialContent) {
            tryInit();
        }
        return () => {
            cancelled = true;
        };
    }, [hasOpened, initialEditorState, hasSetInitialContent]);

    const hasErrors = lintErrors.length > 0;
    const errorClasses = hasErrors ? "border-red-500 text-red-600" : "";
    const errorTitle =
        lintErrors.map((e) => e.message).join("; ") || "Open nested editor";

    return (
        <Popover
            defaultOpened={isOpen}
            onChange={(c) => {
                setIsOpen(c);
                if (!hasOpened) {
                    setHasOpened(true);
                }
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
                        setIsOpen(!isOpen);
                    }}
                    data-opened={isOpen}
                    data-id={id}
                    data-is-lint-error={hasErrors}
                    data-is-nested-editor-button="true"
                    title={errorTitle}
                    className={`inline-block ${errorClasses}`}
                >
                    <Plus size={14} />
                </Button>
            </Popover.Target>

            <Popover.Dropdown p="xs" className="">
                <div className="space-y-2">
                    <LexicalComposer initialConfig={nestedConfig}>
                        <RichTextPlugin
                            ErrorBoundary={LexicalErrorBoundary}
                            contentEditable={
                                <ContentEditable
                                    data-id={id}
                                    className="outline-none min-h-[100px] p-1 border rounded"
                                />
                            }
                            placeholder={
                                <span className="text-gray-400">
                                    Enter note…
                                </span>
                            }
                        />
                        <HistoryPlugin />
                        <OnChangePlugin onChange={() => {}} />
                        <EditorRefPlugin editorRef={nestedRef} />
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
