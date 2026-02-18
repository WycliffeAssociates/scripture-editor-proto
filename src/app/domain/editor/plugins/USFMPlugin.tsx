import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { useEditorInput } from "@/app/domain/editor/hooks/useEditorInput.ts";
import { useEditorLinter } from "@/app/domain/editor/hooks/useEditorLinter.ts";
import { useEditorStructure } from "@/app/domain/editor/hooks/useEditorStructure.ts";
import { useEditorView } from "@/app/domain/editor/hooks/useEditorView.ts";
import { LintTooltipPlugin } from "@/app/domain/editor/plugins/LintTooltipPlugin.tsx";
import { SearchReplaceSuggestPlugin } from "@/app/domain/editor/plugins/SearchReplaceSuggestPlugin.tsx";
import { VerseMarkerSuggestPlugin } from "@/app/domain/editor/plugins/VerseMarkerSuggestPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const { actions, project } = useWorkspaceContext();
    useEditorLinter(editor);
    useEditorStructure(editor);
    useEditorInput(editor);
    useEditorView(editor);

    useEffect(() => {
        const mode = project.appSettings.editorMode ?? "regular";
        editor.setEditable(mode !== "view");
    }, [editor, project.appSettings.editorMode]);

    useEffect(() => {
        actions.initializeEditor(editor);
    }, [actions, editor]);

    return (
        <>
            <LintTooltipPlugin />
            <VerseMarkerSuggestPlugin />
            <SearchReplaceSuggestPlugin />
        </>
    );
}
