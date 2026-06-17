import { useLingui } from "@lingui/react/macro";
import { Minus, Plus } from "lucide-react";

import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
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
  const { t } = useLingui();
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
      <IconTooltip label={t`Decrease zoom`}>
        <button
          type="button"
          className={styles.stepperButton}
          aria-label={t`Decrease zoom`}
          onClick={() => commit(currentZoom - ZOOM_STEP)}
          disabled={currentZoom <= MIN_ZOOM}
        >
          <Minus size={16} />
        </button>
      </IconTooltip>
      <div className={styles.stepperValue}>
        {Math.round(currentZoom * 100)}%
      </div>
      <IconTooltip label={t`Increase zoom`}>
        <button
          type="button"
          className={styles.stepperButton}
          aria-label={t`Increase zoom`}
          onClick={() => commit(currentZoom + ZOOM_STEP)}
          disabled={currentZoom >= MAX_ZOOM}
        >
          <Plus size={16} />
        </button>
      </IconTooltip>
    </div>
  );
}
