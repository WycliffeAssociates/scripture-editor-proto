import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useMutationObserver } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import type { EditorMarkersViewState } from "@/app/data/editor";
import { getPoetryStylesAsCssStyleSheet } from "@/app/ui/effects/usfmDynamicStyles/calcStyles";

export function UsfmStylesPlugin() {
    const elsWithStylesApplied = useRef<HTMLElement[]>([]);
    const markerViewStateRef = useRef<string>("");
    const dynamicCssStyleSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        dynamicCssStyleSheet,
    ];

    const config = {
        attributes: true,
        childList: false,
        subtree: false,
    };
    useEffect(() => {
        const targetNode = document.querySelector("#root") as HTMLElement;
        const observer = new MutationObserver((mutations) => {
            mutations
                .filter((m) => {
                    return (
                        m.type === "attributes" &&
                        m.attributeName === "data-marker-view-state"
                    );
                })
                .forEach((mutation) => {
                    console.time("usfmStylesPluginMutation");
                    console.log("usfmStylesPluginMutation", mutation);
                    const el = mutation.target as HTMLElement;
                    const viewState = el.getAttribute("data-marker-view-state");

                    // only proceed if different from current
                    if (markerViewStateRef.current === viewState) {
                        return;
                    }
                    markerViewStateRef.current = viewState || "";
                    const styles = getPoetryStylesAsCssStyleSheet(
                        viewState as EditorMarkersViewState,
                    );
                    if (styles) {
                        dynamicCssStyleSheet.replaceSync(styles);
                    }
                });
        });
        observer.observe(targetNode, config);
        return () => observer.disconnect();
    }, [dynamicCssStyleSheet.replaceSync]);

    return null;
}

function getFirstPoetryMarkerInBrSegment(segment: HTMLElement[]) {
    return segment.find(
        (el) =>
            el.getAttribute("data-in-para")?.startsWith("q") ||
            el.getAttribute("data-marker")?.startsWith("q"),
    );
}

function getFirstPoetryMarkerWithDataShow(segment: HTMLElement[]) {
    return segment.find(
        (el) =>
            // markers are what get's hidden, so skip them
            !el.getAttribute("data-marker") &&
            (el.getAttribute("data-in-para")?.startsWith("q") ||
                el.getAttribute("data-marker")?.startsWith("q")),
    );
}
