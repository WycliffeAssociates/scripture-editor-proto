import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

function getMarkerChipLabel(marker: string): string {
    switch (marker) {
        case "b":
            return t`Intentional Line Break`;
        case "m":
            return t`Margin`;
        case "p":
            return t`Paragraph`;
        case "q":
            return t`Poetry 1`;
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
        case "s2":
        case "s3":
        case "s4":
            return t`Section Title`;
        case "s5":
            return t`S5 chunk marker`;
        default:
            return t`Marker`;
    }
}

export function StructuralEmptyMarkerChipsPlugin() {
    const [editor] = useLexicalComposerContext();
    const { project } = useWorkspaceContext();
    const { i18n } = useLingui();

    const editorMode = project?.appSettings.editorMode ?? "regular";

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Ensure we re-run when locale changes.
        const currentLocale = i18n.locale;
        void currentLocale;

        const updateChips = () => {
            if (editorMode !== "regular") return;
            const root = editor.getRootElement();
            if (!root) return;

            const stale = root.querySelectorAll<HTMLElement>(
                ".usfm-para-container[data-marker-label]",
            );
            for (const el of stale) {
                if (el.dataset.isStructuralEmpty === "true") continue;
                delete el.dataset.markerLabel;
                // Avoid leaving stale tooltips behind.
                if (el.title) {
                    el.title = "";
                }
            }

            const els = root.querySelectorAll<HTMLElement>(
                '.usfm-para-container[data-is-structural-empty="true"][data-marker]',
            );

            for (const el of els) {
                const marker = el.dataset.marker;
                if (!marker) continue;

                const label = getMarkerChipLabel(marker) || `\\${marker}`;
                el.dataset.markerLabel = label;
                const title = t`Empty ${label}. Type to add text, or press Enter to insert below.`;
                el.title = title;
                el.setAttribute("aria-label", title);
            }
        };

        updateChips();
        const unregister = editor.registerUpdateListener(() => {
            updateChips();
        });

        return () => {
            unregister();
        };
    }, [editor, editorMode, i18n]);

    return null;
}
