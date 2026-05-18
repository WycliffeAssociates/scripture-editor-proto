import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { useEditorInput } from "@/app/domain/editor/hooks/useEditorInput.ts";
import { useEditorView } from "@/app/domain/editor/hooks/useEditorView.ts";
import { LintDomAnnotatorPlugin } from "@/app/domain/editor/plugins/LintDomAnnotatorPlugin.tsx";
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
    const { actions, project } = useWorkspaceContext();
    useEditorInput(editor);
    useEditorView(editor);

    useEffect(() => {
        const mode = project.appSettings.editorMode ?? EDITOR_MODES.regular;
        editor.setEditable(mode !== EDITOR_MODES.view);
    }, [editor, project.appSettings.editorMode]);

    useEffect(() => {
        actions.syncEditorToVisibleChapter(editor);
    }, [actions, editor]);

    return (
        <>
            <LintDomAnnotatorPlugin editor={editor} />
            <VerseMarkerSuggestPlugin />
            <SearchReplaceSuggestPlugin />
        </>
    );
}
