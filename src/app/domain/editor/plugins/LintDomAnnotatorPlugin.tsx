import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DATA_JS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/LintDomOverlay.css.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type OverlayEntry = {
    key: string;
    height: number;
    left: number;
    dataId: string | null;
    dataSid: string | null;
    top: number;
    width: number;
};

function escapeCssValue(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isRenderedElement(el: HTMLElement): boolean {
    return Boolean(
        el.offsetWidth || el.offsetHeight || el.getClientRects().length,
    );
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

function findVisibleSiblingTarget(direct: HTMLElement): HTMLElement | null {
    const tokenType = direct.getAttribute("data-token-type");
    const isHiddenMarkerTarget =
        tokenType === "marker" || tokenType === "endMarker";
    if (!isHiddenMarkerTarget) return direct;

    const acceptableTokenTypes = new Set(["numberRange", "text"]);
    let probe = direct.nextElementSibling as HTMLElement | null;

    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.nextElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElement(probe)
        ) {
            return probe;
        }
        probe = probe.nextElementSibling as HTMLElement | null;
    }

    probe = direct.previousElementSibling as HTMLElement | null;
    while (probe) {
        if (probe.tagName === "BR") {
            probe = probe.previousElementSibling as HTMLElement | null;
            continue;
        }
        const probeTokenType = probe.getAttribute("data-token-type");
        if (
            probeTokenType &&
            acceptableTokenTypes.has(probeTokenType) &&
            isRenderedElement(probe)
        ) {
            return probe;
        }
        probe = probe.previousElementSibling as HTMLElement | null;
    }

    return direct;
}

function measureTextContentRect(element: HTMLElement): DOMRect | null {
    const textContent = element.textContent?.trim();
    if (!textContent) return null;
    const ownerDocument = element.ownerDocument;
    const range = ownerDocument.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    if (!rect.width && !rect.height) return null;
    return rect;
}

function findBestVisibleTarget(
    root: HTMLElement,
    candidate: string,
): HTMLElement | null {
    const selector = `[data-id="${escapeCssValue(candidate)}"]`;
    const directMatches = Array.from(
        root.querySelectorAll(selector),
    ) as HTMLElement[];
    if (directMatches.length > 0) {
        for (const match of directMatches) {
            const visible = isRenderedElement(match)
                ? match
                : findVisibleSiblingTarget(match);
            if (visible && isRenderedElement(visible)) return visible;
        }
    }

    const sidSelector = `[data-sid="${escapeCssValue(candidate)}"]`;
    const sidMatches = Array.from(
        root.querySelectorAll(sidSelector),
    ) as HTMLElement[];
    if (sidMatches.length > 0) {
        const preferred = sidMatches.find(
            (el) =>
                isRenderedElement(el) &&
                el.getAttribute("data-token-type") === "numberRange",
        );
        if (preferred) return preferred;

        const visible = sidMatches.find((el) => isRenderedElement(el));
        if (visible) return visible;
    }

    return null;
}

function issueCandidates(issue: LintIssue): string[] {
    const candidates: string[] = [];
    if (issue.tokenId) candidates.push(issue.tokenId);
    if (issue.relatedTokenId) candidates.push(issue.relatedTokenId);
    if (issue.sid) candidates.push(issue.sid);
    return candidates;
}

function resolveOverlayEntries(root: HTMLElement, issues: LintIssue[]) {
    const grouped = new Map<HTMLElement, LintIssue[]>();

    for (const issue of issues) {
        let target: HTMLElement | null = null;
        for (const candidate of issueCandidates(issue)) {
            target = findBestVisibleTarget(root, candidate);
            if (target) break;
        }
        if (!target) continue;
        const previous = grouped.get(target);
        if (previous) {
            previous.push(issue);
        } else {
            grouped.set(target, [issue]);
        }
    }

    const scrollParent = findScrollContainer(root.parentElement ?? root);
    const scrollRect = scrollParent.getBoundingClientRect();
    const scrollOffsetLeft = scrollParent.clientLeft;
    const scrollOffsetTop = scrollParent.clientTop;
    const entries: OverlayEntry[] = [];
    for (const [element, elementIssues] of grouped.entries()) {
        const rect =
            measureTextContentRect(element) ?? element.getBoundingClientRect();
        entries.push({
            key:
                element.getAttribute("data-id") ??
                element.getAttribute("data-sid") ??
                `${rect.left}:${rect.top}:${elementIssues.length}`,
            dataId: element.getAttribute("data-id"),
            dataSid: element.getAttribute("data-sid"),
            height: rect.height,
            left:
                rect.left -
                scrollRect.left +
                scrollParent.scrollLeft -
                scrollOffsetLeft,
            top:
                rect.top -
                scrollRect.top +
                scrollParent.scrollTop -
                scrollOffsetTop,
            width: rect.width,
        });
    }

    return entries;
}

/**
 * Lint overlay renderer for the live scripture editor.
 *
 * This plugin does not rely on lint state stored on the Lexical node. It
 * traverses the rendered DOM, finds the most sensible visible target for each
 * lint issue, and paints an absolutely positioned overlay on top of that node.
 */
export function LintDomAnnotatorPlugin() {
    const { lint } = useWorkspaceContext();
    const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    const [entries, setEntries] = useState<OverlayEntry[]>([]);

    useEffect(() => {
        const nextRoot = document.querySelector(
            `[data-js="${DATA_JS.editorContainer}"]`,
        ) as HTMLElement | null;
        setRootEl(nextRoot);
        setScrollParent(
            nextRoot
                ? findScrollContainer(nextRoot.parentElement ?? nextRoot)
                : null,
        );
    }, []);

    useEffect(() => {
        if (!rootEl || !scrollParent) return;

        let rafId = 0;
        const schedule = () => {
            window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
                setEntries(resolveOverlayEntries(rootEl, lint.messages));
            });
        };

        schedule();

        const mutationObserver = new MutationObserver(schedule);
        mutationObserver.observe(rootEl, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
        });

        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(rootEl);
        resizeObserver.observe(scrollParent);

        scrollParent?.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);

        return () => {
            window.cancelAnimationFrame(rafId);
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            scrollParent?.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
        };
    }, [lint.messages, rootEl, scrollParent]);

    const rendered = useMemo(() => {
        if (!rootEl || entries.length === 0) return null;
        return (
            <div className={styles.host} aria-hidden="true">
                {entries.map((entry) => (
                    <span
                        key={entry.key}
                        className={styles.item}
                        data-js={DATA_JS.lintDomOverlayHitpoint}
                        data-id={entry.dataId ?? undefined}
                        data-sid={entry.dataSid ?? undefined}
                        style={{
                            height: `${Math.max(entry.height, 12)}px`,
                            left: `${entry.left}px`,
                            top: `${entry.top}px`,
                            width: `${Math.max(entry.width, 12)}px`,
                        }}
                    />
                ))}
            </div>
        );
    }, [entries, rootEl]);

    if (!rootEl || !rendered) return null;
    return createPortal(rendered, scrollParent ?? rootEl);
}
