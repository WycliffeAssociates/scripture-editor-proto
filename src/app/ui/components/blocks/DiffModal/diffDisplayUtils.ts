import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { ChapterRenderToken } from "@/app/domain/project/diffTypes.ts";

export function isStructuralGlueMarker(marker?: string): boolean {
    return Boolean(marker) && marker !== "lb";
}

export function shouldHideStructuralLineBreak(args: {
    showUsfmMarkers: boolean;
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    previousToken?: ChapterRenderToken;
}): boolean {
    if (args.showUsfmMarkers) return false;
    if (args.tokenChange !== "unchanged") return false;
    const previousToken = args.previousToken;
    if (!previousToken) return false;
    if (previousToken.tokenType !== "marker") return false;
    if (!isSerializedUSFMTextNode(previousToken.node)) return false;
    return isStructuralGlueMarker(previousToken.marker);
}

export function toRegularModeDisplayTextPreservingWhitespace(
    value: string,
): string {
    // Hide structural marker->linebreak glue from pretty-formatted USFM while
    // preserving meaningful linebreaks and explicit \\lb linebreak markers.
    const withoutStructuralGlue = value.replace(
        /\\(?!lb\b)[A-Za-z][A-Za-z0-9]*\*?[ \t]*\n/g,
        (match) => match.replace(/\n$/, ""),
    );
    return withoutStructuralGlue
        .replace(/\\[A-Za-z][A-Za-z0-9]*\*/g, "")
        .replace(/\\[A-Za-z][A-Za-z0-9]*/g, "");
}
