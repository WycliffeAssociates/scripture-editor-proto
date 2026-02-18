import { useLingui } from "@lingui/react/macro";
import { Group, rem } from "@mantine/core";
import { Redo, Undo } from "lucide-react";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function HistoryButtons() {
    const { history } = useWorkspaceContext();
    const { t } = useLingui();
    return (
        <Group align="center" gap="xs">
            <UndoButton
                canUndo={history.canUndo}
                handleUndo={history.undo}
                label={history.peekUndoLabel()}
                undoLabel={t`Undo`}
                undoWithDetailLabel={(next) => t`Undo — ${next}`}
            />
            <RedoButton
                canRedo={history.canRedo}
                handleRedo={history.redo}
                label={history.peekRedoLabel()}
                redoLabel={t`Redo`}
                redoWithDetailLabel={(next) => t`Redo — ${next}`}
            />
        </Group>
    );
}

type HistoryButtonPropsUndo = {
    canUndo: boolean;
    handleUndo: () => void;
    label: string | null;
    undoLabel: string;
    undoWithDetailLabel: (label: string) => string;
};
function UndoButton({
    canUndo,
    handleUndo,
    label,
    undoLabel,
    undoWithDetailLabel,
}: HistoryButtonPropsUndo) {
    return (
        <ActionIconSimple
            aria-label={undoLabel}
            title={label ? undoWithDetailLabel(label) : undoLabel}
            onClick={handleUndo}
            disabled={!canUndo}
        >
            <Undo size={rem(14)} />
        </ActionIconSimple>
    );
}
type HistoryButtonPropsRedo = {
    canRedo: boolean;
    handleRedo: () => void;
    label: string | null;
    redoLabel: string;
    redoWithDetailLabel: (label: string) => string;
};
function RedoButton({
    canRedo,
    handleRedo,
    label,
    redoLabel,
    redoWithDetailLabel,
}: HistoryButtonPropsRedo) {
    return (
        <ActionIconSimple
            aria-label={redoLabel}
            title={label ? redoWithDetailLabel(label) : redoLabel}
            onClick={handleRedo}
            disabled={!canRedo}
            style={{ fontSize: rem(14) }}
        >
            <Redo size={rem(14)} />
        </ActionIconSimple>
    );
}
