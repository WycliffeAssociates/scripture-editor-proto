import type { LexicalEditor } from "lexical";
import { useEffect } from "react";
import { syncReferencePaneSid } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Register visual-only synchronization tied to the current editor selection.
 *
 * This hook does not change scripture content. It keeps the reference pane
 * scrolled to the same scripture anchor when the user enables synced
 * navigation/scrolling, which is why it depends on both the active reference
 * item and the current sync toggles from workspace state.
 */
export function useEditorView(editor: LexicalEditor) {
    const { referenceResource } = useWorkspaceContext();

    useEffect(() => {
        const syncRefScrollUnregister = syncReferencePaneSid(
            editor,
            referenceResource?.activeReferenceResourcePath,
            Boolean(
                referenceResource?.supportsScriptureNavigation &&
                    referenceResource?.isReferenceNavSynced &&
                    referenceResource?.isReferenceScrollSynced,
            ),
        );

        return () => {
            syncRefScrollUnregister();
        };
    }, [
        editor,
        referenceResource?.activeReferenceResourcePath,
        referenceResource?.isReferenceNavSynced,
        referenceResource?.isReferenceScrollSynced,
        referenceResource?.supportsScriptureNavigation,
    ]);
}
