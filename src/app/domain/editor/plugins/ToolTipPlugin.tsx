import { useEffect, useRef, useState } from "react";

export function MarkerTooltip() {
    const [visible, setVisible] = useState(false);
    const [content, setContent] = useState("");
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
    const currentEl = useRef<HTMLElement | null>(null);

    useEffect(() => {
        function onMouseOver(e: MouseEvent) {
            const el = e.target as HTMLElement;
            if (el.dataset?.tokenType === "marker") {
                currentEl.current = el;
                hoverTimeout.current = setTimeout(() => {
                    if (currentEl.current === el) {
                        setContent(`This is a ${el.dataset.marker} marker`);
                        setPosition({ x: e.clientX, y: e.clientY });
                        setVisible(true);
                    }
                }, 150);
            }
        }

        function onMouseOut(_e: MouseEvent) {
            if (hoverTimeout.current) {
                clearTimeout(hoverTimeout.current);
                hoverTimeout.current = null;
            }
            setVisible(false);
            currentEl.current = null;
        }

        function onMouseMove(e: MouseEvent) {
            if (visible) {
                setPosition({ x: e.clientX, y: e.clientY });
            }
        }

        document.body.addEventListener("mouseover", onMouseOver);
        document.body.addEventListener("mouseout", onMouseOut);
        document.body.addEventListener("mousemove", onMouseMove);

        return () => {
            document.body.removeEventListener("mouseover", onMouseOver);
            document.body.removeEventListener("mouseout", onMouseOut);
            document.body.removeEventListener("mousemove", onMouseMove);
        };
    }, [visible]);

    return visible ? (
        <div
            style={{
                position: "fixed",
                left: position.x + 8,
                top: position.y + 8,
                background: "rgba(0,0,0,0.8)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                pointerEvents: "none",
                fontSize: "12px",
                zIndex: 9999,
            }}
        >
            {content}
        </div>
    ) : null;
}
