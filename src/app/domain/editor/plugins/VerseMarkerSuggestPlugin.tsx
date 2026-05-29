import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfsIterator } from "@lexical/utils";
import { $getNodeByKey, type LexicalNode } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DATA_JS } from "@/app/data/constants.ts";
import { EDITOR_MODES, UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    $insertVerse,
    type BaseInsertArgs,
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import { canPromoteLeadingVerseNumber } from "@/app/domain/editor/utils/verseMarkerHeuristics.ts";
import { LintFixPopover } from "@/app/ui/components/blocks/LintFixPopover.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
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

/**
 * Detects the common regular-mode pattern where a user types a leading number that
 * should really become a `\\v` marker, then offers an inline conversion affordance
 * before the document drifts away from valid USFM structure.
 */
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
        return root.closest<HTMLElement>(
            `[data-js="${DATA_JS.editorContainer}"]`,
        );
    }, [editor]);

    type DecoratorProducer = (node: LexicalNode) => Suggestion | null;

    const buildVerseMarkerSuggestion = useCallback<DecoratorProducer>(
        (node) => {
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
        },
        [],
    );

    const recomputeSuggestions = useCallback(() => {
        const editorMode =
            project.appSettings.editorMode ?? EDITOR_MODES.regular;
        if (editorMode !== EDITOR_MODES.regular) {
            setSuggestions([]);
            return;
        }
        editor.getEditorState().read(() => {
            const next: Suggestion[] = [];
            for (const { node } of $dfsIterator()) {
                const suggestion = buildVerseMarkerSuggestion(node);
                if (suggestion) next.push(suggestion);
            }
            setSuggestions(next);
        });
    }, [editor, project.appSettings.editorMode, buildVerseMarkerSuggestion]);

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
    }, [recomputePositions]);

    useEffect(() => {
        const container = getContainerEl();
        if (!container) return;
        if (overlayHostEl) return;
        const host = document.createElement("div");
        host.dataset.js = DATA_JS.verseMarkerSuggestOverlay;
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

                const text = node.getTextContent();
                // Prefer the captured offsets (which point at the number wherever
                // it sits — leading or trailing). If the node has been reshuffled
                // since detection and they no longer span the number, fall back
                // to re-deriving a leading number; bail if neither holds.
                let startOffset = item.startOffset;
                let endOffset = item.endOffset;
                if (text.slice(startOffset, endOffset) !== item.verseNumber) {
                    const parsed = canPromoteLeadingVerseNumber(node);
                    if (!parsed) return;
                    startOffset = parsed.leadingWhitespace.length;
                    endOffset = startOffset + parsed.verseNumber.length;
                }

                // Remove the number from the text; `$insertVerse` splits at the
                // boundary and inserts `\v` + the number there.
                const before = text.slice(0, startOffset);
                let after = text.slice(endOffset);
                if (after.startsWith(" ")) after = after.slice(1);
                node.setTextContent(before + after);

                const {
                    isStartOfLine: isStartOfLineCalculated,
                    actualAnchorNode,
                    actualAnchorOffset,
                } = calculateIsStartOfLine(node, startOffset, {
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
                    editorMode:
                        project.appSettings.editorMode ?? EDITOR_MODES.regular,
                };

                $insertVerse(args, item.verseNumber);
            });
            setActiveKey(null);
        },
        [editor, project.appSettings.editorMode, projectLanguageDirection],
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
            <VerseSuggestItem
                key={item.key}
                item={item}
                isActive={activeKey === item.key}
                onActivate={() => {
                    clearCloseTimer();
                    setActiveKey(item.key);
                }}
                onToggle={() => {
                    clearCloseTimer();
                    setActiveKey((key) => (key === item.key ? null : item.key));
                }}
                onKeepOpen={clearCloseTimer}
                onScheduleClose={() => scheduleClose(item.key)}
                onConvert={() => handleConvert(item)}
            />
        ));
    }, [activeKey, handleConvert, positioned, clearCloseTimer, scheduleClose]);

    if (!overlayHostEl) return null;
    return createPortal(rendered, overlayHostEl);
}

/**
 * One verse-marker suggestion: a brand-blue annotation over the candidate
 * number that, when active, opens the shared lint popover (so placement and
 * styling match the rest of the editor's affordances) with a convert action.
 */
function VerseSuggestItem(props: {
    item: PositionedSuggestion;
    isActive: boolean;
    onActivate: () => void;
    onToggle: () => void;
    onKeepOpen: () => void;
    onScheduleClose: () => void;
    onConvert: () => void;
}) {
    const { item } = props;
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    return (
        <div
            className={styles.suggestion}
            style={{ left: item.x, top: item.y }}
        >
            <button
                type="button"
                ref={setAnchorEl}
                className={styles.annotation}
                style={{ width: item.width, height: item.height }}
                aria-label={`Open verse marker suggestion for verse ${item.verseNumber}`}
                aria-expanded={props.isActive}
                onMouseEnter={props.onActivate}
                onMouseLeave={props.onScheduleClose}
                onClick={props.onToggle}
            />
            <LintFixPopover
                anchor={anchorEl}
                open={props.isActive}
                side="top"
                onMouseEnter={props.onKeepOpen}
                onMouseLeave={props.onScheduleClose}
            >
                <div className={styles.popoverContent}>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onConvert();
                        }}
                    >
                        {`Make ${item.verseNumber} a verse marker?`}
                    </Button>
                </div>
            </LintFixPopover>
        </div>
    );
}
