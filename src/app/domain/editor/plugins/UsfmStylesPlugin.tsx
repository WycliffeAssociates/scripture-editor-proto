import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useMutationObserver } from "@mantine/hooks";
import { useEffect, useRef } from "react";

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
                    let newDyamicStyles: string = ``;
                    const el = mutation.target as HTMLElement;
                    const viewState = el.getAttribute("data-marker-view-state");

                    // only proceed if different from current
                    if (markerViewStateRef.current === viewState) {
                        return;
                    }
                    markerViewStateRef.current = viewState || "";
                    const container = document.querySelector(
                        '[data-js="editor-container"] p',
                    );
                    if (container) {
                        const children = container.children;
                        const brSegments: HTMLElement[][] = Array.from(
                            children,
                        ).reduce((acc, child) => {
                            if (child.tagName === "BR") {
                                acc.push([] as HTMLElement[]);
                            } else {
                                acc.at(-1)?.push(child as HTMLElement);
                            }
                            return acc;
                        }, [] as HTMLElement[][]);

                        brSegments.forEach((segment) => {
                            //  find the first element of data-show='true' and has a data-in-para of q, q1, q2, q3, q4
                            const firstVisible =
                                viewState === "never"
                                    ? getFirstPoetryMarkerWithDataShow(segment)
                                    : getFirstPoetryMarkerInBrSegment(segment);
                            if (firstVisible) {
                                const dataPoetry =
                                    firstVisible.getAttribute("data-in-para") ||
                                    firstVisible.getAttribute("data-marker");
                                if (dataPoetry) {
                                    let amount: string;
                                    switch (dataPoetry) {
                                        case "q1":
                                        case "q":
                                            amount = "8px";
                                            break;
                                        case "q2":
                                            amount = "32px";
                                            break;
                                        case "q3":
                                            amount = "48px";
                                            break;
                                        case "q4":
                                            amount = "64px";
                                            break;
                                        default:
                                            amount = "0";
                                    }
                                    newDyamicStyles += `[data-id="${firstVisible.getAttribute("data-id")}"] { margin-inline-start: ${amount}; }\n`;
                                    // firstVisible.style.marginInlineStart =
                                    //     amount;

                                    // elsWithStylesApplied.current.push(
                                    //     firstVisible,
                                    // );
                                }
                            }
                        });
                    }
                    console.timeEnd("usfmStylesPluginMutation");
                    dynamicCssStyleSheet.replaceSync(newDyamicStyles);
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
