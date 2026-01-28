import type { LexicalEditor } from "lexical";
import { useRef } from "react";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import {
    adjustSerializedLexicalNodes,
    flattenParagraphContainersToFlatTokens,
    groupFlatTokensIntoParagraphContainers,
} from "@/app/domain/editor/utils/modeAdjustments.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { updateDomClassListWithMarkerViewState } from "./utils/domUtils.ts";

export type UseModeSwitchingHook = ReturnType<typeof useModeSwitching>;

type adjustWysiModeArgs = {
    markersViewState?: EditorMarkersViewState;
    markersMutableState?: EditorMarkersMutableState;
    duringLoad?: boolean;
    editor?: LexicalEditor;
};

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

    function toggleToSourceMode(args?: {
        isInitialLoad?: boolean;
        editor?: LexicalEditor;
    }) {
        const { isInitialLoad = false, editor } = args || {};

        const inProgress = isInitialLoad
            ? undefined
            : saveCurrentDirtyLexical();

        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        for (const { file, chapter } of walkChapters(filesToUse)) {
            // Use tree→flat conversion: flatten paragraph containers to flat tokens
            const flatTokens = flattenParagraphContainersToFlatTokens(
                chapter.lexicalState.root.children,
                { show: true, isMutable: true },
            );
            chapter.lexicalState.root.children = flatTokens;
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
            mode: "source",
            markersMutableState: "mutable",
            markersViewState: EditorMarkersViewStates.ALWAYS,
        });
        updateDomClassListWithMarkerViewState({
            viewState: EditorMarkersViewStates.ALWAYS,
            mutableState: "mutable",
            isSourceMode: true,
        });
    }

    function adjustWysiwygMode(args: adjustWysiModeArgs) {
        const isSwitchingFromSource = appSettings.mode === "source";

        const inProgress = args.duringLoad
            ? undefined
            : saveCurrentDirtyLexical();

        const markerViewState =
            args.markersViewState || appSettings.markersViewState;
        const markersMutableState =
            markerViewState === EditorMarkersViewStates.NEVER
                ? EditorMarkersMutableStates.IMMUTABLE
                : args.markersMutableState ||
                  appSettings.markersMutableState ||
                  EditorMarkersMutableStates.MUTABLE;

        const hide =
            markerViewState === EditorMarkersViewStates.NEVER ||
            markerViewState === EditorMarkersViewStates.WHEN_EDITING;

        const isMutable =
            markerViewState === EditorMarkersViewStates.NEVER
                ? EditorMarkersMutableStates.IMMUTABLE
                : markersMutableState;

        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        for (const { file, chapter } of walkChapters(filesToUse)) {
            const showValue = !hide;
            const isMutableValue =
                isMutable === EditorMarkersMutableStates.MUTABLE;

            if (isSwitchingFromSource) {
                // Use flat→tree conversion: rebuild paragraph containers from flat tokens
                const direction = chapter.lexicalState.root.direction ?? "ltr";
                const paragraphContainers =
                    groupFlatTokensIntoParagraphContainers(
                        chapter.lexicalState.root.children,
                        direction as "ltr" | "rtl",
                    );
                // Apply show/mutable adjustments to children within containers
                for (const container of paragraphContainers) {
                    if (
                        "children" in container &&
                        Array.isArray(container.children)
                    ) {
                        container.children = container.children.flatMap(
                            (child) =>
                                adjustSerializedLexicalNodes(child, {
                                    show: showValue,
                                    isMutable: isMutableValue,
                                }),
                        );
                    }
                }
                chapter.lexicalState.root.children = paragraphContainers;
            } else {
                // Already in paragraph-tree structure, just adjust show/mutable
                const rootChildren = chapter.lexicalState.root.children.flatMap(
                    (node) => {
                        return adjustSerializedLexicalNodes(node, {
                            show: showValue,
                            isMutable: isMutableValue,
                        });
                    },
                );
                chapter.lexicalState.root.children = rootChildren;
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
                args.editor,
            );
        }

        updateAppSettings({
            markersViewState: markerViewState,
            markersMutableState: markersMutableState,
            mode: "wysiwyg",
        });
        updateDomClassListWithMarkerViewState({
            viewState: markerViewState,
            mutableState: markersMutableState,
            isSourceMode: false,
        });
    }

    function initializeEditor(editor: LexicalEditor) {
        if (initializationRef.current) return;
        initializationRef.current = true;

        if (appSettings.mode === "source") {
            toggleToSourceMode({ isInitialLoad: true, editor });
        } else {
            adjustWysiwygMode({
                markersMutableState: appSettings.markersMutableState,
                markersViewState: appSettings.markersViewState,
                duringLoad: true,
                editor,
            });
        }
    }

    return {
        toggleToSourceMode,
        adjustWysiwygMode,
        initializeEditor,
    };
}
