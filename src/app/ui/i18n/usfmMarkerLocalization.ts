import { t } from "@lingui/core/macro";

/**
 * Shared marker-name localization for UI surfaces that need to explain USFM
 * structure in plain language. Keep this in one place so toolbar labels,
 * frontmatter forms, and marker chips do not drift apart.
 */
export function getLocalizedUsfmMarkerLabel(marker: string): string {
    switch (marker) {
        case "id":
            return t`Book identifiers`;
        case "ide":
            return t`Character encoding`;
        case "h":
            return t`Running header`;
        case "toc1":
            return t`Long table of contents title`;
        case "toc2":
            return t`Short table of contents title`;
        case "toc3":
            return t`Book abbreviation`;
        case "mt":
        case "mt1":
            return t`Main title`;
        case "mt2":
            return t`Main title 2`;
        case "mt3":
            return t`Main title 3`;
        case "mt4":
            return t`Main title 4`;
        case "c":
            return t`Chapter`;
        case "cl":
            return t`Chapter label`;
        case "v":
            return t`Verse`;
        case "b":
            return t`Intentional line break`;
        case "m":
            return t`Non-indented paragraph`;
        case "p":
            return t`Paragraph`;
        case "q":
        case "q1":
            return t`Poetry 1`;
        case "q2":
            return t`Poetry 2`;
        case "q3":
            return t`Poetry 3`;
        case "q4":
            return t`Poetry 4`;
        case "s":
        case "s1":
            return t`Section title`;
        case "s2":
            return t`Section title 2`;
        case "s3":
            return t`Section title 3`;
        case "s4":
            return t`Section title 4`;
        case "s5":
            return t`S5 chunk marker`;
        case "f":
            return t`Footnote`;
        case "x":
            return t`Cross reference`;
        default:
            return `\\${marker}`;
    }
}

export function getLocalizedUsfmMarkerDescription(
    marker: string,
): string | null {
    switch (marker) {
        case "id":
            return t`Standard 3-character scripture book identifier plus optional description.`;
        case "ide":
            return t`Character encoding scheme used for the file contents.`;
        case "h":
            return t`Short book name shown in running headers.`;
        case "toc1":
            return t`Long book name for the table of contents.`;
        case "toc2":
            return t`Short book name for the table of contents.`;
        case "toc3":
            return t`Abbreviated book name.`;
        case "mt":
        case "mt1":
        case "mt2":
        case "mt3":
        case "mt4":
            return t`Major title shown before the scripture text begins.`;
        default:
            return null;
    }
}
