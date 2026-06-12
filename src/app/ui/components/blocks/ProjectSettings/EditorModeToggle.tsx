import { useLingui } from "@lingui/react/macro";
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
  className?: string;
}

function EditorModeToggle({
  value,
  onValueChange,
  portalContainer,
  className,
}: EditorModeToggleProps) {
  const { t } = useLingui();
  const { project, actions } = useWorkspaceContext();
  const currentValue = value ?? project.appSettings.editorMode;

  const editorModeItems: SelectItem[] = [
    {
      value: EDITOR_MODES.regular,
      label: t`Revision mode`,
      description: t`Shows text as it appears on paper, ideal for reading and proofreading.`,
    },
    {
      value: EDITOR_MODES.usfm,
      label: t`USFM mode`,
      description: t`Edit the USFM content directly.`,
    },
    {
      value: EDITOR_MODES.view,
      label: t`View mode`,
      description: t`Read your text without making changes.`,
    },
    {
      value: EDITOR_MODES.plain,
      label: t`Plain mode`,
      description: t`Edit USFM directly with no additional functionality enabled.`,
    },
    {
      value: EDITOR_MODES.form,
      label: t`Form mode`,
      description: t`Edit your content in a structured form.`,
    },
  ];

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
      compact
      className={className ?? styles.modePickerControl}
      portalContainer={portalContainer}
      placeholder={t`Select editor mode`}
    />
  );
}

export default EditorModeToggle;
