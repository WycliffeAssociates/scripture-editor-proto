import { useEffect, useRef, useState } from "react";
import { DATA_JS } from "@/app/data/constants.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type TooltipPosition = { x: number; y: number };
type ScrollSnapshot = {
    left: number;
    top: number;
    element: HTMLElement;
};

export type UseEditorLintTooltipReturn = {
    hoveredErrors: LintIssue[] | null;
    tooltipPosition: TooltipPosition | null;
    onTooltipMouseEnter: () => void;
    onTooltipMouseLeave: () => void;
};

function asHtmlElement(target: EventTarget | null): HTMLElement | null {
    if (target instanceof HTMLElement) return target;
    if (target instanceof Node) {
        return target.parentElement;
    }
    return null;
}

function findScrollContainer(start: HTMLElement): HTMLElement {
    let current: HTMLElement | null = start;
    while (current) {
        const styles = window.getComputedStyle(current);
        const canScrollY =
            /(auto|scroll|overlay)/.test(styles.overflowY) &&
            current.scrollHeight > current.clientHeight;
        const canScrollX =
            /(auto|scroll|overlay)/.test(styles.overflowX) &&
            current.scrollWidth > current.clientWidth;
        if (canScrollY || canScrollX) {
            return current;
        }
        current = current.parentElement;
    }
    return start;
}

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
    const SCROLL_CLOSE_THRESHOLD = 7;
    const [hoveredErrors, setHoveredErrors] = useState<LintIssue[] | null>(
        null,
    );
    const [tooltipPosition, setTooltipPosition] =
        useState<TooltipPosition | null>(null);
    const hoverErrorsRef = useRef<LintIssue[] | null>(null);
    const hideTimeoutRef = useRef<number | null>(null);
    const showTimeoutRef = useRef<number | null>(null);
    const scrollSnapshotRef = useRef<ScrollSnapshot | null>(null);
    const onTooltipMouseEnterRef = useRef<() => void>(() => undefined);
    const onTooltipMouseLeaveRef = useRef<() => void>(() => undefined);

    useEffect(() => {
        const isWithinOverlay = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            return Boolean(
                target.closest(`[data-js="${DATA_JS.lintDomOverlayHitpoint}"]`),
            );
        };
        const isWithinLintTooltip = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return null;
            return target.closest(`[data-js="${DATA_JS.lintTooltipOverlay}"]`);
        };
        const clearHideTimeout = () => {
            if (!hideTimeoutRef.current) return;
            window.clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        };
        const hideTooltip = () => {
            if (showTimeoutRef.current) {
                window.clearTimeout(showTimeoutRef.current);
                showTimeoutRef.current = null;
            }
            clearHideTimeout();
            hoverErrorsRef.current = null;
            setHoveredErrors(null);
            setTooltipPosition(null);
            scrollSnapshotRef.current = null;
        };

        const scheduleHideTooltip = () => {
            clearHideTimeout();
            hideTimeoutRef.current = window.setTimeout(() => {
                hideTooltip();
            }, 180);
        };

        const findErrorsForTarget = (target: HTMLElement) => {
            const tokenId = target.getAttribute("data-id");
            const sid = target.getAttribute("data-sid");

            if (tokenId) {
                const tokenMatches = allLintMessages.filter(
                    (error) =>
                        error.tokenId === tokenId ||
                        error.relatedTokenId === tokenId,
                );
                if (tokenMatches.length > 0) return tokenMatches;
            }

            if (sid) {
                const sidMatches = allLintMessages.filter(
                    (error) => error.sid === sid,
                );
                if (sidMatches.length > 0) return sidMatches;
            }

            return [];
        };

        const handleMouseOver = (e: MouseEvent) => {
            const target = asHtmlElement(e.target);
            if (isWithinLintTooltip(target)) {
                clearHideTimeout();
                return;
            }

            const targetForErrors = target?.closest(
                `[data-js="${DATA_JS.lintDomOverlayHitpoint}"]`,
            ) as HTMLElement | null;
            if (!targetForErrors) return;
            clearHideTimeout();

            const errorsForNode = findErrorsForTarget(targetForErrors);
            if (errorsForNode.length === 0) return;

            const rect = targetForErrors.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            if (showTimeoutRef.current) {
                window.clearTimeout(showTimeoutRef.current);
                showTimeoutRef.current = null;
            }

            showTimeoutRef.current = window.setTimeout(() => {
                hoverErrorsRef.current = errorsForNode;
                setHoveredErrors(errorsForNode);
                setTooltipPosition({ x, y });
                const scrollContainer = findScrollContainer(
                    targetForErrors.parentElement ?? targetForErrors,
                );
                scrollSnapshotRef.current = {
                    element: scrollContainer,
                    left: scrollContainer.scrollLeft,
                    top: scrollContainer.scrollTop,
                };
            }, 100);
        };

        const handleMouseOut = (e: MouseEvent) => {
            const related = e.relatedTarget;
            if (isWithinLintTooltip(related) || isWithinOverlay(related)) {
                return;
            }
            const target = asHtmlElement(e.target);
            if (
                !target?.closest(
                    `[data-js="${DATA_JS.lintDomOverlayHitpoint}"]`,
                ) &&
                !target?.closest(`[data-js="${DATA_JS.lintTooltipOverlay}"]`)
            ) {
                return;
            }
            scheduleHideTooltip();
        };

        const handleScroll = (e: Event) => {
            const snapshot = scrollSnapshotRef.current;
            if (!snapshot || !hoverErrorsRef.current) return;
            const target = e.currentTarget;
            if (!(target instanceof HTMLElement)) return;
            if (target !== snapshot.element) return;

            const deltaLeft = Math.abs(target.scrollLeft - snapshot.left);
            const deltaTop = Math.abs(target.scrollTop - snapshot.top);
            if (Math.max(deltaLeft, deltaTop) > SCROLL_CLOSE_THRESHOLD) {
                hideTooltip();
            }
        };

        const scrollContainers = Array.from(
            document.querySelectorAll<HTMLElement>(
                `[data-js="${DATA_JS.editorScrollContainer}"], [data-js="${DATA_JS.referenceEditorScrollContainer}"]`,
            ),
        );

        document.addEventListener("mouseover", handleMouseOver);
        document.addEventListener("mouseout", handleMouseOut);
        scrollContainers.forEach((container) => {
            container.addEventListener("scroll", handleScroll, {
                passive: true,
            });
        });

        onTooltipMouseEnterRef.current = () => {
            clearHideTimeout();
        };
        onTooltipMouseLeaveRef.current = () => {
            scheduleHideTooltip();
        };

        return () => {
            if (showTimeoutRef.current) {
                window.clearTimeout(showTimeoutRef.current);
                showTimeoutRef.current = null;
            }
            if (hideTimeoutRef.current) {
                window.clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
            document.removeEventListener("mouseover", handleMouseOver);
            document.removeEventListener("mouseout", handleMouseOut);
            scrollContainers.forEach((container) => {
                container.removeEventListener("scroll", handleScroll);
            });
        };
    }, [allLintMessages]);

    return {
        hoveredErrors,
        tooltipPosition,
        onTooltipMouseEnter: () => onTooltipMouseEnterRef.current(),
        onTooltipMouseLeave: () => onTooltipMouseLeaveRef.current(),
    };
}
