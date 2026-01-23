import { useLingui } from "@lingui/react/macro";
import {
    $getRoot,
    $isElementNode,
    CLEAR_HISTORY_COMMAND,
    type LexicalEditor,
    type LexicalNode,
    type SerializedEditorState,
} from "lexical";
import { useRef } from "react";
import {
    EDITOR_TAGS_USED,
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $isUSFMTextNode,
    isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { matchFormattingToSource } from "@/app/domain/editor/utils/matchFormatting.ts";
import { adjustSerializedLexicalNodes } from "@/app/domain/editor/utils/modeAdjustments.ts";
import { applyPrettifyToNodeTree } from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import {
    walkChapters,
    walkNodes,
} from "@/app/domain/editor/utils/serializedTraversal.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { ReferenceProjectHook } from "@/app/ui/hooks/useReferenceProject.tsx";
import { makeSid, parseReference, parseSid } from "@/core/data/bible/bible.ts";
import type { LintableToken, LintError } from "@/core/data/usfm/lint.ts";
import {
    lintExistingUsfmTokens,
    parseUSFMChapter,
} from "@/core/domain/usfm/parse.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";
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
    updateDiffMapForChapters: (
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) => void;
    updateLintErrors: (
        book: string,
        chapter: number,
        newErrors: LintError[],
    ) => void;
    referenceProject: ReferenceProjectHook;
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
    updateDiffMapForChapters,
    updateLintErrors,
    referenceProject,
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

        for (const { file, chapter } of walkChapters(filesToUse)) {
            const rootChildren = chapter.lexicalState.root.children.flatMap(
                (node) => {
                    return adjustSerializedLexicalNodes(node, {
                        show: true,
                        isMutable: true,
                        flattenNested: true,
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
        }

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
        const isSwitchingFromSource = appSettings.mode === "source";

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

        for (const { file, chapter } of walkChapters(filesToUse)) {
            if (isSwitchingFromSource) {
                const usfm = serializeToUsfmString(
                    chapter.lexicalState.root.children,
                );
                const parsedChapters = parseUSFMChapter(
                    usfm,
                    file.bookCode,
                ).usfm;
                const parsedTokens = Object.values(parsedChapters).flat();
                chapter.lexicalState = parsedUsfmTokensToJsonLexicalNode(
                    parsedTokens,
                    chapter.lexicalState.root.direction || "ltr",
                );
            }

            const rootChildren = chapter.lexicalState.root.children.flatMap(
                (node) => {
                    return adjustSerializedLexicalNodes(node, {
                        show: !hide,
                        isMutable:
                            isMutable === EditorMarkersMutableStates.MUTABLE,
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
        }

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
            const prevChapter =
                pickedFile.chapters[currentIndex - 1].chapNumber;
            return {
                hasPrev: true,
                display: `${getChapterDisplay(prevChapter)}`,
                go: () => switchBookOrChapter(pickedFile.bookCode, prevChapter),
            };
        }
    };

    async function prettifyBook(bookCode?: string) {
        saveCurrentDirtyLexical();
        // Clone for undo
        const backup = structuredClone(mutWorkingFilesRef);
        const targetBookCode = bookCode || currentFileBibleIdentifier;

        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === targetBookCode,
        );
        if (!file) return;

        let currentChapterModified = false;
        const modifiedChapters: Array<{
            bookCode: string;
            chapterNum: number;
        }> = [];

        file.chapters.forEach((chapter) => {
            const originalChildren = chapter.lexicalState.root.children;
            const newChildren = applyPrettifyToNodeTree(originalChildren);

            // Check if anything changed
            if (
                JSON.stringify(originalChildren) !== JSON.stringify(newChildren)
            ) {
                chapter.lexicalState.root.children = newChildren;
                chapter.dirty = true;
                modifiedChapters.push({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapNumber,
                });
                if (
                    file.bookCode === currentFileBibleIdentifier &&
                    chapter.chapNumber === currentChapter
                ) {
                    currentChapterModified = true;
                }
            }
        });

        if (modifiedChapters.length > 0) {
            updateDiffMapForChapters(modifiedChapters);
        }

        if (currentChapterModified) {
            const currentChap = file.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        ShowNotificationSuccess({
            notification: {
                title: t`Book Prettified`,
                message: t`Prettified ${file.title || file.bookCode}`,
            },
        });

        return backup; // Return backup in case caller wants to handle revert
    }

    async function prettifyProject() {
        saveCurrentDirtyLexical();
        // Clone for undo
        const backup = structuredClone(mutWorkingFilesRef);

        let currentChapterModified = false;
        let modifiedBooksCount = 0;
        const modifiedChapters: Array<{
            bookCode: string;
            chapterNum: number;
        }> = [];

        for (const { file, chapter } of walkChapters(mutWorkingFilesRef)) {
            const originalChildren = chapter.lexicalState.root.children;
            const newChildren = applyPrettifyToNodeTree(originalChildren);

            if (
                JSON.stringify(originalChildren) !== JSON.stringify(newChildren)
            ) {
                chapter.lexicalState.root.children = newChildren;
                chapter.dirty = true;
                modifiedChapters.push({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapNumber,
                });
                if (
                    file.bookCode === currentFileBibleIdentifier &&
                    chapter.chapNumber === currentChapter
                ) {
                    currentChapterModified = true;
                }
            }
        }

        if (modifiedChapters.length > 0) {
            updateDiffMapForChapters(modifiedChapters);
        }

        // Recount modified books more accurately
        modifiedBooksCount = mutWorkingFilesRef.filter((f) =>
            f.chapters.some((c) => c.dirty),
        ).length;

        if (currentChapterModified) {
            const currentFile = mutWorkingFilesRef.find(
                (f) => f.bookCode === currentFileBibleIdentifier,
            );
            const currentChap = currentFile?.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        ShowNotificationSuccess({
            notification: {
                title: t`Project Prettified`,
                message: t`Prettified ${modifiedBooksCount} book(s)`,
            },
        });

        return backup;
    }

    function revertPrettify(backup: ParsedFile[]) {
        mutWorkingFilesRef.length = 0;
        mutWorkingFilesRef.push(...backup);

        const currentFile = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const currentChap = currentFile?.chapters.find(
            (c) => c.chapNumber === currentChapter,
        );
        if (currentChap) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                currentChap,
            );
        }

        updateDiffMapForChapter(currentFileBibleIdentifier, currentChapter);
    }

    async function matchFormattingChapter() {
        debugger;
        if (!referenceProject.referenceChapter) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const chapter = file?.chapters.find(
            (c) => c.chapNumber === currentChapter,
        );

        if (!chapter) return;

        const targetNodes = chapter.lexicalState.root.children;
        const sourceNodes =
            referenceProject.referenceChapter.lexicalState.root.children;

        const newNodes = matchFormattingToSource(targetNodes, sourceNodes);

        if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
            chapter.lexicalState.root.children = newNodes;
            chapter.dirty = true;
            updateDiffMapForChapter(currentFileBibleIdentifier, currentChapter);
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                chapter,
            );

            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for Chapter ${currentChapter}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingBook() {
        if (!referenceProject.referenceFile) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;

        let currentChapterModified = false;
        let modifiedChaptersCount = 0;

        file.chapters.forEach((chapter) => {
            const refChapter = referenceProject.referenceFile?.chapters.find(
                (rc) => rc.chapNumber === chapter.chapNumber,
            );
            if (!refChapter) return;

            const targetNodes = chapter.lexicalState.root.children;
            const sourceNodes = refChapter.lexicalState.root.children;
            const newNodes = matchFormattingToSource(targetNodes, sourceNodes);

            if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
                chapter.lexicalState.root.children = newNodes;
                chapter.dirty = true;
                updateDiffMapForChapter(file.bookCode, chapter.chapNumber);
                modifiedChaptersCount++;
                if (chapter.chapNumber === currentChapter) {
                    currentChapterModified = true;
                }
            }
        });

        if (currentChapterModified) {
            const currentChap = file.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        if (modifiedChaptersCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for ${modifiedChaptersCount} chapters in ${file.title || file.bookCode}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingProject() {
        if (!referenceProject.referenceQuery.data) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        let currentChapterModified = false;
        let modifiedBooksCount = 0;

        for (const targetFile of mutWorkingFilesRef) {
            const refFile =
                referenceProject.referenceQuery.data.parsedFiles.find(
                    (rf) => rf.bookCode === targetFile.bookCode,
                );
            if (!refFile) continue;

            let fileModified = false;
            targetFile.chapters.forEach((chapter) => {
                const refChapter = refFile.chapters.find(
                    (rc) => rc.chapNumber === chapter.chapNumber,
                );
                if (!refChapter) return;

                const targetNodes = chapter.lexicalState.root.children;
                const sourceNodes = refChapter.lexicalState.root.children;
                const newNodes = matchFormattingToSource(
                    targetNodes,
                    sourceNodes,
                );

                if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
                    chapter.lexicalState.root.children = newNodes;
                    chapter.dirty = true;
                    updateDiffMapForChapter(
                        targetFile.bookCode,
                        chapter.chapNumber,
                    );
                    fileModified = true;
                    if (
                        targetFile.bookCode === currentFileBibleIdentifier &&
                        chapter.chapNumber === currentChapter
                    ) {
                        currentChapterModified = true;
                    }
                }
            });

            if (fileModified) {
                modifiedBooksCount++;
            }
        }

        if (currentChapterModified) {
            const currentFile = mutWorkingFilesRef.find(
                (f) => f.bookCode === currentFileBibleIdentifier,
            );
            const currentChap = currentFile?.chapters.find(
                (c) => c.chapNumber === currentChapter,
            );
            if (currentChap) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    currentChap,
                );
            }
        }

        if (modifiedBooksCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting across ${modifiedBooksCount} books`,
                },
            });
        }

        return backup;
    }

    async function fixLintError(err: LintError) {
        if (!err.fix) return;

        const sidParsed = parseSid(err.sid);
        if (!sidParsed) return;

        // Sync any unsaved changes from the editor to mutWorkingFilesRef
        saveCurrentDirtyLexical();

        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === sidParsed.book,
        );
        if (!file) {
            console.error(`File not found for book: ${sidParsed.book}`);
            return;
        }

        const chapter = file.chapters.find(
            (c) => c.chapNumber === sidParsed.chapter,
        );
        if (!chapter) {
            console.error(`Chapter not found: ${sidParsed.chapter}`);
            return;
        }

        // Apply fix to the serialized state directly
        const originalChildren = chapter.lexicalState.root.children;
        const fixed = applyAutofixToSerializedState(originalChildren, err);

        if (fixed) {
            chapter.dirty = true;
            updateDiffMapForChapter(file.bookCode, chapter.chapNumber);

            // If the fixed chapter is the current one, reload the editor content
            if (
                file.bookCode === currentFileBibleIdentifier &&
                chapter.chapNumber === currentChapter
            ) {
                setEditorContent(
                    currentFileBibleIdentifier,
                    currentChapter,
                    chapter,
                    editorRef.current || undefined,
                );
            }

            ShowNotificationSuccess({
                notification: {
                    title: t`Fix Applied`,
                    message: t`Autofix applied for ${err.msgKey}`,
                },
            });

            // Refresh lints for the affected chapter
            const flatTokens = getFlattenedFileTokens(
                file,
                chapter.lexicalState,
                chapter.chapNumber,
            );
            const ctx = initParseContext(flatTokens);
            const newErrors = lintExistingUsfmTokens(flatTokens, ctx);
            updateLintErrors(file.bookCode, chapter.chapNumber, newErrors);
        }
    }

    function goToReference(input: string): boolean {
        const ref = parseReference(input);
        if (!ref) return false;

        let file = ref.knownBookId
            ? mutWorkingFilesRef.find(
                  (f) =>
                      f.bookCode?.toLowerCase() ===
                      ref.knownBookId?.toLowerCase(),
              )
            : undefined;

        if (!file) {
            const uniqueStartsWith = mutWorkingFilesRef.filter(
                (f) =>
                    f.title
                        ?.toLocaleLowerCase()
                        .startsWith(ref.bookMatch.toLocaleLowerCase()) ||
                    f.bookCode
                        ?.toLocaleLowerCase()
                        .startsWith(ref.bookMatch.toLocaleLowerCase()),
            );
            if (uniqueStartsWith.length === 1) {
                file = uniqueStartsWith[0];
            }
        }

        if (file) {
            const targetChapter = ref.chapter ?? currentChapter ?? 0;
            switchBookOrChapter(file.bookCode, targetChapter);

            if (ref.verse !== null) {
                const verseSid = makeSid({
                    bookId: file.bookCode,
                    chapter: targetChapter,
                    verseStart: ref.verse,
                    verseEnd: ref.verse,
                });

                // Scroll to verse after a short delay to allow editor to load
                setTimeout(() => {
                    const editor = editorRef.current;
                    if (!editor) return;

                    editor.read(() => {
                        const root = $getRoot();
                        const findNodeBySid = (
                            nodes: LexicalNode[],
                        ): LexicalNode | null => {
                            for (const node of nodes) {
                                if (
                                    $isUSFMTextNode(node) &&
                                    node.getSid() === verseSid
                                ) {
                                    return node;
                                }
                                if ($isElementNode(node)) {
                                    const found = findNodeBySid(
                                        node.getChildren(),
                                    );
                                    if (found) return found;
                                }
                            }
                            return null;
                        };

                        const targetNode = findNodeBySid(root.getChildren());
                        if (targetNode) {
                            const domEl = editor.getElementByKey(
                                targetNode.getKey(),
                            );
                            if (domEl) {
                                domEl.scrollIntoView({
                                    block: "center",
                                    behavior: "smooth",
                                });
                            }
                        }
                    });
                }, 200);
            }
            return true;
        }
        return false;
    }

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
        prettifyBook,
        prettifyProject,
        revertPrettify,
        matchFormattingChapter,
        matchFormattingBook,
        matchFormattingProject,
        fixLintError,
        goToReference,
    };
};

function getFlattenedEditorStateAsParseTokens(
    serializedEditorState: SerializedEditorState,
): Array<LintableTokenLike> {
    const root = serializedEditorState.root;
    const firstChild = root.children?.[0];
    if (!isSerializedElementNode(firstChild)) return [];

    const tokens: Array<LintableTokenLike> = [];
    let _lastSid = "";

    for (const node of walkNodes(firstChild.children ?? [])) {
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

        if (isSerializedUSFMNestedEditorNode(node)) {
            if ((node as any).sid) _lastSid = (node as any).sid;
            tokens.push(node as any);
        }
    }

    return tokens;
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
