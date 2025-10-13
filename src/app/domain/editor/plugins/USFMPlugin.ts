import {useLexicalComposerContext} from "@lexical/react/LexicalComposerContext";
import {COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, NodeKey} from "lexical";
import {useEffect, useRef} from "react";
import {
  EditorMarkersMutableState,
  EditorMarkersViewState,
  EditorMarkersViewStates,
  EditorModes,
} from "@/app/data/editor";
import {lintVerseRangeReferences} from "@/app/domain/editor/listeners/lintChecks";
import {toggleShowOnToggleableNodes} from "@/app/domain/editor/listeners/livePreviewToggleableNodes";
import {USFMTextNode} from "@/app/domain/editor/nodes/USFMTextNode";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";
import {
  lockImmutableMarkersOnCut,
  lockImmutableMarkersOnPaste,
  lockImutableMarkersOnType,
} from "../listeners/lockImmutableMarkers";
import {
  inverseTextNodeTransform,
  textNodeTransform,
} from "../listeners/manageUsfmMarkers";

export function USFMPlugin() {
  const [editor] = useLexicalComposerContext();
  const {project} = useProjectContext();
  const {appSettings} = project;
  const {markersMutableState, markersViewState, mode} = appSettings;
  const markersInPreview = useRef(new Set<NodeKey>());
  useEffect(() => {
    if (mode === EditorModes.SOURCE) {
      console.log("mode === EditorModes.SOURCE");
      // NOOOP NO EFFECTS IN THIS MODE
      return;
    }
    // update listeners, not a transform due to needing to run on selection changes
    const wysiPreview = editor.registerUpdateListener(({editorState}) => {
      if (markersViewState !== EditorMarkersViewStates.WHEN_EDITING) {
        console.log(
          "markersViewState !== EditorMarkersViewStates.WHEN_EDITING"
        );
        return;
      }
      console.count("wysiPreview");
      toggleShowOnToggleableNodes({
        editor,
        editorState,
        markersViewState,
        currentActive: markersInPreview.current,
        setCurrentActive: (activeNodes) => {
          markersInPreview.current = activeNodes;
        },
      });
    });
    const unregisterTransformWhileTyping = editor.registerNodeTransform(
      USFMTextNode,
      (node) => {
        const arg = {
          node,
          editor,
          editorMode: mode,
          markersMutableState,
          markersViewState,
        };
        textNodeTransform(arg);
        inverseTextNodeTransform(arg);
      }
    );

    const lints = editor.registerNodeTransform(USFMTextNode, (node) => {
      lintVerseRangeReferences({editor, node});
    });

    // commands:
    const keyDownUnregister = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        return lockImutableMarkersOnType({editor, event});
      },
      COMMAND_PRIORITY_HIGH
    );
    const pasteCommand = lockImmutableMarkersOnPaste(editor);
    const lockImmutablesOnCut = lockImmutableMarkersOnCut(editor);

    return () => {
      wysiPreview();
      unregisterTransformWhileTyping();
      lints();
      keyDownUnregister();
      pasteCommand();
      lockImmutablesOnCut();
    };
  }, [mode, markersViewState, editor]);

  return null;
}
