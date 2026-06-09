import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { useEditorInput } from "@/app/domain/editor/hooks/useEditorInput.ts";
import { useEditorView } from "@/app/domain/editor/hooks/useEditorView.ts";
import { FindingsOverlayPlugin } from "@/app/domain/editor/plugins/FindingsOverlayPlugin.tsx";
import { SearchReplaceSuggestPlugin } from "@/app/domain/editor/plugins/SearchReplaceSuggestPlugin.tsx";
import { VerseMarkerSuggestPlugin } from "@/app/domain/editor/plugins/VerseMarkerSuggestPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Composes the behavior layer for the scripture chapter editor.
 *
 * This is where the mounted Lexical instance is wired into the workspace's input,
 * structure, lint, and view synchronization hooks, plus the mode-specific overlay
 * plugins that sit on top of the document.
 */
export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const { actions } = useWorkspaceContext();
    useEditorInput(editor);
    useEditorView(editor);

    // NOTE: the editor's `editable` flag (mode + interaction gate) is owned
    // solely by GateEditablePlugin in Editor.tsx. Setting it here too would race
    // and could re-enable typing while the gate is meant to be read-only.

    useEffect(() => {
        actions.syncEditorToVisibleChapter(editor);
    }, [actions, editor]);

    return (
        <>
            <FindingsOverlayPlugin editor={editor} />
            <VerseMarkerSuggestPlugin />
            <SearchReplaceSuggestPlugin />
        </>
    );
}
