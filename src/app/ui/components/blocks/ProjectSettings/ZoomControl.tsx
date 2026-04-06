import { Minus, Plus } from "lucide-react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "./settings.css.ts";

interface ZoomControlProps {
    value?: number;
    canSetZoom?: boolean;
    onValueChange?: (value: number) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

export default function ZoomControl({
    value,
    canSetZoom,
    onValueChange,
}: ZoomControlProps) {
    const { project } = useWorkspaceContext();
    const currentZoom = value ?? project.appSettings.zoom ?? 1;
    const canAdjustZoom = canSetZoom ?? project.appSettings.canSetZoom;

    if (!canAdjustZoom) {
        return null;
    }

    function commit(nextZoom: number) {
        const clamped = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, Number(nextZoom.toFixed(3))),
        );

        if (onValueChange) {
            onValueChange(clamped);
            return;
        }

        project.updateAppSettings({ zoom: clamped });
    }

    return (
        <div className={styles.stepperControl}>
            <button
                type="button"
                className={styles.stepperButton}
                aria-label="Decrease zoom"
                onClick={() => commit(currentZoom - ZOOM_STEP)}
                disabled={currentZoom <= MIN_ZOOM}
            >
                <Minus size={16} />
            </button>
            <div className={styles.stepperValue}>
                {Math.round(currentZoom * 100)}%
            </div>
            <button
                type="button"
                className={styles.stepperButton}
                aria-label="Increase zoom"
                onClick={() => commit(currentZoom + ZOOM_STEP)}
                disabled={currentZoom >= MAX_ZOOM}
            >
                <Plus size={16} />
            </button>
        </div>
    );
}
