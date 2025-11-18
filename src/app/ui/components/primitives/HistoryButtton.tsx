import { Group, rem } from "@mantine/core";
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { Redo, Save, Undo } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function HistoryButtons() {
  const { editorRef } = useWorkspaceContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    // Polling function to check for editor
    const checkForEditor = () => {
      if (editorRef?.current) {
        const editor = editorRef.current;

        // Register command listeners
        const unregisterCanUndo = editor.registerCommand<boolean>(
          CAN_UNDO_COMMAND,
          (payload) => {
            setCanUndo(Boolean(payload));
            return false;
          },
          COMMAND_PRIORITY_EDITOR,
        );

        const unregisterCanRedo = editor.registerCommand<boolean>(
          CAN_REDO_COMMAND,
          (payload) => {
            setCanRedo(Boolean(payload));
            return false;
          },
          COMMAND_PRIORITY_EDITOR,
        );

        // Cleanup
        return () => {
          unregisterCanUndo();
          unregisterCanRedo();
        };
      } else {
        // If editor not available, check again after a short delay
        const timer = setTimeout(checkForEditor, 100);
        return () => clearTimeout(timer);
      }
    };

    // Start polling
    const cleanup = checkForEditor();

    // Cleanup on unmount
    return () => {
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [editorRef]);

  const handleUndo = () => {
    if (editorRef?.current) {
      editorRef.current.dispatchCommand(UNDO_COMMAND, undefined);
    }
  };

  const handleRedo = () => {
    if (editorRef?.current) {
      editorRef.current.dispatchCommand(REDO_COMMAND, undefined);
    }
  };
  return (
    <Group align="center" gap="xs">
      <UndoButton canUndo={canUndo} handleUndo={handleUndo} />
      <RedoButton canRedo={canRedo} handleRedo={handleRedo} />
    </Group>
  );
}

type HistoryButtonPropsUndo = {
  canUndo: boolean;
  handleUndo: () => void;
};
export function UndoButton({ canUndo, handleUndo }: HistoryButtonPropsUndo) {
  return (
    <ActionIconSimple
      aria-label="Undo"
      title="Undo"
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
};
export function RedoButton({ canRedo, handleRedo }: HistoryButtonPropsRedo) {
  return (
    <ActionIconSimple
      aria-label="Redo"
      title="Redo"
      onClick={handleRedo}
      disabled={!canRedo}
      style={{ fontSize: rem(14) }}
    >
      <Redo size={rem(14)} />
    </ActionIconSimple>
  );
}
