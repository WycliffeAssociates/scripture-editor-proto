import {
  CLEAR_HISTORY_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";
import { useEffectOnce } from "react-use";
import {
  EDITOR_TAGS_USED,
  type EditorMarkersMutableState,
  EditorMarkersMutableStates,
  type EditorMarkersViewState,
  EditorMarkersViewStates,
  USFM_TEXT_NODE_TYPE,
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
  isSerializedToggleMutableUSFMTextNode,
  isSerializedToggleShowUSFMTextNode,
  isSerializedUSFMTextNode,
  type SerializedUSFMTextNode,
  updateSerializedToggleableUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { LintableToken } from "@/core/data/usfm/lint.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

export type UseActionsHook = ReturnType<typeof useWorkspaceActions>;
export type LintableTokenLike = LintableToken & {
  lexicalKey?: string;
};

type Props = {
  // projectPath: string,
  editorRef: React.RefObject<LexicalEditor | null>;
  mutWorkingFilesRef: ParsedFile[];
  loadedProject: Project;
  currentFileBibleIdentifier: string;
  currentChapter: number;
  setCurrentFileBibleIdentifier: (file: string) => void;
  setCurrentChapter: (chapter: number) => void;
  appSettings: Settings;
  updateAppSettings: (newSettings: Partial<Settings>) => void;
  // workingFiles: ParsedFile[];
  // setWorkingFiles: (files: ParsedFile[]) => void;
  pickedFile: ParsedFile | null;
  toggleDiffModal: (saveCurrentDirtyLexical: () => void) => void;
  updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
};
export const useWorkspaceActions = ({
  mutWorkingFilesRef,
  editorRef,
  currentFileBibleIdentifier,
  currentChapter,
  setCurrentFileBibleIdentifier,
  setCurrentChapter,
  appSettings,
  updateAppSettings,
  pickedFile,
  toggleDiffModal: toggleDiffModalCallback,
  updateDiffMapForChapter,
}: Props) => {
  type UpdateChapterLexicalArgs = {
    fileBibleIdentifier: string;
    chap: number;
    newLexical: SerializedEditorState;
    // doSetWorkingFiles?: boolean;
  };
  function updateChapterLexical({
    fileBibleIdentifier,
    chap,
    newLexical,
    // doSetWorkingFiles = true,
  }: UpdateChapterLexicalArgs) {
    const file = mutWorkingFilesRef.find(
      (file) => file.bookCode === fileBibleIdentifier,
    );
    if (!file) return;
    file.chapters[chap].lexicalState = newLexical;
    file.chapters[chap].dirty = true;
    // if (doSetWorkingFiles) {
    //     setWorkingFiles(mutWorkingFilesRef);
    // }
    updateDiffMapForChapter(file.bookCode, chap);
    return mutWorkingFilesRef;
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
    fileBibleIdentifier: string,
    chapter: number,
    chapterContent?: ParsedChapter,
  ) {
    console.log("setEditorContent", fileBibleIdentifier, chapter);
    let editor = editorRef.current;
    const tryGetEditor = () => editorRef.current;
    const start = performance.now();
    while (!editor) {
      editor = tryGetEditor();
      const elapsed = performance.now() - start;
      if (elapsed > 5000) {
        throw new Error("Editor not found");
      }
    }
    const targetFile = chapterContent
      ? null
      : mutWorkingFilesRef.find((f) => f.bookCode === fileBibleIdentifier);
    const chapterState = chapterContent || targetFile?.chapters[chapter];
    if (!chapterState) return;
    editor.update(
      () => {
        editor.setEditorState(
          editor.parseEditorState(chapterState.lexicalState),
        );
      },
      {
        tag: [
          EDITOR_TAGS_USED.historyMerge,
          EDITOR_TAGS_USED.programaticIgnore,
        ],
      },
    );
    // editor.setEditorState(
    //     editor.parseEditorState(chapterState.lexicalState),
    //     {
    //         tag: HISTORY_MERGE_TAG,
    //     },
    // );
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    //  editor.setEditorState(workingFiles.find(file => file.path === file)?.chapters[chapter].lexicalState);
  }

  function switchBookOrChapter(fileBibleIdentifier: string, chapter: number) {
    // FIRST SAVE THE CURRENT DIRTY STATE
    // const dirtySaved = saveCurrentDirtyLexical({ doSetWorkingFiles: true });
    const dirtySaved = saveCurrentDirtyLexical();
    // THEN SET THE NEW CONTENT
    const filesToUse = dirtySaved || mutWorkingFilesRef;
    const targetFile = filesToUse?.find(
      (f) => f.bookCode === fileBibleIdentifier,
    );
    let chapterToSave = chapter;
    if (!targetFile) return;
    let chapterState = targetFile?.chapters[chapter];
    if (!chapterState) {
      if (chapter > targetFile?.chapters.length - 1) {
        chapterToSave = targetFile?.chapters.length - 1;
      } else {
        chapterToSave = 0;
      }
    }
    chapterState = targetFile?.chapters[chapterToSave];
    if (
      fileBibleIdentifier === currentFileBibleIdentifier &&
      chapter === currentChapter
    ) {
      return chapterState; //noop from here, but return dirty chapterSTate in case caller needs.
    }
    if (!chapterState) return;
    setEditorContent(fileBibleIdentifier, chapter, chapterState);
    // editorRef.current?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    // The update the ui
    setCurrentFileBibleIdentifier(fileBibleIdentifier);
    setCurrentChapter(chapterToSave);
    // And persisted settings
    updateAppSettings({
      lastChapterNumber: chapterToSave,
      lastBookIdentifier: fileBibleIdentifier,
    });
    // scroll editorRef to top since we actually switched:
    const editorContainer = document.querySelector(
      '[data-js="editor-container"]',
    );
    if (editorContainer) {
      editorContainer.scrollTop = 0;
    }

    return chapterState;
  }

  const nextChapter = determineNextChapter(
    pickedFile,
    currentChapter,
    mutWorkingFilesRef,
    switchBookOrChapter,
  );
  const prevChapter = determinePrevChapter(
    pickedFile,
    currentChapter,
    mutWorkingFilesRef,
    switchBookOrChapter,
  );

  function saveCurrentDirtyLexical(): ParsedFile[] | undefined {
    const editor = editorRef.current;
    if (!editor) return;

    const currentJson = editorRef.current?.getEditorState().toJSON();

    if (currentJson) {
      return updateChapterLexical({
        fileBibleIdentifier: currentFileBibleIdentifier,
        chap: currentChapter,
        newLexical: currentJson,
      });
    }
  }
  // for "source" we toggle all nodes to mutable and showing;
  /**
   * Toggles the editor to source mode, which means all nodes will be mutable and shown.
   */

  function toggleToSourceMode(args?: { isInitialLoad?: boolean }) {
    const { isInitialLoad = false } = args || {};

    // save dirty, but don't set state yet; We will when finished mutating what's in memory: InProgress returned from saveCurrentDirtyLexical is already a mutable clone
    const inProgress = isInitialLoad ? undefined : saveCurrentDirtyLexical();
    // : saveCurrentDirtyLexical({ doSetWorkingFiles: false });

    // update lexical state to show State = true for all + immutable = false for everything:
    const filesToUse = inProgress || mutWorkingFilesRef;
    let thisChapterUpdated: ParsedChapter | undefined;
    filesToUse.forEach((file) => {
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
          file.bookCode === currentFileBibleIdentifier
        ) {
          thisChapterUpdated = chapter;
        }
      });
    });

    if (thisChapterUpdated) {
      setEditorContent(
        currentFileBibleIdentifier,
        currentChapter,
        thisChapterUpdated,
      );
    }
    // setWorkingFiles(filesToUse);
    updateAppSettings({
      mode: "source",
      markersMutableState: "mutable",
      markersViewState: EditorMarkersViewStates.ALWAYS,
    });
    updateDomClassListWithMarkerViewState({
      viewState: EditorMarkersViewStates.ALWAYS,
      mutableState: "mutable",
      isSourceMode: true,
    });
  }
  // wsyi has some submodes, ie we can wysi with markers always visible, or never visible, or only when editing; never visible will lock the markers as well: always or
  type adjustWysiModeArgs = {
    markersViewState?: EditorMarkersViewState;
    markersMutableState?: EditorMarkersMutableState;
    duringLoad?: boolean;
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

    const inProgress = args.duringLoad ? undefined : saveCurrentDirtyLexical();
    // : saveCurrentDirtyLexical({ doSetWorkingFiles: false });

    const markerViewState =
      args.markersViewState || appSettings.markersViewState;
    const markersMutableState =
      markerViewState === EditorMarkersViewStates.NEVER
        ? // if never view markers, then never mutable
          EditorMarkersMutableStates.IMMUTABLE
        : args.markersMutableState || appSettings.markersMutableState;
    const hide =
      markerViewState === EditorMarkersViewStates.NEVER ||
      markerViewState === EditorMarkersViewStates.WHEN_EDITING;
    // never mutable if hidden, else if use passed or current setting
    const isMutable =
      markerViewState === EditorMarkersViewStates.NEVER
        ? EditorMarkersMutableStates.IMMUTABLE
        : markersMutableState;

    const filesToUse = inProgress || mutWorkingFilesRef;
    let thisChapterUpdated: ParsedChapter | undefined;
    filesToUse.forEach((file) => {
      file.chapters.forEach((chapter) => {
        const rootChildren = chapter.lexicalState.root.children.map((node) => {
          return adjustSerializedLexicalNodes(node, {
            show: !hide,
            isMutable: isMutable === EditorMarkersMutableStates.MUTABLE,
          });
        });
        if (
          chapter.chapNumber === currentChapter &&
          file.bookCode === currentFileBibleIdentifier
        ) {
          thisChapterUpdated = chapter;
        }
        chapter.lexicalState.root.children = rootChildren;
      });
    });
    if (thisChapterUpdated) {
      setEditorContent(
        currentFileBibleIdentifier,
        currentChapter,
        thisChapterUpdated,
      );
    }
    // setWorkingFiles(filesToUse);
    updateAppSettings({
      markersViewState: markerViewState,
      markersMutableState: markersMutableState,
      mode: "wysiwyg",
    });
    updateDomClassListWithMarkerViewState({
      viewState: markerViewState,
      mutableState: markersMutableState,
      isSourceMode: false,
    });
  }

  function getFlatFileTokens(
    currentEditorState: SerializedEditorState,
  ): Array<LintableTokenLike> {
    return getFlattenedFileTokens(
      pickedFile,
      currentEditorState,
      currentChapter,
    );
  }
  function getProjectAsFlatTokens(currentEditorState: SerializedEditorState) {
    return mutWorkingFilesRef.flatMap((file) => {
      return file.chapters.flatMap((chapter) => {
        const editorState =
          chapter.chapNumber === currentChapter &&
          file.bookCode === currentFileBibleIdentifier
            ? currentEditorState
            : chapter.lexicalState;
        return getFlattenedFileTokens(file, editorState, chapter.chapNumber);
      });
    });
  }

  /* effect once to set initial content (if present), from then on, instead of effect scheduling, we'll prefer to make sure it's set only explicitly during swtichBookChap */
  useEffectOnce(() => {
    // yes, this readjusting state we just rendered, but perf is not bad, and it let's us just keep the logic here instead of in dependency code for lexical, so nodes uust always render a default, and we can adjust to saved preferences real quick before this first showing of content.
    if (appSettings.mode === "source") {
      toggleToSourceMode({ isInitialLoad: true });
    }
    // else if (
    //     appSettings.markersMutableState !==
    //         settingsDefaults.markersMutableState ||
    //     appSettings.markersViewState !== settingsDefaults.markersViewState
    // ) {
    adjustWysiwygMode({
      markersMutableState: appSettings.markersMutableState,
      markersViewState: appSettings.markersViewState,
      duringLoad: true,
    });
    // } else {
    //     setEditorContent(currentFileBibleIdentifier, currentChapter);
    // }
  });
  function toggleDiffModal() {
    return toggleDiffModalCallback(saveCurrentDirtyLexical);
  }
  // HOOK RETURN
  return {
    updateChapterLexical,
    switchBookOrChapter,
    toggleToSourceMode,
    adjustWysiwygMode,
    saveCurrentDirtyLexical,
    getFlatFileTokens,
    getProjectAsFlatTokens,
    nextChapter,
    prevChapter,
    toggleDiffModal,
  };
};

