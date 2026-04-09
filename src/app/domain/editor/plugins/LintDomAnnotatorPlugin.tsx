import type { LexicalEditor } from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
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

type DomLookup = {
    byDataId: Map<string, HTMLElement[]>;
    bySid: Map<string, HTMLElement[]>;
    renderedState: WeakMap<HTMLElement, boolean>;
};

const LINT_HITPOINT_ATTR = "data-lint-hitpoint";

function isRenderedElement(el: HTMLElement): boolean {
    return Boolean(
        el.offsetWidth || el.offsetHeight || el.getClientRects().length,
    );
}

function isRenderedElementCached(
    cache: WeakMap<HTMLElement, boolean>,
    el: HTMLElement,
): boolean {
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    const next = isRenderedElement(el);
    cache.set(el, next);
    return next;
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

function getDocumentScrollElement(element: HTMLElement): HTMLElement {
    return (element.ownerDocument.scrollingElement ??
        element.ownerDocument.documentElement) as HTMLElement;
}

function findVisibleSiblingTarget(
    direct: HTMLElement,
    renderedState: WeakMap<HTMLElement, boolean>,
): HTMLElement | null {
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
            isRenderedElementCached(renderedState, probe)
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
            isRenderedElementCached(renderedState, probe)
        ) {
            return probe;
        }
        probe = probe.previousElementSibling as HTMLElement | null;
    }

    return direct;
}

function buildDomLookup(root: HTMLElement): DomLookup {
    const byDataId = new Map<string, HTMLElement[]>();
    const bySid = new Map<string, HTMLElement[]>();
    const renderedState = new WeakMap<HTMLElement, boolean>();
    const candidates = root.querySelectorAll<HTMLElement>(
        "[data-id], [data-sid]",
    );

    for (const element of candidates) {
        const dataId = element.getAttribute("data-id");
        if (dataId) {
            const previous = byDataId.get(dataId);
            if (previous) {
                previous.push(element);
            } else {
                byDataId.set(dataId, [element]);
            }
        }

        const sid = element.getAttribute("data-sid");
        if (sid) {
            const previous = bySid.get(sid);
            if (previous) {
                previous.push(element);
            } else {
                bySid.set(sid, [element]);
            }
        }
    }

    return { byDataId, bySid, renderedState };
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
    lookup: DomLookup,
    candidate: string,
): HTMLElement | null {
    const directMatches = lookup.byDataId.get(candidate) ?? [];
    if (directMatches.length > 0) {
        for (const match of directMatches) {
            const visible = isRenderedElementCached(lookup.renderedState, match)
                ? match
                : findVisibleSiblingTarget(match, lookup.renderedState);
            if (
                visible &&
                isRenderedElementCached(lookup.renderedState, visible)
            ) {
                return visible;
            }
        }
    }

    const sidMatches = lookup.bySid.get(candidate) ?? [];
    if (sidMatches.length > 0) {
        const preferred = sidMatches.find(
            (el) =>
                isRenderedElementCached(lookup.renderedState, el) &&
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
    const lookup = buildDomLookup(root);
    const grouped = new Map<HTMLElement, LintIssue[]>();
    const hitpoints = new Set<HTMLElement>();

    for (const issue of issues) {
        let target: HTMLElement | null = null;
        for (const candidate of issueCandidates(issue)) {
            target = findBestVisibleTarget(lookup, candidate);
            if (target) break;
        }
        if (!target) continue;
        hitpoints.add(target);
        const previous = grouped.get(target);
        if (previous) {
            previous.push(issue);
        } else {
            grouped.set(target, [issue]);
        }
    }

    const rootRect = root.getBoundingClientRect();
    const rootOffsetLeft = root.clientLeft;
    const rootOffsetTop = root.clientTop;
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
            left: rect.left - rootRect.left + root.scrollLeft - rootOffsetLeft,
            top: rect.top - rootRect.top + root.scrollTop - rootOffsetTop,
            width: rect.width,
        });
    }

    return { entries, hitpoints };
}

function syncHitpointAttributes(
    previous: Set<HTMLElement>,
    next: Set<HTMLElement>,
) {
    for (const element of previous) {
        if (!next.has(element)) {
            element.removeAttribute(LINT_HITPOINT_ATTR);
        }
    }
    for (const element of next) {
        if (!previous.has(element)) {
            element.setAttribute(LINT_HITPOINT_ATTR, "true");
        }
    }
}

function overlayEntriesEqual(
    left: OverlayEntry[],
    right: OverlayEntry[],
): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        const a = left[i];
        const b = right[i];
        if (
            a.key !== b.key ||
            a.dataId !== b.dataId ||
            a.dataSid !== b.dataSid ||
            a.height !== b.height ||
            a.left !== b.left ||
            a.top !== b.top ||
            a.width !== b.width
        ) {
            return false;
        }
    }
    return true;
}

function clearLintOverlayState(
    hitpointsRef: { current: Set<HTMLElement> },
    setEntries: (entries: OverlayEntry[]) => void,
) {
    syncHitpointAttributes(hitpointsRef.current, new Set());
    hitpointsRef.current = new Set();
    setEntries([]);
}

/**
 * Lint overlay renderer for the live scripture editor.
 *
 * This plugin does not rely on lint state stored on the Lexical node. It
 * traverses the rendered DOM, finds the most sensible visible target for each
 * lint issue, and paints an absolutely positioned overlay on top of that node.
 */
type LintDomAnnotatorPluginProps = {
    editor: LexicalEditor;
};

