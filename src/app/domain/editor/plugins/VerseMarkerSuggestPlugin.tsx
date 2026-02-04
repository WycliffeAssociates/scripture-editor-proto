import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfsIterator } from "@lexical/utils";
import { Button } from "@mantine/core";
import { $getNodeByKey } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    $insertVerse,
    type BaseInsertArgs,
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import { canPromoteLeadingVerseNumber } from "@/app/domain/editor/utils/verseMarkerHeuristics.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/VerseMarkerSuggestOverlay.css.ts";

type Suggestion = {
    key: string;
    nodeKey: string;
    verseNumber: string;
    startOffset: number;
    endOffset: number;
};

type PositionedSuggestion = Suggestion & {
    x: number;
    y: number;
    width: number;
    height: number;
};

export function VerseMarkerSuggestPlugin() {
    const [editor] = useLexicalComposerContext();
    const { project, projectLanguageDirection } = useWorkspaceContext();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [positioned, setPositioned] = useState<PositionedSuggestion[]>([]);
    const [overlayHostEl, setOverlayHostEl] = useState<HTMLElement | null>(
        null,
    );
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const closeTimerRef = useRef<number | null>(null);

    const containerRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const getContainerEl = useCallback((): HTMLElement | null => {
        const root = editor.getRootElement();
        if (!root) return null;
        return root.closest<HTMLElement>('[data-js="editor-container"]');
    }, [editor]);

    type DecoratorProducer = (node: {
        getKey: () => string;
    }) => Suggestion | null;

    const buildVerseMarkerSuggestion: DecoratorProducer = (node) => {
        if (!$isUSFMTextNode(node)) return null;
        if (node.getTokenType() !== UsfmTokenTypes.text) return null;
        const parsed = canPromoteLeadingVerseNumber(node);
        if (!parsed) return null;
        const leading = parsed.leadingWhitespace.length;
        const startOffset = leading;
        const endOffset = leading + parsed.verseNumber.length;
        return {
            key: `verse-suggest:${node.getKey()}:${startOffset}`,
            nodeKey: node.getKey(),
            verseNumber: parsed.verseNumber,
            startOffset,
            endOffset,
        };
    };

    const decoratorProducers = useMemo(() => [buildVerseMarkerSuggestion], []);

    const recomputeSuggestions = useCallback(() => {
        const editorMode = project.appSettings.editorMode ?? "regular";
        if (editorMode !== "regular") {
            setSuggestions([]);
            return;
        }
        editor.getEditorState().read(() => {
            const next: Suggestion[] = [];
            for (const { node } of $dfsIterator()) {
                for (const producer of decoratorProducers) {
                    const suggestion = producer(node);
                    if (suggestion) next.push(suggestion);
                }
            }
            setSuggestions(next);
        });
    }, [editor, project.appSettings.editorMode, decoratorProducers]);

    useEffect(() => {
        return editor.registerUpdateListener(() => {
            recomputeSuggestions();
        });
    }, [editor, recomputeSuggestions]);

    const recomputePositions = useCallback(() => {
        const container = containerRef.current ?? getContainerEl();
        if (!container) return;
        containerRef.current = container;
        const containerRect = container.getBoundingClientRect();

        const next: PositionedSuggestion[] = [];
        for (const suggestion of suggestions) {
            const el = editor.getElementByKey(suggestion.nodeKey);
            if (!el) continue;
            const textNode = el.firstChild;
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
            const range = document.createRange();
            range.setStart(textNode, suggestion.startOffset);
            range.setEnd(textNode, suggestion.endOffset);
            const rect = range.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) continue;
            next.push({
                ...suggestion,
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height,
            });
        }
        setPositioned(next);
    }, [editor, getContainerEl, suggestions]);

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            recomputePositions();
        });
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [recomputePositions, suggestions]);

    useEffect(() => {
        const container = getContainerEl();
        if (!container) return;
        if (overlayHostEl) return;
        const host = document.createElement("div");
        host.dataset.js = "verse-marker-suggest-overlay";
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

    const handleConvert = useCallback(
        (item: Suggestion) => {
            editor.update(() => {
                const node = $getNodeByKey(item.nodeKey);
                if (!$isUSFMTextNode(node)) return;
                const parsed = canPromoteLeadingVerseNumber(node);
                if (!parsed) return;

                node.setTextContent(
                    `${parsed.leadingWhitespace}${parsed.rest}`,
                );

                const {
                    isStartOfLine: isStartOfLineCalculated,
                    actualAnchorNode,
                    actualAnchorOffset,
                } = calculateIsStartOfLine(node, 0, {
                    editor,
                    editorMode: "regular",
                });

                const args: BaseInsertArgs = {
                    anchorNode: actualAnchorNode,
                    anchorOffsetToUse: actualAnchorOffset,
                    marker: "v",
                    isStartOfLine: isStartOfLineCalculated,
                    restOfText: "",
                    languageDirection: projectLanguageDirection,
                    isTypedInsertion: false,
                    editorMode: project.appSettings.editorMode ?? "regular",
                };

                $insertVerse(args, parsed.verseNumber);
            });
            setActiveKey(null);
        },
        [editor],
    );

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

    const rendered = useMemo(() => {
        return positioned.map((item) => (
            <div
                key={item.key}
                className={styles.suggestion}
                style={{ left: item.x, top: item.y }}
                onMouseEnter={() => {
                    clearCloseTimer();
                    setActiveKey(item.key);
                }}
                onMouseLeave={() => {
                    scheduleClose(item.key);
                }}
                onClick={() => {
                    clearCloseTimer();
                    setActiveKey((key) => (key === item.key ? null : item.key));
                }}
            >
                <span
                    className={styles.underline}
                    style={{ width: item.width, height: item.height }}
                />
                {activeKey === item.key ? (
                    <div
                        className={styles.bubble}
                        onMouseEnter={() => clearCloseTimer()}
                        onMouseLeave={() => scheduleClose(item.key)}
                    >
                        <Button
                            size="xs"
                            variant="filled"
                            onClick={(event) => {
                                event.stopPropagation();
                                handleConvert(item);
                            }}
                        >
                            {`Make ${item.verseNumber} a verse marker?`}
                        </Button>
                    </div>
                ) : null}
            </div>
        ));
    }, [activeKey, handleConvert, positioned]);

    if (!overlayHostEl) return null;
    return createPortal(rendered, overlayHostEl);
}