// markers view state is whenEditing, always / never:
// mode is wysiwyg / source:  Source is synonym: for always for always view + all mutable?

function adjustSerializedLexicalNodes(
  node: SerializedLexicalNode,
  { show, isMutable }: { show: boolean; isMutable: boolean },
) {
  if (node.type === USFM_TEXT_NODE_TYPE) {
    node = updateSerializedToggleableUSFMTextNode(
      node as SerializedUSFMTextNode,
      {
        show: isSerializedToggleShowUSFMTextNode(node) ? show : true,
        isMutable: isSerializedToggleMutableUSFMTextNode(node)
          ? isMutable
          : true,
      },
    );
    return node;
  }
  if (isSerializedElementNode(node)) {
    node.children = node.children.map((node) => {
      return adjustSerializedLexicalNodes(node, { show, isMutable });
    });
  }
  if (isSerializedUSFMNestedEditorNode(node)) {
    node.editorState.root.children = node.editorState.root.children.map(
      (node) => {
        return adjustSerializedLexicalNodes(node, { show, isMutable });
      },
    );
  }
  return node;
}

function getFlattenedEditorStateAsParseTokens(
  serializedEditorState: SerializedEditorState,
): Array<LintableTokenLike> {
  const root = serializedEditorState.root;
  const firstChild = root.children?.[0];
  if (!isSerializedElementNode(firstChild)) return [];

  // Recursive helper to descend through nested structures
  function collectTokens(
    nodes: SerializedLexicalNode[],
    _lastSid: string,
  ): Array<LintableTokenLike> {
    const tokens: Array<LintableTokenLike> = [];

    for (const node of nodes) {
      if (node.type === "linebreak") {
        // we want to honor user linebreaks, and they are parsed in original, but we don't want to entirely overwrite the built in linebreak class with a custom node, so just represent the linebreak here as a serialized textNode:
        tokens.push({
          tokenType: UsfmTokenTypes.verticalWhitespace,
          text: "\n",
          id: "",
          sid: _lastSid,
        });
        continue;
      }
      if (isSerializedUSFMTextNode(node)) {
        tokens.push(node);
        if (node.sid) _lastSid = node.sid;
        continue;
      }

      if (isSerializedElementNode(node)) {
        tokens.push(...collectTokens(node.children ?? [], _lastSid));
        continue;
      }

      if (isSerializedUSFMNestedEditorNode(node)) {
        const nestedChildren = node.editorState?.root?.children ?? [];
        if (node.sid) _lastSid = node.sid;
        // the node itself has the opening marker
        tokens.push(node, ...collectTokens(nestedChildren, _lastSid));
      }
    }

    return tokens;
  }

  return collectTokens(firstChild.children ?? [], "");
}

