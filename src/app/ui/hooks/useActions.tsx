import {produce} from "immer";
import {
  $getRoot,
  CLEAR_HISTORY_COMMAND,
  HISTORY_MERGE_TAG,
  LexicalEditor,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import {useEffectOnce} from "react-use";
import {
  EditorMarkersMutableState,
  EditorMarkersMutableStates,
  EditorMarkersViewState,
  EditorMarkersViewStates,
  USFM_TEXT_NODE_TYPE,
} from "@/app/data/editor";
import {ParsedChapter, ParsedFile} from "@/app/data/parsedProject";
import {Settings, SettingsManager, settingsDefaults} from "@/app/data/settings";
import {isSerializedElementNode} from "@/app/domain/editor/nodes/USFMElementNode";
import {isSerializedUSFMNestedEditorNode} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  isSerializedToggleMutableUSFMTextNode,
  isSerializedToggleShowUSFMTextNode,
  SerializedUSFMTextNode,
  updateSerializedToggleableUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";

export type UseActionsHook = ReturnType<typeof useProjectActions>;

type Props = {
  // projectPath: string,
  editorRef: React.RefObject<LexicalEditor | null>;
  currentFile: string;
  currentChapter: number;
  setCurrentFile: (file: string) => void;
  setCurrentChapter: (chapter: number) => void;
  appSettings: Settings;
  updateAppSettings: (newSettings: Partial<Settings>) => void;
  workingFiles: ParsedFile[];
  setWorkingFiles: (files: ParsedFile[]) => void;
};
export const useProjectActions = ({
  workingFiles,
  setWorkingFiles,
  editorRef,
  currentFile,
  currentChapter,
  setCurrentFile,
  setCurrentChapter,
  appSettings,
  updateAppSettings,
}: Props) => {
  function updateChapterLexical(
    filePath: string,
    chap: number,
    newLexical: SerializedEditorState
  ) {
    let newFiles = produce(workingFiles, (draft) => {
      const file = draft.find((file) => file.path === filePath);
      if (!file) return;
      file.chapters[chap].lexicalState = newLexical;
      file.chapters[chap].dirty = true;
    });

    setWorkingFiles(newFiles);
    return newFiles;
    // return setWorkingFiles(
    //   produce(workingFiles, (draft) => {
    //     const file = draft.find((file) => file.path === filePath);
    //     if (!file) return;
    //     file.chapters[chap].lexicalState = newLexical;
    //     file.chapters[chap].dirty = true;
    //   })
    // );
  }

  function setEditorContent(
    file: string,
    chapter: number,
    chapterContent?: ParsedChapter
  ) {
    console.log("setEditorContent", file, chapter);
    const editor = editorRef.current;
    if (!editor) return;
    const targetFile = workingFiles?.find((f) => f.path === file);
    const chapterState = chapterContent || targetFile?.chapters[chapter];
    if (!chapterState) return;
    editor.setEditorState(editor.parseEditorState(chapterState.lexicalState), {
      tag: HISTORY_MERGE_TAG,
    });
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    //  editor.setEditorState(workingFiles.find(file => file.path === file)?.chapters[chapter].lexicalState);
  }

  function switchBookOrChapter(file: string, chapter: number) {
    // FIRST SAVE THE CURRENT DIRTY STATE
    const dirtySaved = saveCurrentDirtyLexical();
    // THEN SET THE NEW CONTENT
    const filesToUse = dirtySaved || workingFiles;
    const targetFile = filesToUse?.find((f) => f.path === file);
    if (!targetFile) return;
    const chapterState =
      targetFile?.chapters[chapter] || targetFile?.chapters[0]; //i.e that chapter doesn't exist in target file
    if (file === currentFile && chapter === currentChapter) {
      return chapterState; //noop from here, but return dirty chapterSTate in case caller needs.
    }
    if (!chapterState) return;
    editorRef.current?.setEditorState(
      editorRef.current.parseEditorState(chapterState.lexicalState),
      {
        tag: HISTORY_MERGE_TAG,
      }
    );
    editorRef.current?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    // The update the ui
    setCurrentFile(file);
    setCurrentChapter(chapter);
    // And persisted settings
    updateAppSettings({
      lastChapterNumber: chapter,
      lastBookIdentifier: file,
    });
    // scroll editorRef to top since we actually switched:
    const editorContainer = document.querySelector(
      '[data-js="editor-container"]'
    );
    if (editorContainer) {
      editorContainer.scrollTop = 0;
    }
    return chapterState;
  }

  function saveCurrentDirtyLexical(): ParsedFile[] | undefined {
    const editor = editorRef.current;
    if (!editor) return;
    const currentJson = editorRef.current?.getEditorState().toJSON();
    if (currentJson) {
      return updateChapterLexical(currentFile, currentChapter, currentJson);
    }
  }
  // for "source" we toggle all nodes to mutable and showing;
  /**
   * Toggles the editor to source mode, which means all nodes will be mutable and shown.
   */
  function toggleToSourceMode() {
    // save dirty
    saveCurrentDirtyLexical();

    // update lexical state to show State = true for all + immutable = false for everything:
    let thisChapterUpdated: ParsedChapter | undefined;
    const clone = structuredClone(workingFiles);
    clone.forEach((file) => {
      file.chapters.forEach((chapter) => {
        const rootChildren = chapter.lexicalState.root.children.map((node) => {
          return adjustSerializedLexicalNodes(node, {
            show: true,
            isMutable: true,
          });
        });
        chapter.lexicalState.root.children = rootChildren;
        if (
          chapter.chapNumber === currentChapter &&
          file.path === currentFile
        ) {
          thisChapterUpdated = chapter;
        }
      });
      // return file;
    });

    setWorkingFiles(clone);
    if (thisChapterUpdated) {
      setEditorContent(currentFile, currentChapter, thisChapterUpdated);
    }
    updateAppSettings({
      mode: "source",
      markersMutableState: "mutable",
      markersViewState: EditorMarkersViewStates.ALWAYS,
    });
    document.body.classList.add("source-mode");
  }
  // wsyi has some submodes, ie we can wysi with markers always visible, or never visible, or only when editing; never visible will lock the markers as well: always or
  type adjustWysiModeArgs = {
    markersViewState?: EditorMarkersViewState;
    markersMutableState?: EditorMarkersMutableState;
  };
  /**
   * Adjusts the editor state to WYSIWYG mode with the given parameters.
   * @param {adjustWysiModeArgs} args - The arguments to adjust the WYSIWYG mode state.
   * @param {EditorMarkersViewState} args.markersViewState - The state of the markers in the editor.
   *   If not provided, the value of `appSettings.markersViewState` will be used.
   * @param {boolean} args.markersMutableState - Whether the markers are mutable in the editor.
   *   If not provided, the value of `appSettings.markersMutableState` will be used.
   */
  function adjustWysiwygMode(args: adjustWysiModeArgs) {
    // save dirty
    saveCurrentDirtyLexical();
    const markerViewState =
      args.markersViewState || appSettings.markersViewState;
    const markersMutableState =
      markerViewState === EditorMarkersViewStates.NEVER
        ? // if never view markers, then never mutable
          EditorMarkersMutableStates.IMMUTABLE
        : args.markersMutableState || appSettings.markersMutableState;
    let thisChapterUpdated: ParsedChapter | undefined;
    // show false, mutable false:
    // let adjustedFiles: ParsedFile[];
    // default hide = if never view markers or when editing, else then show them
    const hide =
      markerViewState === EditorMarkersViewStates.NEVER ||
      markerViewState === EditorMarkersViewStates.WHEN_EDITING;
    // never mutable if hidden, else if use passed or current setting
    const isMutable =
      markerViewState === EditorMarkersViewStates.NEVER
        ? EditorMarkersMutableStates.IMMUTABLE
        : markersMutableState;

    const clone = structuredClone(workingFiles);
    clone.forEach((file) => {
      file.chapters.forEach((chapter) => {
        const rootChildren = chapter.lexicalState.root.children.map((node) => {
          return adjustSerializedLexicalNodes(node, {
            show: !hide,
            isMutable: isMutable === EditorMarkersMutableStates.MUTABLE,
          });
        });
        chapter.lexicalState.root.children = rootChildren;
        if (
          chapter.chapNumber === currentChapter &&
          file.path === currentFile
        ) {
          thisChapterUpdated = chapter;
        }
      });
    });
    setWorkingFiles(clone);
    if (thisChapterUpdated) {
      setEditorContent(currentFile, currentChapter, thisChapterUpdated);
    }
    updateAppSettings({
      markersViewState: markerViewState,
      markersMutableState: markersMutableState,
      mode: "wysiwyg",
    });
    document.body.classList.remove("source-mode");
  }
  // show true, mutable = chosen option

  /* effect once to set initial content (if present), from then on, instead of effect scheduling, we'll prefer to make sure it's set only explicitly during swtichBookChap */
  useEffectOnce(() => {
    // yes, this readjusting state we just rendered, but perf is not bad, and it let's us just keep the logic here instead of in dependency code for lexical, so nodes uust always render a default, and we can adjust to saved preferences real quick before this first showing of content.

    if (appSettings.mode === "source") {
      toggleToSourceMode();
    } else if (
      appSettings.markersMutableState !==
        settingsDefaults.markersMutableState ||
      appSettings.markersViewState !== settingsDefaults.markersViewState
    ) {
      adjustWysiwygMode({
        markersMutableState: appSettings.markersMutableState,
        markersViewState: appSettings.markersViewState,
      });
    } else {
      setEditorContent(currentFile, currentChapter);
    }
  });

  return {
    updateChapterLexical,
    switchBookOrChapter,
    toggleToSourceMode,
    adjustWysiwygMode,
    saveCurrentDirtyLexical,
  };
};

// markers view state is whenEditing, always / never:
// mode is wysiwyg / source:  Source is synonym: for always for always view + all mutable?

function adjustSerializedLexicalNodes(
  node: SerializedLexicalNode,
  {show, isMutable}: {show: boolean; isMutable: boolean}
) {
  if (node.type === USFM_TEXT_NODE_TYPE) {
    node = updateSerializedToggleableUSFMTextNode(
      node as SerializedUSFMTextNode,
      {
        show: isSerializedToggleShowUSFMTextNode(node) ? show : true,
        isMutable: isSerializedToggleMutableUSFMTextNode(node)
          ? isMutable
          : true,
      }
    );
    return node;
  }
  if (isSerializedElementNode(node)) {
    node.children = node.children.map((node) => {
      return adjustSerializedLexicalNodes(node, {show, isMutable});
    });
  }
  if (isSerializedUSFMNestedEditorNode(node)) {
    node.editorState.root.children = node.editorState.root.children.map(
      (node) => {
        return adjustSerializedLexicalNodes(node, {show, isMutable});
      }
    );
  }
  return node;
}
