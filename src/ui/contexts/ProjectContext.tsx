import type { UseQueryResult } from "@tanstack/react-query";
import { produce } from "immer";
import {
    CLEAR_HISTORY_COMMAND,
    type LexicalEditor,
    type SerializedEditorState,
} from "lexical";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useProjectFiles } from "@/api/api.tsx";
import {AppPreferences} from "@/data/app/preferences.ts";
import {ParsedChapterState, ParsedFile} from "@/data/parser/parsed.ts";

export type DragState = { draggingNodeKey: string } | null;

export type SearchOptions = {
    term: string;
    caseSensitive: boolean;
    wholeWord: boolean;
};

interface ProjectContextType {
    allFiles: ParsedFile[] | undefined;
    // allProjects:
    currentFile?: string;
    currentChapter?: number;
    mode: "wysi" | "raw";
    pickedFile?: ParsedFile;
    chapterFromFileAndChapNum: (
        file: string,
        chapter: number,
    ) => ParsedChapterState | undefined;
    pickedChapter?: ParsedChapterState;
    editorRef: React.RefObject<LexicalEditor | null>;
    setMode: (mode: "wysi" | "raw") => void;
    setCurrentFile: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    updateChapterLexical: ({
        newLexical,
        chap,
        file,
    }: {
        newLexical: SerializedEditorState;
        chap: number;
        file: string;
    }) => void;
    switchChapter: (chapter: number) => void;
    switchFile: (file: string) => void;
    switchTo: (file: string, chapter: number) => void;
    dragState: DragState;
    setDragState: (s: DragState) => void;
    saveCurrentDirtyLexical: (jsonState?: SerializedEditorState) => void;
    allProjects: {
        name: string;
        path: string;
    }[];
    referenceProjectQuery: UseQueryResult<ParsedFile[], Error>;
    referenceProjectPath: string | null;
    setReferenceProjectPath: (id: string) => void;
    selectionSids: Set<string>;
    setSelectionSids: (sids: Set<string>) => void;
    projectPath: string;
    projectSearchOptions: SearchOptions;
    setProjectSearchOptions: (args: SearchOptions) => void;
    appPreferences: AppPreferences;
    updateAppPreferences: (args: AppPreferences) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);
export const useProjectContext = () => {
    const ctx = useContext(ProjectContext);
    if (!ctx)
        throw new Error("useProjectContext must be inside ProjectProvider");
    return ctx;
};

