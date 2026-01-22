import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { useEditorInput } from "@/app/domain/editor/hooks/useEditorInput.ts";
import { useEditorLinter } from "@/app/domain/editor/hooks/useEditorLinter.ts";
import { useEditorStructure } from "@/app/domain/editor/hooks/useEditorStructure.ts";
import { useEditorView } from "@/app/domain/editor/hooks/useEditorView.ts";
import { LintTooltipPlugin } from "@/app/domain/editor/plugins/LintTooltipPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const { actions } = useWorkspaceContext();

    useEditorLinter(editor);
    useEditorStructure(editor);
    useEditorInput(editor);
    useEditorView(editor);

    useEffect(() => {
        actions.initializeEditor(editor);
    }, [actions, editor]);

    return <LintTooltipPlugin />;
}