export function getFlattenedFileTokens(
  pickedFile: ParsedFile | null,
  currentEditorState: SerializedEditorState,
  currentChapter: number,
): Array<LintableTokenLike> {
  if (!pickedFile) return [];

  const tokens: Array<LintableTokenLike> = [];

  for (const chapter of pickedFile.chapters) {
    // Use the live editor state for the current chapter
    const serializedState =
      chapter.chapNumber === currentChapter
        ? currentEditorState
        : chapter.lexicalState;

    const flattened = getFlattenedEditorStateAsParseTokens(serializedState);
    if (flattened?.length) {
      tokens.push(...flattened);
    }
  }

  return tokens;
}

type UpdateDomClassListWithMarkerViewStateArgs = {
  viewState: EditorMarkersViewState;
  mutableState: EditorMarkersMutableState;
  isSourceMode: boolean;
};
function updateDomClassListWithMarkerViewState({
  viewState,
  mutableState,
  isSourceMode,
}: UpdateDomClassListWithMarkerViewStateArgs) {
  if (isSourceMode) {
    document.body.classList.add("source-mode");
  } else {
    document.body.classList.remove("source-mode");
    const root = document.querySelector("#root") as HTMLElement | null;
    if (root) {
      root.dataset.markerViewState = viewState;
      root.dataset.markersMutableState = mutableState;
    }

    const body = document.body;
    const appRoot = body.firstElementChild;

    if (appRoot) {
      // set the marker visibility
      if (
        viewState === EditorMarkersViewStates.NEVER ||
        viewState === EditorMarkersViewStates.WHEN_EDITING
      ) {
        appRoot.classList.add("markers-hidden");
        appRoot.classList.remove("markers-shown");
      } else {
        appRoot.classList.remove("markers-hidden");
        appRoot.classList.add("markers-shown");
      }
    }
  }
}

