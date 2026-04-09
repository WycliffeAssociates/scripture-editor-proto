/**
 * Lint collection only.
 *
 * The workspace lint store owns diagnostics. This module converts one editor
 * snapshot into flat tokens, asks onion for issues, and returns that raw result.
 * It does not write anything back into Lexical.
 */
import type { EditorState, SerializedEditorState } from "lexical";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

export async function collectLintIssues(
    editorState: EditorState,
    usfmOnionService: IUsfmOnionService,
    getFlatFileTokens: (
        currentEditorState: SerializedEditorState,
        opts?: { bookCode?: string; chapter?: number },
    ) => Token[],
    opts?: { bookCode?: string; chapter?: number },
) {
    const tokens = getFlatFileTokens(editorState.toJSON(), opts);
    return tokens.length ? await usfmOnionService.lintExisting(tokens) : [];
}
