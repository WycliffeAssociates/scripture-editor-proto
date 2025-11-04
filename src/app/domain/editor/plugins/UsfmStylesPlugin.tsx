import { useThrottledCallback } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import type { EditorMarkersViewState } from "@/app/data/editor";
import { getPoetryStylesAsCssStyleSheet } from "@/app/ui/effects/usfmDynamicStyles/calcStyles";

export function UsfmStylesPlugin() {
    // Using useRef to hold the stylesheet instance to avoid re-creation on re-renders.
    const dynamicCssStyleSheet = useRef(new CSSStyleSheet()).current;
    const prevStyles = useRef<string>("");

    // The core logic for updating styles is wrapped in a throttled callback.
    // The wait time of 200ms can be adjusted based on your needs.
    const throttledUpdateStyles = useThrottledCallback(() => {
        console.time("usfmStylesPluginMutation");

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

        console.timeEnd("usfmStylesPluginMutation");
    }, 300);

    useEffect(() => {
        // Adopt the stylesheet for the document.
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            dynamicCssStyleSheet,
        ];

        // The target node is the editor container.
        const targetNode = document.querySelector("#root") as HTMLElement;

        if (!targetNode) {
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
    }, [dynamicCssStyleSheet, throttledUpdateStyles]);

    return null;
}
