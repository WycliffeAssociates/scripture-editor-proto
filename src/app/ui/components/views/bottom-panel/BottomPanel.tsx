import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { VersionsPanelContent } from "./VersionsPanel.tsx";

export function BottomPanel(props: {
    height: number;
    onClose: () => void;
    onHeightChange: (height: number) => void;
}) {
    const resizeStateRef = useRef<{
        startY: number;
        startHeight: number;
    } | null>(null);

    useEffect(() => {
        function handlePointerMove(event: PointerEvent) {
            const resizeState = resizeStateRef.current;
            if (!resizeState) return;

            const deltaY = resizeState.startY - event.clientY;
            const nextHeight = clampBottomPanelHeight(
                resizeState.startHeight + deltaY,
            );
            props.onHeightChange(nextHeight);
        }

        function handlePointerUp() {
            resizeStateRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [props]);

    function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
        resizeStateRef.current = {
            startY: event.clientY,
            startHeight: props.height,
        };
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
    }

    return (
        <section
            className={styles.bottomPanel}
            style={{ height: `${props.height}px` }}
        >
            <button
                type="button"
                aria-label="Resize bottom panel"
                className={styles.bottomPanelResizeHandle}
                onPointerDown={handleResizeStart}
            />
            <div className={styles.bottomPanelHeader}>
                <span className={styles.bottomPanelTitle}>Versions</span>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.referenceToggleButton}
                    aria-label="Close bottom panel"
                    onClick={props.onClose}
                >
                    <X size={16} />
                </Button>
            </div>
            <div className={styles.bottomPanelBody}>
                <VersionsPanelContent />
            </div>
        </section>
    );
}

function clampBottomPanelHeight(height: number) {
    return Math.min(Math.max(height, 120), 420);
}
