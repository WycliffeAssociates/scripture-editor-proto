import { useLingui } from "@lingui/react/macro";
import { Minus, Plus } from "lucide-react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

import * as styles from "./settings.css.ts";

interface FontSizeControlProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

const MIN_FONT_SIZE_PX = 10;
const MAX_FONT_SIZE_PX = 40;
const FONT_SIZE_STEP = 1;

function parseFontSize(value: string | undefined): number {
  if (!value) {
    return 16;
  }

  const cleaned = value.trim().replace("px", "");
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? 16 : parsed;
}

export default function FontSizeControl({
  value,
  onValueChange,
}: FontSizeControlProps) {
  const { t } = useLingui();
  const { project } = useWorkspaceContext();
  const currentValue = value ?? project.appSettings.fontSize;
  const currentPx = parseFontSize(currentValue);

  function commit(nextPx: number) {
    const clamped = Math.max(
      MIN_FONT_SIZE_PX,
      Math.min(MAX_FONT_SIZE_PX, Math.round(nextPx)),
    );
    const nextValue = `${clamped}px`;

    if (onValueChange) {
      onValueChange(nextValue);
      return;
    }

    project.updateAppSettings({ fontSize: nextValue });
  }

  return (
    <div className={styles.stepperControl}>
      <IconTooltip label={t`Decrease font size`}>
        <button
          type="button"
          className={styles.stepperButton}
          data-testid={TESTING_IDS.settings.fontSizeDecrement}
          aria-label={t`Decrease font size`}
          onClick={() => commit(currentPx - FONT_SIZE_STEP)}
          disabled={currentPx <= MIN_FONT_SIZE_PX}
        >
          <Minus size={16} />
        </button>
      </IconTooltip>
      <div
        className={styles.stepperValue}
        data-testid={TESTING_IDS.settings.fontSizeInput}
      >
        {currentPx}px
      </div>
      <IconTooltip label={t`Increase font size`}>
        <button
          type="button"
          className={styles.stepperButton}
          data-testid={TESTING_IDS.settings.fontSizeIncrement}
          aria-label={t`Increase font size`}
          onClick={() => commit(currentPx + FONT_SIZE_STEP)}
          disabled={currentPx >= MAX_FONT_SIZE_PX}
        >
          <Plus size={16} />
        </button>
      </IconTooltip>
    </div>
  );
}
