import { Tooltip } from "@base-ui/react/tooltip";
import { useLingui } from "@lingui/react/macro";
import { Redo, Undo } from "lucide-react";
import type { ReactNode } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "./historyButton.css.ts";

/**
 * Toolbar undo/redo affordances for the current scripture workspace history.
 */
export function HistoryButtons() {
    const { history } = useWorkspaceContext();
    const { t } = useLingui();
    const undoLabel = history.peekUndoLabel();
    const redoLabel = history.peekRedoLabel();

    return (
        <div className={styles.cluster}>
            <HistoryTooltipButton
                label={undoLabel ? t`Undo — ${undoLabel}` : t`Undo`}
                ariaLabel={t`Undo`}
                disabled={!history.canUndo}
                onClick={history.undo}
                icon={<Undo size={14} />}
            />
            <HistoryTooltipButton
                label={redoLabel ? t`Redo — ${redoLabel}` : t`Redo`}
                ariaLabel={t`Redo`}
                disabled={!history.canRedo}
                onClick={history.redo}
                icon={<Redo size={14} />}
            />
        </div>
    );
}

function HistoryTooltipButton(props: {
    label: string;
    ariaLabel: string;
    onClick: () => void;
    disabled?: boolean;
    icon: ReactNode;
}) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger
                render={
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={props.ariaLabel}
                        disabled={props.disabled}
                        onClick={props.onClick}
                    >
                        {props.icon}
                    </button>
                }
            />
            <Tooltip.Portal>
                <Tooltip.Positioner side="top" align="center">
                    <Tooltip.Popup className={styles.tooltipPopup}>
                        {props.label}
                    </Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
