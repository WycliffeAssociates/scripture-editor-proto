import type { LexicalEditor } from "lexical";
import { useRef } from "react";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { adjustSerializedLexicalNodes } from "@/app/domain/editor/utils/modeAdjustments.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { parseUSFMChapter } from "@/core/domain/usfm/parse.ts";
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
    appSettings: any;
    updateAppSettings: (newSettings: any) => void;
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
            const rootChildren = chapter.lexicalState.root.children.flatMap(
                (node) => {
                    return adjustSerializedLexicalNodes(node, {
                        show: true,
                        isMutable: true,
                        flattenNested: true,
                    });
                },
            );
            chapter.lexicalState.root.children = rootChildren;
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
                : args.markersMutableState || appSettings.markersMutableState;

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
            if (isSwitchingFromSource) {
                const usfm = serializeToUsfmString(
                    chapter.lexicalState.root.children,
                );
                const parsedChapters = parseUSFMChapter(
                    usfm,
                    file.bookCode,
                ).usfm;
                const parsedTokens = Object.values(parsedChapters).flat();
                chapter.lexicalState = parsedUsfmTokensToJsonLexicalNode(
                    parsedTokens,
                    chapter.lexicalState.root.direction || "ltr",
                );
            }

            const rootChildren = chapter.lexicalState.root.children.flatMap(
                (node) => {
                    return adjustSerializedLexicalNodes(node, {
                        show: !hide,
                        isMutable:
                            isMutable === EditorMarkersMutableStates.MUTABLE,
                    });
                },
            );
            if (
                chapter.chapNumber === currentChapter &&
                file.bookCode === currentFileBibleIdentifier
            ) {
                thisChapterUpdated = chapter;
            }
            chapter.lexicalState.root.children = rootChildren;
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
