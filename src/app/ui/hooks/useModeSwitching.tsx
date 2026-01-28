import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { useRef } from "react";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
    adjustSerializedLexicalNodes,
    flattenParagraphContainersToFlatTokens,
    groupFlatTokensIntoParagraphContainers,
    wrapFlatTokensInLexicalParagraph,
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
            // Use tree→flat conversion: flatten paragraph containers to flat tokens.
            // If we're already in Source mode shape (root -> paragraph -> flat tokens),
            // unwrap that paragraph to avoid stacking wrappers.
            const rootChildren = chapter.lexicalState.root
                .children as SerializedLexicalNode[];
            const alreadyWrappedFlatTokens =
                unwrapFlatTokensFromRootChildren(rootChildren);

            const flatTokens = alreadyWrappedFlatTokens
                ? alreadyWrappedFlatTokens
                : flattenParagraphContainersToFlatTokens(rootChildren, {
                      show: true,
                      isMutable: true,
                  });

            // Root can only contain Element/Decorator nodes; wrap flat tokens.
            const direction = (chapter.lexicalState.root.direction ?? "ltr") as
                | "ltr"
                | "rtl";
            chapter.lexicalState.root.children = [
                wrapFlatTokensInLexicalParagraph(flatTokens, direction),
            ];
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

        // Regular (hidden markers) uses paragraph containers; visible-markers WYSIWYG uses a flat token stream.
        const targetWantsFlatStream =
            markerViewState === EditorMarkersViewStates.ALWAYS;

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

            const direction = (chapter.lexicalState.root.direction ?? "ltr") as
                | "ltr"
                | "rtl";
            const rootChildren = chapter.lexicalState.root
                .children as SerializedLexicalNode[];
            const unwrappedFlatTokens =
                unwrapFlatTokensFromRootChildren(rootChildren);
            const isCurrentlyFlatWrapped = unwrappedFlatTokens !== null;

            if (targetWantsFlatStream) {
                // Tree→flat conversion: USFM (visible markers) stays a flat stream like Source mode.
                const flatTokensRaw =
                    unwrappedFlatTokens ??
                    flattenParagraphContainersToFlatTokens(rootChildren, {
                        show: showValue,
                        isMutable: isMutableValue,
                    });

                const adjustedFlatTokens = flatTokensRaw.flatMap((node) =>
                    adjustSerializedLexicalNodes(node, {
                        show: showValue,
                        isMutable: isMutableValue,
                    }),
                );

                // Root can only contain Element/Decorator nodes; wrap flat tokens.
                chapter.lexicalState.root.children = [
                    wrapFlatTokensInLexicalParagraph(
                        adjustedFlatTokens,
                        direction,
                    ),
                ];
            } else if (
                isCurrentlyFlatWrapped ||
                appSettings.mode === "source"
            ) {
                // Flat→tree conversion: rebuild paragraph containers for Regular mode.
                const flatTokens =
                    unwrappedFlatTokens ??
                    materializeFlatTokensArray(rootChildren);
                const paragraphContainers =
                    groupFlatTokensIntoParagraphContainers(
                        flatTokens,
                        direction,
                    );
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
                // Already in paragraph-tree structure, just adjust show/mutable.
                chapter.lexicalState.root.children = rootChildren.flatMap(
                    (node) =>
                        adjustSerializedLexicalNodes(node, {
                            show: showValue,
                            isMutable: isMutableValue,
                        }),
                );
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
