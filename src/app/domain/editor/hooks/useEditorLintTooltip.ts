import { useEffect, useState } from "react";
import type { LintError } from "@/core/data/usfm/lint.ts";

type TooltipPosition = { x: number; y: number };

export type UseEditorLintTooltipReturn = {
    hoveredErrors: LintError[] | null;
    tooltipPosition: TooltipPosition | null;
};

export function useEditorLintTooltip(
    allLintMessages: LintError[],
): UseEditorLintTooltipReturn {
    const [hoveredErrors, setHoveredErrors] = useState<LintError[] | null>(
        null,
    );
    const [tooltipPosition, setTooltipPosition] =
        useState<TooltipPosition | null>(null);

    useEffect(() => {
        let showTimeout: number | null = null;
        let hideTimeout: number | null = null;
        const isWithinLintTooltip = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            return Boolean(target.closest('[data-js="lint-tooltip-overlay"]'));
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

            const nodeId = lintTarget.getAttribute("data-id");
            if (!nodeId) return;

            const errorsForNode = allLintMessages.filter(
                (error) => error.nodeId === nodeId,
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
