import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type { MatchInNode } from "@/app/ui/hooks/useSearchHighlighter.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchReplaceSuggestOverlay.css.ts";

type SearchSuggestion = MatchInNode & {
    key: string;
    labelText: string;
};

type PositionedSuggestion = SearchSuggestion & {
    x: number;
    y: number;
    width: number;
    height: number;
};

function suggestionKey(match: MatchInNode) {
    return `${match.node.getKey()}:${match.start}:${match.end}`;
}

function getLabelText(match: MatchInNode, textNode: Text) {
    const text = textNode.textContent ?? "";
    if (match.start < 0 || match.end > text.length) return "";
    return text.slice(match.start, match.end);
}

export function SearchReplaceSuggestPlugin() {
    const [editor] = useLexicalComposerContext();
    const { search } = useWorkspaceContext();
    const { currentMatches, isSearchPaneOpen, replaceMatch, replaceTerm } =
        search;
    const [positioned, setPositioned] = useState<PositionedSuggestion[]>([]);
    const [overlayHostEl, setOverlayHostEl] = useState<HTMLElement | null>(
        null,
    );
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const isEnabled =
        isSearchPaneOpen &&
        search.searchTerm.trim().length > 0 &&
        replaceTerm.trim().length > 0 &&
        currentMatches.length > 0;

    const getContainerEl = useCallback((): HTMLElement | null => {
        const root = editor.getRootElement();
        if (!root) return null;
        return root.closest<HTMLElement>('[data-js="editor-container"]');
    }, [editor]);

    const clearCloseTimer = useCallback(() => {
        if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const scheduleClose = useCallback(
        (key: string) => {
            clearCloseTimer();
            closeTimerRef.current = window.setTimeout(() => {
                setActiveKey((current) => (current === key ? null : current));
            }, 3000);
        },
        [clearCloseTimer],
    );

    const recomputePositions = useCallback(() => {
        if (!isEnabled) {
            setPositioned([]);
            return;
        }

        const container = containerRef.current ?? getContainerEl();
        if (!container) return;
        containerRef.current = container;
        const containerRect = container.getBoundingClientRect();

        const next: PositionedSuggestion[] = [];
        for (const match of currentMatches) {
            const domEl = editor.getElementByKey(match.node.getKey());
            if (!domEl) continue;

            const firstChild = domEl.firstChild;
            if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE) continue;
            const textNode = firstChild as Text;
            const labelText = getLabelText(match, textNode);
            if (!labelText) continue;

            const range = document.createRange();
            range.setStart(textNode, match.start);
            range.setEnd(textNode, match.end);
            const rect = range.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) continue;

            next.push({
                ...match,
                key: suggestionKey(match),
                labelText,
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height,
            });
        }

        setPositioned(next);
    }, [currentMatches, editor, getContainerEl, isEnabled]);

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            recomputePositions();
        });
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [recomputePositions]);

    useEffect(() => {
        const container = getContainerEl();
        if (!container) return;
        if (overlayHostEl) return;
        const host = document.createElement("div");
        host.dataset.js = "search-replace-suggest-overlay";
        host.className = styles.overlayHost;
        container.appendChild(host);
        setOverlayHostEl(host);
    }, [getContainerEl, overlayHostEl]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handle = () => recomputePositions();
        container.addEventListener("scroll", handle, { passive: true });
        window.addEventListener("resize", handle);
        return () => {
            container.removeEventListener("scroll", handle);
            window.removeEventListener("resize", handle);
        };
    }, [recomputePositions]);

    useEffect(() => {
        if (isEnabled) return;
        setActiveKey(null);
        clearCloseTimer();
    }, [clearCloseTimer, isEnabled]);

    useEffect(() => {
        return () => {
            clearCloseTimer();
            if (!overlayHostEl) return;
            overlayHostEl.remove();
        };
    }, [clearCloseTimer, overlayHostEl]);

    const rendered = useMemo(() => {
        return positioned.map((item) => (
            <div
                key={item.key}
                className={styles.suggestion}
                style={{ left: item.x, top: item.y }}
            >
                <button
                    type="button"
                    className={styles.underline}
                    style={{ width: item.width, height: item.height }}
                    data-testid={TESTING_IDS.searchInlineReplaceTrigger}
                    aria-label={`Open replace suggestion for ${item.labelText}`}
                    aria-expanded={activeKey === item.key}
                    onMouseEnter={() => {
                        clearCloseTimer();
                        setActiveKey(item.key);
                    }}
                    onMouseLeave={() => {
                        scheduleClose(item.key);
                    }}
                    onClick={() => {
                        clearCloseTimer();
                        setActiveKey((key) =>
                            key === item.key ? null : item.key,
                        );
                    }}
                />
                {activeKey === item.key ? (
                    <div className={styles.bubble}>
                        <fieldset
                            className={styles.bubbleShell}
                            aria-label={`Replace suggestion for ${item.labelText}`}
                            onMouseEnter={() => clearCloseTimer()}
                            onMouseLeave={() => scheduleClose(item.key)}
                        >
                            <span className={styles.bubbleLabel}>
                                {`Replace "${item.labelText}" with "${replaceTerm}"?`}
                            </span>
                            <button
                                type="button"
                                className={styles.bubbleAction}
                                data-testid={
                                    TESTING_IDS.searchInlineReplaceButton
                                }
                                aria-label={`Apply replace for ${item.labelText}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void replaceMatch(item);
                                }}
                            >
                                <Check size={14} />
                            </button>
                        </fieldset>
                    </div>
                ) : null}
            </div>
        ));
    }, [
        activeKey,
        clearCloseTimer,
        positioned,
        replaceMatch,
        replaceTerm,
        scheduleClose,
    ]);

    if (!overlayHostEl || !isEnabled) return null;
    return createPortal(rendered, overlayHostEl);
}
