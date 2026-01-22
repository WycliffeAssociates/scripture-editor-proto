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

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.getAttribute("data-is-lint-error") !== "true") return;

            const nodeId = target.getAttribute("data-id");
            if (!nodeId) return;

            const errorsForNode = allLintMessages.filter(
                (error) => error.nodeId === nodeId,
            );
            if (errorsForNode.length === 0) return;

            const rect = target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            if (showTimeout) window.clearTimeout(showTimeout);

            showTimeout = window.setTimeout(() => {
                setHoveredErrors(errorsForNode);
                setTooltipPosition({ x, y });
            }, 100);
        };

        const handleMouseOut = () => {
            if (showTimeout) {
                window.clearTimeout(showTimeout);
                showTimeout = null;
            }
            setHoveredErrors(null);
            setTooltipPosition(null);
        };

        document.addEventListener("mouseover", handleMouseOver);
        document.addEventListener("mouseout", handleMouseOut);

        return () => {
            if (showTimeout) window.clearTimeout(showTimeout);
            document.removeEventListener("mouseover", handleMouseOver);
            document.removeEventListener("mouseout", handleMouseOut);
        };
    }, [allLintMessages]);

    return { hoveredErrors, tooltipPosition };
}
