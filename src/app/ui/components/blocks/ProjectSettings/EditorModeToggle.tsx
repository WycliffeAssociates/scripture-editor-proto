import type { RefObject } from "react";
import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import {
    type SelectItem,
    SelectPrimitive,
} from "@/app/ui/components/primitives/Select/Select.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "./settings.css.ts";

interface EditorModeToggleProps {
    value?: EditorModeSetting;
    onValueChange?: (value: EditorModeSetting) => void;
    portalContainer?: RefObject<HTMLElement | null>;
}

const editorModeItems: SelectItem[] = [
    { value: EDITOR_MODES.regular, label: "Regular mode" },
    { value: EDITOR_MODES.view, label: "View mode" },
    { value: EDITOR_MODES.plain, label: "Plain mode" },
    { value: EDITOR_MODES.usfm, label: "USFM mode" },
];

function EditorModeToggle({
    value,
    onValueChange,
    portalContainer,
}: EditorModeToggleProps) {
    const { project, actions } = useWorkspaceContext();
    const currentValue = value ?? project.appSettings.editorMode;

    function handleValueChange(nextValue: string | null) {
        if (!nextValue) {
            return;
        }

        const resolvedValue = nextValue as EditorModeSetting;
        if (onValueChange) {
            onValueChange(resolvedValue);
            return;
        }

        if (actions.setEditorMode) {
            actions.setEditorMode(resolvedValue);
            return;
        }

        project.updateAppSettings({ editorMode: resolvedValue });
    }

    return (
        <SelectPrimitive
            items={editorModeItems}
            value={currentValue}
            onValueChange={handleValueChange}
            className={styles.selectControl}
            portalContainer={portalContainer}
            placeholder="Select editor mode"
        />
    );
}

export default EditorModeToggle;
