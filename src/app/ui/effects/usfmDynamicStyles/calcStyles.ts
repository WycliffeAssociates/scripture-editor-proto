import type { EditorMarkersViewState } from "@/app/data/editor";

export function getPoetryStylesAsCssStyleSheet(
    markerViewState: EditorMarkersViewState,
) {
    const container = document.querySelector('[data-js="editor-container"] p');
    if (!container) return;
    let styles: string = "";
    const children = container.children;
    const brSegments: HTMLElement[][] = Array.from(children).reduce(
        (acc, child) => {
            if (child.tagName === "BR") {
                acc.push([] as HTMLElement[]);
            } else {
                acc.at(-1)?.push(child as HTMLElement);
            }
            return acc;
        },
        [] as HTMLElement[][],
    );
    brSegments.forEach((segment) => {
        //  find the first element of data-show='true' and has a data-in-para of q, q1, q2, q3, q4
        const firstVisible =
            markerViewState === "never"
                ? getFirstPoetryMarkerWithDataShow(segment)
                : getFirstPoetryMarkerInBrSegment(segment);
        if (firstVisible) {
            const isNumberRange =
                firstVisible.getAttribute("data-token-type") === "numberRange";
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
                const line = `[data-id="${firstVisible.getAttribute(
                    "data-id",
                )}"] { padding-inline-start: ${amount}; ${
                    isNumberRange
                        ? `margin-inline-start: -${firstVisible.textContent?.length}ch`
                        : ""
                } }\n`;
                styles += line;
            }
        }
    });
    return styles;
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