function determineNextChapter(
  pickedFile: ParsedFile | null,
  currentChapter: number,
  workingFiles: ParsedFile[],
  switchBookOrChapter: (bookCode: string, chapter: number) => void,
) {
  if (!pickedFile || (!currentChapter && currentChapter !== 0))
    return {
      hasNext: false,
      go: () => {},
    };
  if (currentChapter === pickedFile?.chapters.length - 1) {
    const nextBookId = pickedFile.nextBookId;
    const nextBook = nextBookId
      ? workingFiles.find((file) => file.bookCode === nextBookId)
      : null;
    const firstChap = 0;
    const title = nextBook?.title || nextBook?.bookCode;
    return {
      hasNext: !!nextBookId,
      display: `${title} ${firstChap}`,
      go: () =>
        switchBookOrChapter(nextBookId || pickedFile.bookCode, firstChap),
    };
  } else {
    return {
      hasNext: true,
      display: `${currentChapter + 1}`,
      go: () => switchBookOrChapter(pickedFile.bookCode, currentChapter + 1),
    };
  }
}

function determinePrevChapter(
  pickedFile: ParsedFile | null,
  currentChapter: number,
  workingFiles: ParsedFile[],
  switchBookOrChapter: (bookCode: string, chapter: number) => void,
) {
  if (!pickedFile || (!currentChapter && currentChapter !== 0))
    return {
      hasPrev: false,
      go: () => {},
    };
  if (currentChapter === 0) {
    const prevBookId = pickedFile.prevBookId;
    const prevBook = workingFiles.find((file) => file.bookCode === prevBookId);
    if (!prevBook || !prevBook.chapters?.length)
      return {
        hasPrev: false,
        prevBookName: null,
        prevChapNum: null,
        go: () => {},
      };
    const lastChap = prevBook?.chapters?.length - 1;
    const title = prevBook?.title || prevBook?.bookCode;
    return {
      hasPrev: true,
      display: `${title} ${lastChap}`,
      go: () =>
        switchBookOrChapter(prevBookId || pickedFile.bookCode, lastChap),
    };
  } else {
    return {
      hasPrev: true,
      display: `${currentChapter - 1}`,
      go: () => switchBookOrChapter(pickedFile.bookCode, currentChapter - 1),
    };
  }
}
