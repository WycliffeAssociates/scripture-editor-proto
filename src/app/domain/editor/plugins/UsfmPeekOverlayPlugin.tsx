import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type OverlayItem = {
    key: string;
    x: number;
    y: number;
    text: string;
    kind: "para" | "v" | "c";
};

function clamp(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max);
}

function groupNearbyItems(items: OverlayItem[]) {
    const Y_THRESHOLD_PX = 6;
    const X_THRESHOLD_PX = 80;

    const kindOrder: Record<OverlayItem["kind"], number> = {
        c: 0,
        para: 1,
        v: 2,
    };

    const sorted = [...items].sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        if (a.x !== b.x) return a.x - b.x;
        return a.text.localeCompare(b.text);
    });

    type Cluster = { x: number; y: number; items: OverlayItem[] };
    const clusters: Cluster[] = [];

    for (const item of sorted) {
        const last = clusters.length > 0 ? clusters[clusters.length - 1] : null;
        const canJoin =
            last != null &&
            Math.abs(item.y - last.y) <= Y_THRESHOLD_PX &&
            Math.abs(item.x - last.x) <= X_THRESHOLD_PX;

        if (!canJoin) {
            clusters.push({ x: item.x, y: item.y, items: [item] });
            continue;
        }

        last.items.push(item);
        last.x = Math.min(last.x, item.x);
        last.y = Math.min(last.y, item.y);
    }

    const grouped: OverlayItem[] = [];
    for (const cluster of clusters) {
        if (cluster.items.length === 1) {
            grouped.push(cluster.items[0]);
            continue;
        }

        const kinds = new Set(cluster.items.map((i) => i.kind));
        const shouldCompound =
            kinds.has("para") && (kinds.has("v") || kinds.has("c"));
        if (!shouldCompound) {
            grouped.push(
                ...[...cluster.items].sort((a, b) => {
                    if (a.y !== b.y) return a.y - b.y;
                    if (a.x !== b.x) return a.x - b.x;
                    return a.text.localeCompare(b.text);
                }),
            );
            continue;
        }

        const parts = [...cluster.items].sort((a, b) => {
            const ka = kindOrder[a.kind];
            const kb = kindOrder[b.kind];
            if (ka !== kb) return ka - kb;
            return a.text.localeCompare(b.text);
        });

        const compoundPartText = (part: OverlayItem) => {
            if (part.kind === "v" || part.kind === "c") {
                return part.text.replace(/^\\([vc])\s+/, "\\$1");
            }
            return part.text;
        };

        grouped.push({
            key: `grp:${parts
                .map((p) => p.key)
                .sort()
                .join("|")}`,
            x: cluster.x,
            y: cluster.y,
            text: parts.map(compoundPartText).join(" "),
            kind: parts[0].kind,
        });
    }

    return grouped;
}

