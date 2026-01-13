import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEditorInput } from "@/app/domain/editor/hooks/useEditorInput.ts";
import { useEditorLinter } from "@/app/domain/editor/hooks/useEditorLinter.ts";
import { useEditorStructure } from "@/app/domain/editor/hooks/useEditorStructure.ts";
import { useEditorView } from "@/app/domain/editor/hooks/useEditorView.ts";

export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();

    useEditorLinter(editor);
    useEditorStructure(editor);
    useEditorInput(editor);
    useEditorView(editor);

    return null;
}
