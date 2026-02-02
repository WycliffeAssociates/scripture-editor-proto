import type { LexicalEditor } from "lexical";
import { useEffect } from "react";
import { syncReferencePaneSid } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Hook to manage visual-only updates in the editor.
 * Handles marker preview toggling and reference pane synchronization.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorView(editor: LexicalEditor) {
    const { referenceProject } = useWorkspaceContext();

    useEffect(() => {
        const syncRefScrollUnregister = syncReferencePaneSid(
            editor,
            referenceProject?.referenceProjectId,
        );

        return () => {
            syncRefScrollUnregister();
        };
    }, [editor, referenceProject?.referenceProjectId]);
}
