// Lightly adapted fromhttps://github.com/facebook/lexical/blob/main/packages/lexical-react/src/LexicalOnChangePlugin.ts
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorState, LexicalEditor } from "lexical";
import { HISTORY_MERGE_TAG } from "lexical";
import { useLayoutEffect } from "react";

export function CustomOnChangePlugin({
    tagsToIgnore,
    ignoreHistoryMergeTagChange,
    onChange,
    onSelectionChange,
}: {
    tagsToIgnore?: Set<string>;
    ignoreHistoryMergeTagChange?: boolean;
    onChange: (
        editorState: EditorState,
        editor: LexicalEditor,
        tags: Set<string>,
    ) => void;
    onSelectionChange?: (
        editorState: EditorState,
        editor: LexicalEditor,
        tags: Set<string>,
    ) => void;
}): null {
    const [editor] = useLexicalComposerContext();
    useLayoutEffect(() => {
        return editor.registerUpdateListener(
            ({
                editorState,
                dirtyElements,
                dirtyLeaves,
                prevEditorState,
                tags,
            }) => {
                // bail if any ignored tags
                if (
                    tagsToIgnore &&
                    [...tags].some((t) => tagsToIgnore.has(t))
                ) {
                    return;
                }

                // bail if just a history merge tag
                if (
                    tags.has(HISTORY_MERGE_TAG) &&
                    ignoreHistoryMergeTagChange
                ) {
                    return;
                }

                // ignore very first empty state
                if (prevEditorState.isEmpty()) {
                    return;
                }

                const hasDirties =
                    dirtyElements.size > 0 || dirtyLeaves.size > 0;

                if (hasDirties) {
                    // content change
                    onChange?.(editorState, editor, tags);
                }
                if (onSelectionChange) {
                    onSelectionChange(editorState, editor, tags);
                }
            },
        );
    }, [
        editor,
        tagsToIgnore,
        onChange,
        onSelectionChange,
        ignoreHistoryMergeTagChange,
    ]);

    return null;
}
