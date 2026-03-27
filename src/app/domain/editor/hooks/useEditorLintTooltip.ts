import { useEffect, useState } from "react";
import { DATA_JS } from "@/app/data/constants.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type TooltipPosition = { x: number; y: number };

export type UseEditorLintTooltipReturn = {
    hoveredErrors: LintIssue[] | null;
    tooltipPosition: TooltipPosition | null;
};

/**
 * Drive the hover tooltip for lint markers rendered inside the editor DOM.
 *
 * Lint issues are attached to token DOM nodes after the lint pass runs. This
 * hook listens at the document level so the tooltip can stay open while the
 * pointer moves between the highlighted token and the overlay itself, without
 * each token needing its own React event wiring.
 */
export function useEditorLintTooltip(
    allLintMessages: LintIssue[],
): UseEditorLintTooltipReturn {
    const [hoveredErrors, setHoveredErrors] = useState<LintIssue[] | null>(
        null,
    );
    const [tooltipPosition, setTooltipPosition] =
        useState<TooltipPosition | null>(null);

    useEffect(() => {
        let showTimeout: number | null = null;
        let hideTimeout: number | null = null;
        const isWithinLintTooltip = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            return Boolean(
                target.closest(`[data-js="${DATA_JS.lintTooltipOverlay}"]`),
            );
        };
        const getLintTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return null;
            return target.closest(
                '[data-is-lint-error="true"]',
            ) as HTMLElement | null;
        };
        const clearHideTimeout = () => {
            if (!hideTimeout) return;
            window.clearTimeout(hideTimeout);
            hideTimeout = null;
        };
        const hideTooltip = () => {
            if (showTimeout) {
                window.clearTimeout(showTimeout);
                showTimeout = null;
            }
            clearHideTimeout();
            setHoveredErrors(null);
            setTooltipPosition(null);
        };

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target;
            if (isWithinLintTooltip(target)) {
                clearHideTimeout();
                return;
            }
            const lintTarget = getLintTarget(target);
            if (!lintTarget) return;
            clearHideTimeout();

            const tokenId = lintTarget.getAttribute("data-id");
            if (!tokenId) return;

            const errorsForNode = allLintMessages.filter(
                (error) =>
                    error.tokenId === tokenId ||
                    error.relatedTokenId === tokenId,
            );
            if (errorsForNode.length === 0) return;

            const rect = lintTarget.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            if (showTimeout) window.clearTimeout(showTimeout);

            showTimeout = window.setTimeout(() => {
                setHoveredErrors(errorsForNode);
                setTooltipPosition({ x, y });
            }, 100);
        };

        const handleMouseOut = (e: MouseEvent) => {
            const related = e.relatedTarget;
            // Keep tooltip open while moving within lint/error surfaces.
            if (isWithinLintTooltip(related) || getLintTarget(related)) {
                return;
            }
            clearHideTimeout();
            hideTimeout = window.setTimeout(() => {
                hideTooltip();
            }, 180);
        };

        document.addEventListener("mouseover", handleMouseOver);
        document.addEventListener("mouseout", handleMouseOut);

        return () => {
            if (showTimeout) window.clearTimeout(showTimeout);
            if (hideTimeout) window.clearTimeout(hideTimeout);
            document.removeEventListener("mouseover", handleMouseOver);
            document.removeEventListener("mouseout", handleMouseOut);
        };
    }, [allLintMessages]);

    return { hoveredErrors, tooltipPosition };
}
