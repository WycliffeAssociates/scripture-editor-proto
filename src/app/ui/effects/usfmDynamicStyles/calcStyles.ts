import { type EditorMarkersViewState, UsfmTokenTypes } from "@/app/data/editor";

export function getPoetryStylesAsCssStyleSheet(
    markerViewState: EditorMarkersViewState,
) {
    const containers = document.querySelectorAll(
        '[data-js="editor-container"] p',
    );
    if (!containers.length) return;
    if (containers.length > 1) {
    }
    let styles: string = "";
    containers.forEach((container) => {
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
            [[]] as HTMLElement[][],
        );
        brSegments.forEach((segment) => {
            //  find the first element of data-show='true' and has a data-in-para of q, q1, q2, q3, q4
            const firstVisible =
                markerViewState === "never"
                    ? getFirstPoetryMarkerWithDataShow(segment)
                    : getFirstPoetryMarkerInBrSegment(segment);
            if (firstVisible) {
                const isNumberRange =
                    firstVisible.getAttribute("data-token-type") ===
                    "numberRange";
                const dataPoetry =
                    firstVisible.getAttribute("data-marker") ||
                    firstVisible.getAttribute("data-in-para");
                if (dataPoetry) {
                    let amount: string;
                    switch (dataPoetry) {
                        case "q1":
                        case "q":
                            amount = "8px";
                            break;
                        case "q2":
                            amount = "24px";
                            break;
                        case "q3":
                            amount = "40px";
                            break;
                        case "q4":
                            amount = "56px";
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
            segment.forEach((el, idx) => {
                // in this segment, if there are markers not preceeded by a linebreak, they need to be hiddne inline:
                if (idx === 0) return;

                const prevEl = segment[idx - 1];
                // if (prevEl.tagName === "BR") return;
                const isMarker =
                    el.getAttribute("data-token-type") ===
                        UsfmTokenTypes.marker ||
                    el.getAttribute("data-token-type") ===
                        UsfmTokenTypes.endMarker;
                const dataShowIsFalse =
                    el.getAttribute("data-show") === "false";
                if (isMarker && prevEl.tagName !== "BR" && dataShowIsFalse) {
                    styles += `[data-id="${el.getAttribute("data-id")}"] { 
                  width: 0;
                  display: inline-block;
                  line-height: 0;
                  }\n`;
                }
            });
        });
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
