import { useLingui } from "@lingui/react/macro";
import {
    CLEAR_HISTORY_COMMAND,
    type LexicalEditor,
    type SerializedEditorState,
    type SerializedLexicalNode,
} from "lexical";
import { useRef } from "react";
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
    editorRef: React.RefObject<LexicalEditor | null>;
    mutWorkingFilesRef: ParsedFile[];
    loadedProject: Project;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    appSettings: Settings;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
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
    const { t } = useLingui();

    function updateChapterLexical({
        fileBibleIdentifier,
        chap,
        newLexical,
    }: {
        fileBibleIdentifier: string;
        chap: number;
        newLexical: SerializedEditorState;
    }) {
        const file = mutWorkingFilesRef.find(
            (file) => file.bookCode === fileBibleIdentifier,
        );
        if (!file) return;
        const chapToUpdate = file.chapters.find((c) => c.chapNumber === chap);
        if (!chapToUpdate) return;
        chapToUpdate.lexicalState = newLexical;
        chapToUpdate.dirty = true;
        updateDiffMapForChapter(file.bookCode, chap);
        return mutWorkingFilesRef;
    }

    function setEditorContent(
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent?: ParsedChapter,
        editorInstance?: LexicalEditor,
    ) {
        const editor = editorInstance || editorRef.current;
        if (!editor) {
            console.error(
                "setEditorContent called before editor was ready",
                fileBibleIdentifier,
                chapter,
            );
            return;
        }

        const targetFile = chapterContent
            ? null
            : mutWorkingFilesRef.find(
                  (f) => f.bookCode === fileBibleIdentifier,
              );
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
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    }

    function switchBookOrChapter(fileBibleIdentifier: string, chapter: number) {
        const dirtySaved = saveCurrentDirtyLexical();
        const filesToUse = dirtySaved || mutWorkingFilesRef;
        const targetFile = filesToUse?.find(
            (f) => f.bookCode === fileBibleIdentifier,
        );
        let chapterToSave = chapter;
        if (!targetFile) return;

        if (!targetFile.chapters[chapter]) {
            if (chapter > targetFile.chapters.length - 1) {
                chapterToSave = targetFile.chapters.length - 1;
            } else {
                chapterToSave = 0;
            }
        }

        const chapterState = targetFile.chapters[chapterToSave];
        if (
            fileBibleIdentifier === currentFileBibleIdentifier &&
            chapter === currentChapter
        ) {
            return chapterState;
        }
        if (!chapterState) return;
        setEditorContent(fileBibleIdentifier, chapterToSave, chapterState);

        setCurrentFileBibleIdentifier(fileBibleIdentifier);
        setCurrentChapter(chapterToSave);

        updateAppSettings({
            lastChapterNumber: chapterToSave,
            lastBookIdentifier: fileBibleIdentifier,
        });

        const editorContainer = document.querySelector(
            '[data-js="editor-container"]',
        );
        if (editorContainer) {
            editorContainer.scrollTop = 0;
        }

        return chapterState;
    }

    function saveCurrentDirtyLexical(): ParsedFile[] | undefined {
        const editor = editorRef.current;
        if (!editor) return;

        const currentJson = editor.getEditorState().toJSON();

        if (currentJson) {
            return updateChapterLexical({
                fileBibleIdentifier: currentFileBibleIdentifier,
                chap: currentChapter,
                newLexical: currentJson,
            });
        }
    }

    function toggleToSourceMode(args?: {
        isInitialLoad?: boolean;
        editor?: LexicalEditor;
    }) {
        const { isInitialLoad = false, editor } = args || {};

        const inProgress = isInitialLoad
            ? undefined
            : saveCurrentDirtyLexical();

        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        filesToUse.forEach((file) => {
            file.chapters.forEach((chapter) => {
                const rootChildren = chapter.lexicalState.root.children.map(
                    (node) => {
                        return adjustSerializedLexicalNodes(node, {
                            show: true,
                            isMutable: true,
                        });
                    },
                );
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
                editor,
            );
        }

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

    type adjustWysiModeArgs = {
        markersViewState?: EditorMarkersViewState;
        markersMutableState?: EditorMarkersMutableState;
        duringLoad?: boolean;
        editor?: LexicalEditor;
    };

    function adjustWysiwygMode(args: adjustWysiModeArgs) {
        const inProgress = args.duringLoad
            ? undefined
            : saveCurrentDirtyLexical();

        const markerViewState =
            args.markersViewState || appSettings.markersViewState;
        const markersMutableState =
            markerViewState === EditorMarkersViewStates.NEVER
                ? EditorMarkersMutableStates.IMMUTABLE
                : args.markersMutableState || appSettings.markersMutableState;

        const hide =
            markerViewState === EditorMarkersViewStates.NEVER ||
            markerViewState === EditorMarkersViewStates.WHEN_EDITING;

        const isMutable =
            markerViewState === EditorMarkersViewStates.NEVER
                ? EditorMarkersMutableStates.IMMUTABLE
                : markersMutableState;

        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ParsedChapter | undefined;

        filesToUse.forEach((file) => {
            file.chapters.forEach((chapter) => {
                const rootChildren = chapter.lexicalState.root.children.map(
                    (node) => {
                        return adjustSerializedLexicalNodes(node, {
                            show: !hide,
                            isMutable:
                                isMutable ===
                                EditorMarkersMutableStates.MUTABLE,
                        });
                    },
                );
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
                args.editor,
            );
        }

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

    const initializationRef = useRef(false);
    function initializeEditor(editor: LexicalEditor) {
        if (initializationRef.current) return;
        initializationRef.current = true;

        if (appSettings.mode === "source") {
            toggleToSourceMode({ isInitialLoad: true, editor });
        } else {
            adjustWysiwygMode({
                markersMutableState: appSettings.markersMutableState,
                markersViewState: appSettings.markersViewState,
                duringLoad: true,
                editor,
            });
        }
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
                return getFlattenedFileTokens(
                    file,
                    editorState,
                    chapter.chapNumber,
                );
            });
        });
    }

    const getChapterDisplay = (chapter: number) => {
        return chapter === 0 ? t`Introduction` : chapter.toString();
    };

    const determineNextChapter = () => {
        if (!pickedFile || !pickedFile.chapters.length)
            return {
                hasNext: false,
                go: () => {},
            };
        const currentIndex = pickedFile.chapters.findIndex(
            (ch) => ch.chapNumber === currentChapter,
        );
        if (currentIndex === -1)
            return {
                hasNext: false,
                go: () => {},
            };
        if (currentIndex === pickedFile.chapters.length - 1) {
            const nextBookId = pickedFile.nextBookId;
            if (!nextBookId)
                return {
                    hasNext: false,
                    go: () => {},
                };
            const nextBook = mutWorkingFilesRef.find(
                (file) => file.bookCode === nextBookId,
            );
            if (!nextBook || !nextBook.chapters?.length)
                return {
                    hasNext: false,
                    go: () => {},
                };
            const firstChap = nextBook.chapters[0].chapNumber;
            return {
                hasNext: true,
                display: t`Introduction`,
                go: () => switchBookOrChapter(nextBookId, firstChap),
            };
        } else {
            const nextChap = pickedFile.chapters[currentIndex + 1].chapNumber;
            return {
                hasNext: true,
                display: `${getChapterDisplay(nextChap)}`,
                go: () => switchBookOrChapter(pickedFile.bookCode, nextChap),
            };
        }
    };

    const determinePrevChapter = () => {
        if (!pickedFile || !pickedFile.chapters.length)
            return {
                hasPrev: false,
                go: () => {},
            };
        const currentIndex = pickedFile.chapters.findIndex(
            (ch) => ch.chapNumber === currentChapter,
        );
        if (currentIndex === -1)
            return {
                hasPrev: false,
                go: () => {},
            };
        if (currentIndex === 0) {
            const prevBookId = pickedFile.prevBookId;
            if (!prevBookId)
                return {
                    hasPrev: false,
                    go: () => {},
                };
            const prevBook = mutWorkingFilesRef.find(
                (file) => file.bookCode === prevBookId,
            );
            if (!prevBook || !prevBook.chapters?.length)
                return {
                    hasPrev: false,
                    go: () => {},
                };
            const lastChap =
                prevBook.chapters[prevBook.chapters.length - 1].chapNumber;
            const title = prevBook.title || prevBook.bookCode;
            return {
                hasPrev: true,
                display: `${title} ${getChapterDisplay(lastChap)}`,
                go: () => switchBookOrChapter(prevBookId, lastChap),
            };
        } else {
            const prevChap = pickedFile.chapters[currentIndex - 1].chapNumber;
            return {
                hasPrev: true,
                display: `${getChapterDisplay(prevChap)}`,
                go: () => switchBookOrChapter(pickedFile.bookCode, prevChap),
            };
        }
    };

    return {
        updateChapterLexical,
        switchBookOrChapter,
        toggleToSourceMode,
        adjustWysiwygMode,
        saveCurrentDirtyLexical,
        getFlatFileTokens,
        getProjectAsFlatTokens,
        nextChapter: determineNextChapter(),
        prevChapter: determinePrevChapter(),
        toggleDiffModal: () => toggleDiffModalCallback(saveCurrentDirtyLexical),
        initializeEditor,
    };
};

function adjustSerializedLexicalNodes(
    node: SerializedLexicalNode,
    { show, isMutable }: { show: boolean; isMutable: boolean },
) {
    if (node.type === USFM_TEXT_NODE_TYPE) {
        return updateSerializedToggleableUSFMTextNode(
            node as SerializedUSFMTextNode,
            {
                show: isSerializedToggleShowUSFMTextNode(node) ? show : true,
                isMutable: isSerializedToggleMutableUSFMTextNode(node)
                    ? isMutable
                    : true,
            },
        );
    }
    if (isSerializedElementNode(node)) {
        node.children = node.children.map((child) =>
            adjustSerializedLexicalNodes(child, { show, isMutable }),
        );
    }
    if (isSerializedUSFMNestedEditorNode(node)) {
        node.editorState.root.children = node.editorState.root.children.map(
            (child) => adjustSerializedLexicalNodes(child, { show, isMutable }),
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

    function collectTokens(
        nodes: SerializedLexicalNode[],
        _lastSid: string,
    ): Array<LintableTokenLike> {
        const tokens: Array<LintableTokenLike> = [];

        for (const node of nodes) {
            if (node.type === "linebreak") {
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
                tokens.push(node, ...collectTokens(nestedChildren, _lastSid));
            }
        }

        return tokens;
    }

    return collectTokens(firstChild.children ?? [], "");
}

function getFlattenedFileTokens(
    pickedFile: ParsedFile | null,
    currentEditorState: SerializedEditorState,
    currentChapter: number,
): Array<LintableTokenLike> {
    if (!pickedFile) return [];

    const tokens: Array<LintableTokenLike> = [];

    for (const chapter of pickedFile.chapters) {
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

function updateDomClassListWithMarkerViewState({
    viewState,
    mutableState,
    isSourceMode,
}: {
    viewState: EditorMarkersViewState;
    mutableState: EditorMarkersMutableState;
    isSourceMode: boolean;
}) {
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
