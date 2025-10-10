import {produce} from "immer";
import {
  CLEAR_HISTORY_COMMAND,
  LexicalEditor,
  SerializedEditorState,
} from "lexical";
import {ParsedFile} from "@/app/data/parsedProject";
import {SettingsManager} from "@/app/data/settings";

export type UseActionsHook = ReturnType<typeof useProjectActions>;

type Props = {
  // projectPath: string,
  editorRef: React.RefObject<LexicalEditor | null>;
  currentFile: string;
  currentChapter: number;
  setCurrentFile: (file: string) => void;
  setCurrentChapter: (chapter: number) => void;
  settingsManager: SettingsManager;
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
  settingsManager,
}: Props) => {
  function updateChapterLexical(
    filePath: string,
    chap: number,
    newLexical: SerializedEditorState
  ) {
    return setWorkingFiles(
      produce(workingFiles, (draft) => {
        const file = draft.find((file) => file.path === filePath);
        if (!file) return;
        file.chapters[chap].lexicalState = newLexical;
        file.chapters[chap].dirty = true;
      })
    );
  }

  function setEditorContent(file: string, chapter: number) {
    const editor = editorRef.current;
    if (!editor) return;
    const targetFile = workingFiles?.find((f) => f.path === file);
    const chapterState = targetFile?.chapters[chapter];
    if (!chapterState) return;
    editor.setEditorState(editor.parseEditorState(chapterState.lexicalState), {
      tag: "programatic",
    });
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    //  editor.setEditorState(workingFiles.find(file => file.path === file)?.chapters[chapter].lexicalState);
  }

  function switchBookOrChapter(file: string, chapter: number) {
    const currentJson = editorRef.current?.getEditorState().toJSON();
    if (currentJson) {
      // current dirty
      updateChapterLexical(currentFile, currentChapter, currentJson);
    }
    const targetFile = workingFiles?.find((f) => f.path === file);
    if (!targetFile) return;
    const chapterState =
      targetFile?.chapters[chapter] || targetFile?.chapters[0]; //i.e that chapter doesn't exist in target file
    if (!chapterState) return;
    editorRef.current?.setEditorState(
      editorRef.current.parseEditorState(chapterState.lexicalState),
      {
        tag: "programatic",
      }
    );
    editorRef.current?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    setCurrentFile(file);
    setCurrentChapter(chapter);
    queueMicrotask(() => {
      settingsManager.set("lastBookIdentifier", file);
      settingsManager.set("lastChapterNumber", chapter);
    });
  }
  return {
    updateChapterLexical,
    switchBookOrChapter,
  };
};