export function UsfmPeekOverlayPlugin() {
    const [editor] = useLexicalComposerContext();
    const [active, setActive] = useState(false);
    const [items, setItems] = useState<OverlayItem[]>([]);

    const containerRef = useRef<HTMLElement | null>(null);
    const [overlayHostEl, setOverlayHostEl] = useState<HTMLElement | null>(
        null,
    );
    const holdTimerRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);

    const getContainerEl = useCallback((): HTMLElement | null => {
        const root = editor.getRootElement();
        if (!root) return null;
        return root.closest<HTMLElement>('[data-js="editor-container"]');
    }, [editor]);

    const recompute = useCallback(() => {
        const root = editor.getRootElement();
        if (!root) return;
        const container = containerRef.current ?? getContainerEl();
        if (!container) return;
        containerRef.current = container;

        const containerRect = container.getBoundingClientRect();
        const within = (r: DOMRect) =>
            r.bottom >= containerRect.top &&
            r.top <= containerRect.bottom &&
            r.right >= containerRect.left &&
            r.left <= containerRect.right;

        const nextItems: OverlayItem[] = [];

        // Paragraph markers (container markers).
        const paras = root.querySelectorAll<HTMLElement>(
            ".usfm-para-container[data-marker]",
        );
        for (const el of paras) {
            const rect = el.getBoundingClientRect();
            if (!within(rect)) continue;
            const marker = el.dataset.marker;
            if (!marker) continue;

            const text = `\\${marker}`;
            const x = clamp(
                rect.left - containerRect.left,
                0,
                containerRect.width,
            );
            const y = clamp(
                rect.top - containerRect.top,
                0,
                containerRect.height,
            );
            nextItems.push({
                key: `para:${el.dataset.id ?? el.dataset.marker}:${y}`,
                x,
                y,
                text,
                kind: "para",
            });
        }

        // Verse/chapter markers: anchor to the numberRange, infer marker from hidden preceding marker span.
        const numberRanges = root.querySelectorAll<HTMLElement>(
            'span[data-token-type="numberRange"]',
        );
        for (const nr of numberRanges) {
            const prev = nr.previousElementSibling as HTMLElement | null;
            if (!prev) continue;
            if (prev.dataset?.tokenType !== "marker") continue;
            const marker = prev.dataset.marker;
            if (marker !== "v" && marker !== "c") continue;

            const rect = nr.getBoundingClientRect();
            if (!within(rect)) continue;

            const num = nr.textContent?.trim() ?? "";
            const text = marker === "v" ? `\\v ${num}` : `\\c ${num}`;
            const x = clamp(
                rect.left - containerRect.left,
                0,
                containerRect.width,
            );
            const y = clamp(
                rect.top - containerRect.top,
                0,
                containerRect.height,
            );
            nextItems.push({
                key: `${marker}:${nr.dataset.id ?? ""}:${y}`,
                x,
                y,
                text,
                kind: marker,
            });
        }

        setItems(groupNearbyItems(nextItems));
    }, [editor, getContainerEl]);

    const scheduleRecompute = useCallback(() => {
        if (!active) return;
        if (rafRef.current != null) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            recompute();
        });
    }, [active, recompute]);

    useEffect(() => {
        const container = containerRef.current ?? getContainerEl();
        if (!container) return;
        containerRef.current = container;

        if (!overlayHostEl) {
            const existing = container.querySelector<HTMLElement>(
                '[data-js="usfm-peek-overlay"]',
            );
            if (existing) {
                setOverlayHostEl(existing);
            } else {
                const host = document.createElement("div");
                host.dataset.js = "usfm-peek-overlay";
                host.style.position = "absolute";
                host.style.inset = "0";
                host.style.pointerEvents = "none";
                host.style.zIndex = "50";
                container.append(host);
                setOverlayHostEl(host);
            }
        }

        if (active) {
            container.dataset.usfmPeek = "true";
            document.body.classList.add("usfm-peek-active");
        } else {
            delete container.dataset.usfmPeek;
            document.body.classList.remove("usfm-peek-active");
        }
    }, [active, getContainerEl, overlayHostEl]);

    useEffect(() => {
        const root = editor.getRootElement();
        if (!root) return;

        const isEditorFocused = () => root.contains(document.activeElement);

        const clearHoldTimer = () => {
            if (holdTimerRef.current == null) return;
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Alt") return;
            if (!isEditorFocused()) return;
            if (e.ctrlKey || e.metaKey) return;
            if (e.repeat) return;

            clearHoldTimer();
            holdTimerRef.current = window.setTimeout(() => {
                holdTimerRef.current = null;
                setActive(true);
            }, 100);
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== "Alt") return;
            clearHoldTimer();
            setActive(false);
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            clearHoldTimer();
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [editor]);

    useEffect(() => {
        if (!active) {
            setItems([]);
            return;
        }

        recompute();
        const unregister = editor.registerUpdateListener(() => {
            scheduleRecompute();
        });

        const container = containerRef.current;
        const onScroll = () => scheduleRecompute();
        container?.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });

        return () => {
            unregister();
            container?.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [active, editor, recompute, scheduleRecompute]);

    useEffect(() => {
        return () => {
            if (!overlayHostEl) return;
            overlayHostEl.remove();
        };
    }, [overlayHostEl]);

    if (!overlayHostEl || !active) return null;

    return createPortal(
        <div
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.2,
                color: "rgba(15, 23, 42, 0.9)",
            }}
            aria-hidden="true"
        >
            {items.map((it) => (
                <div
                    key={it.key}
                    style={{
                        position: "absolute",
                        left: it.x,
                        top: it.y,
                        transform: "translateY(-2px)",
                        background: "rgba(255, 255, 255, 0.85)",
                        border: "1px solid rgba(15, 23, 42, 0.15)",
                        borderRadius: 6,
                        padding: "1px 6px",
                        whiteSpace: "nowrap",
                        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
                    }}
                >
                    {it.text}
                </div>
            ))}
        </div>,
        overlayHostEl,
    );
}
