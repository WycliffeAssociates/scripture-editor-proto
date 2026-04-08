import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { getLocalizedUsfmMarkerLabel } from "@/app/ui/i18n/usfmMarkerLocalization.ts";

/**
 * Annotates structurally empty paragraph containers with a visible label/tooltip in
 * regular mode so blank-but-significant USFM structure remains discoverable.
 */
export function StructuralEmptyMarkerChipsPlugin() {
    const [editor] = useLexicalComposerContext();
    const { project } = useWorkspaceContext();
    const { i18n } = useLingui();

    const editorMode = project?.appSettings.editorMode ?? EDITOR_MODES.regular;

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Ensure we re-run when locale changes.
        const currentLocale = i18n.locale;
        void currentLocale;

        const updateChips = () => {
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

            if (editorMode !== EDITOR_MODES.regular) {
                const labeled = root.querySelectorAll<HTMLElement>(
                    ".usfm-para-container[data-marker-label]",
                );
                for (const el of labeled) {
                    delete el.dataset.markerLabel;
                    if (el.title) {
                        el.title = "";
                    }
                }
                return;
            }

            const els = root.querySelectorAll<HTMLElement>(
                '.usfm-para-container[data-is-structural-empty="true"][data-marker]',
            );

            for (const el of els) {
                const marker = el.dataset.marker;
                if (!marker) continue;

                const label =
                    getLocalizedUsfmMarkerLabel(marker) || `\\${marker}`;
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