export function LintDomAnnotatorPlugin({
    editor,
}: LintDomAnnotatorPluginProps) {
    const { lint, project } = useWorkspaceContext();
    const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
    const [entries, setEntries] = useState<OverlayEntry[]>([]);
    const hitpointsRef = useRef<Set<HTMLElement>>(new Set());
    const lintMessagesRef = useRef(lint.messages);
    const entriesRef = useRef<OverlayEntry[]>([]);
    const scheduleRef = useRef<((settleAttempts?: number) => void) | null>(
        null,
    );
    const settleAttemptsRef = useRef(0);

    useEffect(() => {
        const editorRoot = editor.getRootElement();
        const nextRoot =
            (editorRoot?.closest(
                `[data-testid="${TESTING_IDS.mainEditorContainer}"]`,
            ) as HTMLElement | null) ??
            (editorRoot?.closest(
                `[data-js="${DATA_JS.editorContainer}"]`,
            ) as HTMLElement | null) ??
            null;
        setRootEl(nextRoot);
    }, [editor]);

    useEffect(() => {
        if (!rootEl) return;

        let rafId = 0;
        const schedule = (settleAttempts = 0) => {
            settleAttemptsRef.current = Math.max(
                settleAttemptsRef.current,
                settleAttempts,
            );
            window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
                const messages = lintMessagesRef.current;
                if (messages.length === 0) {
                    if (
                        hitpointsRef.current.size > 0 ||
                        entriesRef.current.length > 0
                    ) {
                        clearLintOverlayState(hitpointsRef, setEntries);
                        entriesRef.current = [];
                    }
                    settleAttemptsRef.current = 0;
                    return;
                }

                const next = resolveOverlayEntries(rootEl, messages);
                const needsSettledRetry =
                    next.entries.length === 0 &&
                    messages.length > 0 &&
                    settleAttemptsRef.current > 0;
                if (needsSettledRetry) {
                    settleAttemptsRef.current -= 1;
                    schedule(settleAttemptsRef.current);
                    return;
                }

                syncHitpointAttributes(hitpointsRef.current, next.hitpoints);
                hitpointsRef.current = next.hitpoints;
                if (!overlayEntriesEqual(entriesRef.current, next.entries)) {
                    entriesRef.current = next.entries;
                    setEntries(next.entries);
                }
                settleAttemptsRef.current = 0;
            });
        };
        const scheduleWithoutSettling = () => schedule();
        scheduleRef.current = schedule;

        schedule(2);

        const mutationObserver = new MutationObserver((mutations) => {
            const shouldRetryAfterStructuralChange = mutations.some(
                (mutation) => mutation.type === "childList",
            );
            if (
                shouldRetryAfterStructuralChange &&
                lintMessagesRef.current.length > 0
            ) {
                clearLintOverlayState(hitpointsRef, setEntries);
                entriesRef.current = [];
                schedule(2);
                return;
            }
            const shouldReanchor = mutations.some(
                (mutation) => mutation.type === "attributes",
            );
            if (!shouldReanchor) {
                return;
            }
            scheduleWithoutSettling();
        });
        mutationObserver.observe(rootEl, {
            childList: true,
            attributes: true,
            attributeFilter: [
                "class",
                "style",
                "data-id",
                "data-sid",
                "data-token-type",
            ],
            subtree: true,
        });

        const resizeObserver = new ResizeObserver(scheduleWithoutSettling);
        resizeObserver.observe(rootEl);
        const scrollParent = findScrollContainer(
            rootEl.parentElement ?? rootEl,
        );
        if (scrollParent !== rootEl) {
            resizeObserver.observe(scrollParent);
        }

        rootEl.addEventListener("scroll", scheduleWithoutSettling, {
            passive: true,
        });
        scrollParent?.addEventListener("scroll", scheduleWithoutSettling, {
            passive: true,
        });
        const documentScroll = getDocumentScrollElement(rootEl);
        if (documentScroll !== rootEl && documentScroll !== scrollParent) {
            documentScroll.addEventListener("scroll", scheduleWithoutSettling, {
                passive: true,
            });
        }
        window.addEventListener("resize", scheduleWithoutSettling);
        window.addEventListener("scroll", scheduleWithoutSettling, {
            passive: true,
        });

        return () => {
            window.cancelAnimationFrame(rafId);
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            scheduleRef.current = null;
            rootEl.removeEventListener("scroll", scheduleWithoutSettling);
            scrollParent?.removeEventListener(
                "scroll",
                scheduleWithoutSettling,
            );
            if (documentScroll !== rootEl && documentScroll !== scrollParent) {
                documentScroll.removeEventListener(
                    "scroll",
                    scheduleWithoutSettling,
                );
            }
            window.removeEventListener("resize", scheduleWithoutSettling);
            window.removeEventListener("scroll", scheduleWithoutSettling);
            clearLintOverlayState(hitpointsRef, setEntries);
            entriesRef.current = [];
        };
    }, [rootEl]);

    useEffect(() => {
        lintMessagesRef.current = lint.messages;
        clearLintOverlayState(hitpointsRef, setEntries);
        entriesRef.current = [];
        scheduleRef.current?.(2);
    }, [lint.messages]);

    useEffect(() => {
        clearLintOverlayState(hitpointsRef, setEntries);
        entriesRef.current = [];
        scheduleRef.current?.(2);
    }, []);

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
                            left: `${Math.max(entry.left - 18, 0)}px`,
                            top: `${Math.max(entry.top + Math.min(entry.height / 2 - 8, 4), 0)}px`,
                        }}
                    />
                ))}
            </div>
        );
    }, [entries, rootEl]);

    if (!rootEl || !rendered) return null;
    return createPortal(rendered, rootEl);
}
