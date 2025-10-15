import {useLexicalComposerContext} from "@lexical/react/LexicalComposerContext";
import {useDebouncedCallback} from "@mantine/hooks";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  NodeKey,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {useEffect, useRef} from "react";
import {
  EditorMarkersMutableState,
  EditorMarkersMutableStates,
  EditorMarkersViewState,
  EditorMarkersViewStates,
  EditorModes,
} from "@/app/data/editor";
import {
  ensurePlainTextNodeAlwaysFollowsVerseRange,
  ensureVerseRangeAlwaysFollowsVerseMarker,
  lintVerseRangeReferences,
} from "@/app/domain/editor/listeners/lintChecks";
import {toggleShowOnToggleableNodes} from "@/app/domain/editor/listeners/livePreviewToggleableNodes";
import {
  lockImmutableMarkersOnCut,
  lockImmutableMarkersOnPaste,
  lockImutableMarkersOnType,
} from "@/app/domain/editor/listeners/lockImmutableMarkers";
import {
  inverseTextNodeTransform,
  textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers";
import {USFMTextNode} from "@/app/domain/editor/nodes/USFMTextNode";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function USFMPlugin() {
  const [editor] = useLexicalComposerContext();
  const {project, lint} = useProjectContext();
  const {appSettings} = project;
  const {markersMutableState, markersViewState, mode} = appSettings;
  const markersInPreview = useRef(new Set<NodeKey>());
  const debouncedLint = useDebouncedCallback((editorState) => {
    console.count(`debouncedLint`);
    console.time("lint");
    const messages = lintVerseRangeReferences({editorState, editor});
    ensureVerseRangeAlwaysFollowsVerseMarker({editorState, editor});
    ensurePlainTextNodeAlwaysFollowsVerseRange({editorState, editor});
    // console.log(messages);
    if (!messages.length) {
      // sett if we actually need to clear the messages:
      const allMessagesInDom = document.querySelectorAll(".lint-error");
      if (allMessagesInDom.length === 0) {
        lint.setMessage([]);
      }
    } else {
      lint.setMessage(messages);
    }
    console.timeEnd("lint");
  }, 200);

  useEffect(() => {
    if (mode === EditorModes.SOURCE) {
      console.log("mode === EditorModes.SOURCE");
      // NOOOP NO EFFECTS IN THIS MODE
      return;
    }
    // update listeners, not a transform due to needing to run on selection changes
    // Get notified when Lexical commits an update to the DOM.
    const wysiPreview = editor.registerUpdateListener(({editorState}) => {
      if (markersViewState !== EditorMarkersViewStates.WHEN_EDITING) {
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

    const lints = editor.registerUpdateListener(({editorState, tags}) => {
      if (mode !== EditorModes.WYSIWYG) {
        return;
      }
      console.log({tags});
      debouncedLint(editorState);
    });

    // commands:
    const keyDownUnregister = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        return lockImutableMarkersOnType({editor, event, markersMutableState});
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
  }, [mode, markersViewState, editor, markersMutableState, debouncedLint]);

  return null;
}

/* 
FIND + go to
chapter (in addition to verse)
See Source (and sync a highlight)
*/