interface ProjectProviderProps {
    children: React.ReactNode;
    files: ParsedFile[];
    projectPath: string;
    allProjects: {
        name: string;
        path: string;
    }[];
    pathSeparator: string;
    initialAppPreferences: AppPreferences;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({
    children,
    projectPath,
    files,
    allProjects,
    pathSeparator,
    initialAppPreferences,
}) => {
    const editorRef = useRef<LexicalEditor>(null);
    const [localFiles, setLocalFiles] = useState(files);
    const [referenceProjectPath, setReferenceProjectPath] = useState<
        null | string
    >(null);
    const referenceProjectQuery = useProjectFiles(
        referenceProjectPath,
        pathSeparator,
    );
    const [currentFile, setCurrentFile] = useState<string>(
        localStorage.getItem("currentFile") ?? "",
    );
    const [currentChapter, setCurrentChapter] = useState<number>(
        Number(localStorage.getItem("currentChapter") ?? "0"),
    );
    const [mode, setMode] = useState<"wysi" | "raw">("wysi");
    const [dragState, setDragState] = useState<DragState>(null);
    const [selectionSids, setSelectionSids] = useState<Set<string>>(new Set());
    const [projectSearchOptions, setProjectSearchOptions] = useState({
        term: "",
        caseSensitive: false,
        wholeWord: false,
    });
    const [appPreferences, setAppPreferences] = useState(initialAppPreferences);
    const updateAppPreferences = (newPreferences: AppPreferences) => {
        setAppPreferences(newPreferences);
        localStorage.setItem("appPreferences", JSON.stringify(newPreferences));
    };

    // const pickedFile = localFiles.find((f) => f.path === currentFile);
    const pickedFile = useMemo(
        () => localFiles.find((f) => f.path === currentFile),
        [localFiles, currentFile],
    );
    // const pickedChapter = pickedFile?.chapters[currentChapter];
    const pickedChapter = useMemo(
        () => pickedFile?.chapters[currentChapter],
        [pickedFile, currentChapter],
    );

    const chapterFromFileAndChapNum = useMemo(
        () => (file: string, chapter: number) =>
            localFiles.find((f) => f.path === file)?.chapters[chapter],
        [localFiles],
    );

    const saveCurrentDirtyLexical = (jsonState?: SerializedEditorState) => {
        if (!currentFile || currentChapter === undefined || !editorRef.current)
            return;
        const serialized =
            jsonState ?? editorRef.current.getEditorState().toJSON();
        console.time("immer setLocalFiles saveCurrentDirtyLexical");
        setLocalFiles((prev) => {
            const f = prev.find((f) => f.path === currentFile);
            if (!f) return prev;
            const chap = f.chapters[currentChapter];
            if (!chap) return prev;
            return prev.map((f) =>
                f.path === currentFile
                    ? {
                          ...f,
                          chapters: {
                              ...f.chapters,
                              [currentChapter]: {
                                  ...chap,
                                  lexicalState: serialized,
                                  dirty: true,
                              },
                          },
                      }
                    : f,
            );
        });
        // setLocalFiles((prev) =>
        //   produce(prev, (draft) => {
        //     const f = draft.find((f) => f.path === currentFile);
        //     if (!f) return;
        //     const chap = f.chapters[currentChapter];
        //     chap.lexicalState = serialized;
        //     chap.dirty = true;
        //   })
        // );
        console.timeEnd("immer setLocalFiles saveCurrentDirtyLexical");
    };

    const updateChapterLexical = ({
        newLexical,
        chap,
        file,
    }: {
        newLexical: SerializedEditorState;
        chap: number;
        file: string;
    }) => {
        if (!newLexical) return;
        console.time("immer setLocalFiles updateChapterLexical");
        setLocalFiles((prev) =>
            produce(prev, (draft) => {
                const f = draft.find((f) => f.path === file);
                if (!f) return;
                const chapter = f.chapters[chap];
                chapter.lexicalState = newLexical;
                chapter.dirty = true;
            }),
        );
        console.timeEnd("immer setLocalFiles updateChapterLexical");
    };

    const setContentOnChapterOrFileChange = ({
        newChap,
        newFile,
    }: {
        newChap?: number;
        newFile?: string;
    }) => {
        const editor = editorRef.current;
        if (!editor) return;
        const chap = newChap ?? currentChapter;
        const file = newFile ?? currentFile;
        const newPickedFile = localFiles.find((f) => f.path === file);
        if (!newPickedFile) return;
        const newChapState = newPickedFile.chapters[chap];
        if (!newChapState) return;
        editor.setEditorState(
            editor.parseEditorState(newChapState.lexicalState),
            {
                tag: "programatic",
            },
        );
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    };

    const switchChapter = (chapter: number) => {
        saveCurrentDirtyLexical();
        setCurrentChapter(chapter);
        setContentOnChapterOrFileChange({ newChap: chapter });
        localStorage.setItem("currentChapter", chapter.toString());
    };
    const switchFile = (file: string) => {
        saveCurrentDirtyLexical();
        setCurrentFile(file);
        // if this chap num not exist in new file, switch to chapter 0
        if (!files.find((f) => f.path === file)?.chapters[currentChapter]) {
            setCurrentChapter(0);
        }
        setContentOnChapterOrFileChange({ newFile: file });
        localStorage.setItem("currentFile", file);
    };
    const switchTo = (file: string, chapter: number) => {
        // Save current dirty lexical BEFORE changing the current file/chapter
        const currentJson = editorRef.current?.getEditorState().toJSON();
        if (currentJson) {
            updateChapterLexical({
                newLexical: currentJson,
                chap: currentChapter,
                file: currentFile,
            });
        }

        // Decide what chapter to actually switch to in the target file
        const targetFileEntry = files.find((f) => f.path === file);
        const hasChapter = !!targetFileEntry?.chapters?.[chapter];
        const newChapter = hasChapter ? chapter : 0;

        // Update the app state
        setCurrentFile(file);
        setCurrentChapter(newChapter);

        // Load content for newly selected file/chapter.
        // If setContentOnChapterOrFileChange supports a callback / promise, use it (preferred).
        // Otherwise call it and then rely on next tick to do DOM actions.
        setContentOnChapterOrFileChange({ newFile: file, newChap: newChapter });

        localStorage.setItem("currentFile", file);
        localStorage.setItem("currentChapter", String(newChapter));
    };

    //=============== EFFECTS  =============

    // todo: a save
    // const saveChapter = useCallback(
    //   (file: string, chapter: number) => {
    //     if (!currentProjectId) return;

    //     const data = queryClient.getQueryData<any[]>(["projectFiles", currentProjectId]);
    //     if (!data) return;

    //     const chapterData = data.find((f) => f.name === file)?.chapters[chapter];
    //     if (!chapterData || !chapterData._dirtyLexical) return;

    //     // Persist to disk
    //     // Example: writeTextFile(chapterData.path, serialize(chapterData._dirtyLexical));
    //     // Then mark dirty = false
    //     queryClient.setQueryData(["projectFiles", currentProjectId], (oldFiles) => {
    //       if (!oldFiles) return oldFiles;
    //       return oldFiles.map((f) => {
    //         if (f.name !== file) return f;
    //         return {
    //           ...f,
    //           chapters: {
    //             ...f.chapters,
    //             [chapter]: {
    //               ...f.chapters[chapter],
    //               dirty: false,
    //               usfm: chapterData._dirtyLexical?.toString() || chapterData.usfm,
    //             },
    //           },
    //         };
    //       });
    //     });
    //   },
    //   [queryClient, currentProjectId]
    // );

    return (
        <ProjectContext.Provider
            value={{
                allFiles: localFiles,
                allProjects,
                editorRef,
                currentFile,
                currentChapter,
                mode,
                setMode,
                updateChapterLexical,
                setCurrentFile,
                setCurrentChapter,
                switchChapter,
                switchFile,
                switchTo,
                pickedChapter,
                pickedFile,
                chapterFromFileAndChapNum,
                dragState,
                setDragState,
                saveCurrentDirtyLexical,
                referenceProjectQuery,
                setReferenceProjectPath,
                referenceProjectPath,
                selectionSids,
                setSelectionSids,
                projectPath,
                projectSearchOptions,
                setProjectSearchOptions,
                appPreferences,
                updateAppPreferences,
            }}
        >
            {children}
        </ProjectContext.Provider>
    );
};
