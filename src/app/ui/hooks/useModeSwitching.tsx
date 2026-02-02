import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { useRef } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import {
    flattenParagraphContainersToFlatTokens,
    groupFlatNodesIntoParagraphContainers,
    unwrapFlatTokensFromRootChildren,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { updateDomForEditorMode } from "./utils/domUtils.ts";

export type UseModeSwitchingHook = ReturnType<typeof useModeSwitching>;

export function useModeSwitching({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    appSettings,
    updateAppSettings,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    appSettings: Partial<Settings>;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
        editor?: LexicalEditor,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
}) {
    const initializationRef = useRef(false);
    const resolvedEditorMode =
        (appSettings.editorMode as EditorModeSetting) ?? "regular";

    /**
     * Initialize the editor with the current chapter content.
     * No transformation needed - data is already in correct format from projectParamToParsed.
     */
    function initializeEditor(editor: LexicalEditor) {
        if (initializationRef.current) return;
        initializationRef.current = true;

        // Just set the editor content for the current chapter
        // The data is already in the correct format from the loader
        const currentChapterData = mutWorkingFilesRef
            .find((f) => f.bookCode === currentFileBibleIdentifier)
            ?.chapters.find((c) => c.chapNumber === currentChapter);

        if (currentChapterData) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                currentChapterData,
                editor,
            );
        }

        updateDomForEditorMode({ editorMode: resolvedEditorMode });
    }

    /**
     * Switch editor mode and transform all chapters.
     * This is expensive and should only be called when user explicitly switches modes.
     */
    function setEditorMode(
        next: "regular" | "usfm" | "plain",
        editor?: LexicalEditor,
    ) {
        // Save current state before transforming
        const inProgress = saveCurrentDirtyLexical();
        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        for (const { file, chapter } of walkChapters(filesToUse)) {
            const direction = (chapter.lexicalState.root.direction ?? "ltr") as
                | "ltr"
                | "rtl";
            const rootChildren = chapter.lexicalState.root
                .children as SerializedLexicalNode[];

            // Check if already in desired format to avoid unnecessary work
            const isCurrentlyParagraphMode = rootChildren.some(
                (child) =>
                    (child as { type?: string }).type === "usfm-paragraph-node",
            );
            const wantsParagraphMode = next === "regular";

            if (isCurrentlyParagraphMode === wantsParagraphMode) {
                // Already in correct format, skip transformation
                if (
                    chapter.chapNumber === currentChapter &&
                    file.bookCode === currentFileBibleIdentifier
                ) {
                    thisChapterUpdated = chapter;
                }
                continue;
            }

            // Transform to desired format
            const unwrappedFlatTokens =
                unwrapFlatTokensFromRootChildren(rootChildren);

            if (wantsParagraphMode) {
                // Switching TO regular mode: wrap in paragraph containers
                const flatTokens =
                    unwrappedFlatTokens ??
                    flattenParagraphContainersToFlatTokens(rootChildren);
                chapter.lexicalState.root.children =
                    groupFlatNodesIntoParagraphContainers(
                        flatTokens,
                        direction,
                    );
            } else {
                // Switching TO usfm/plain mode: flatten to tokens
                const flatTokens =
                    unwrappedFlatTokens ??
                    flattenParagraphContainersToFlatTokens(rootChildren);
                chapter.lexicalState.root.children = [
                    wrapFlatTokensInLexicalParagraph(flatTokens, direction),
                ];
            }

            if (
                chapter.chapNumber === currentChapter &&
                file.bookCode === currentFileBibleIdentifier
            ) {
                thisChapterUpdated = chapter;
            }
        }

        // Update editor content if current chapter was transformed
        if (thisChapterUpdated) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                thisChapterUpdated,
                editor,
            );
        }

        updateAppSettings({
            editorMode: next,
        });
        updateDomForEditorMode({ editorMode: next });
    }

    return {
        setEditorMode,
        initializeEditor,
    };
}
