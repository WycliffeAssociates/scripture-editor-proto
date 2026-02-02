import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { useRef } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
    flattenParagraphContainersToFlatTokens,
    groupFlatTokensIntoParagraphContainers,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeAdjustments.ts";
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

    function unwrapFlatTokensFromRootChildren(
        rootChildren: SerializedLexicalNode[],
    ): SerializedLexicalNode[] | null {
        const onlyChild =
            rootChildren.length === 1 ? rootChildren[0] : undefined;
        if (onlyChild?.type !== "paragraph") return null;
        const maybeChildren = (onlyChild as { children?: unknown }).children;
        return Array.isArray(maybeChildren)
            ? (maybeChildren as SerializedLexicalNode[])
            : null;
    }

    function setEditorMode(
        next: "regular" | "usfm" | "plain",
        args?: { isInitialLoad?: boolean; editor?: LexicalEditor },
    ) {
        const { isInitialLoad = false, editor } = args ?? {};
        const inProgress = isInitialLoad
            ? undefined
            : saveCurrentDirtyLexical();
        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        for (const { file, chapter } of walkChapters(filesToUse)) {
            const direction = (chapter.lexicalState.root.direction ?? "ltr") as
                | "ltr"
                | "rtl";
            const rootChildren = chapter.lexicalState.root
                .children as SerializedLexicalNode[];
            const unwrappedFlatTokens =
                unwrapFlatTokensFromRootChildren(rootChildren);

            if (next === "regular") {
                const flatTokens =
                    unwrappedFlatTokens ??
                    materializeFlatTokensArray(rootChildren);
                chapter.lexicalState.root.children =
                    groupFlatNodesIntoParagraphContainers(
                        flatTokens,
                        direction,
                    );
            } else {
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

    function initializeEditor(editor: LexicalEditor) {
        if (initializationRef.current) return;
        initializationRef.current = true;
        setEditorMode(resolvedEditorMode, { isInitialLoad: true, editor });
    }

    return {
        setEditorMode,
        initializeEditor,
    };
}
