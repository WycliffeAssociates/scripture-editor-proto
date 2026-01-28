import { useThrottledCallback } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import {
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
    EditorModes,
} from "@/app/data/editor.ts";
import { getPoetryStylesAsCssStyleSheet } from "@/app/ui/effects/usfmDynamicStyles/calcStyles.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function UsfmStylesPlugin() {
    const { project } = useWorkspaceContext();

    const { mode } = project.appSettings;
    const { markersViewState, markersMutableState } = project.appSettings;

    const isUsfmMode =
        mode === EditorModes.WYSIWYG &&
        markersViewState === EditorMarkersViewStates.ALWAYS &&
        markersMutableState === EditorMarkersMutableStates.MUTABLE;
    // Using useRef to hold the stylesheet instance to avoid re-creation on re-renders.
    const dynamicCssStyleSheet = useRef(new CSSStyleSheet()).current;
    const prevStyles = useRef<string>("");

    // The core logic for updating styles is wrapped in a throttled callback.
    // The wait time of 200ms can be adjusted based on your needs.
    const throttledUpdateStyles = useThrottledCallback(() => {
        // console.time("usfmStylesPluginMutation");
        // Dynamic indentation helpers are USFM-mode-only.
        if (!isUsfmMode) {
            if (prevStyles.current !== "") {
                dynamicCssStyleSheet.replaceSync("");
                prevStyles.current = "";
            }
            return;
        }

        const rootEl = document.getElementById("root");
        const viewState = rootEl?.getAttribute(
            "data-marker-view-state",
        ) as EditorMarkersViewState | null;

        const styles = getPoetryStylesAsCssStyleSheet(
            viewState as EditorMarkersViewState,
        );

        if (styles && styles !== prevStyles.current) {
            dynamicCssStyleSheet.replaceSync(styles);
            prevStyles.current = styles;
        }

        // console.timeEnd("usfmStylesPluginMutation");
    }, 200);

    useEffect(() => {
        // Ensure we don't leak USFM-only dynamic styles into Regular/Raw modes.
        if (!isUsfmMode && prevStyles.current !== "") {
            dynamicCssStyleSheet.replaceSync("");
            prevStyles.current = "";
        }
    }, [dynamicCssStyleSheet, isUsfmMode]);

    useEffect(() => {
        // Adopt the stylesheet for the document.
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            dynamicCssStyleSheet,
        ];

        // The target node is the editor container.
        const targetNode = document.querySelector("body") as HTMLElement;

        if (!targetNode) {
            return;
        }

        if (!isUsfmMode) {
            return;
        }

        // The observer calls the throttled function on any mutation.
        const observer = new MutationObserver(throttledUpdateStyles);

        // Configuration to watch for a wide range of changes in the subtree.
        const config = {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true, // Also observe changes to text content.
        };

        observer.observe(targetNode, config);

        // Disconnect the observer on cleanup.
        return () => observer.disconnect();
    }, [dynamicCssStyleSheet, isUsfmMode, throttledUpdateStyles]);

    return null;
}
