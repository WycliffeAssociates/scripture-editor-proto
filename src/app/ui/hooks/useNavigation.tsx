import { useLingui } from "@lingui/react/macro";
import {
    $getRoot,
    $isElementNode,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import { DATA_JS } from "@/app/data/constants.ts";
import type { Settings } from "@/app/data/settings.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { makeSid, parseReference } from "@/core/data/bible/bible.ts";

/**
 * Scripture workspace navigation logic.
 *
 * This hook owns book/chapter/reference movement within the currently loaded
 * scripture workspace, including the important "save current dirty Lexical
 * state before leaving the chapter" behavior.
 */
export function useNavigation({
    workingFilesStore,
    currentFileBibleIdentifier,
    currentChapter,
    setCurrentFileBibleIdentifier,
    setCurrentChapter,
    updateAppSettings,
    pickedFile,
    setEditorContent,
}: {
    workingFilesStore: WorkingFilesStore;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    pickedFile: ScriptureBookState | null;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
}) {
    const { t } = useLingui();

    /**
     * Switch to another book/chapter while preserving any in-progress edits in
     * the current chapter first.
     */
    function switchBookOrChapter(fileBibleIdentifier: string, chapter: number) {
        const filesToUse = workingFilesStore.read();
        const targetFile = filesToUse?.find(
            (f) => f.bookCode === fileBibleIdentifier,
        );
        if (!targetFile) return;

        let chapterToSave = chapter;
        let chapterState = targetFile.chapters.find(
            (c) => c.chapterNumber === chapter,
        );

        if (!chapterState) {
            // Fallback: If chapter not found, use first or last chapter
            if (targetFile.chapters.length > 0) {
                const sortedChaps = targetFile.chapters.toSorted(
                    (a, b) => a.chapterNumber - b.chapterNumber,
                );
                if (
                    chapter > sortedChaps[sortedChaps.length - 1].chapterNumber
                ) {
                    chapterState = sortedChaps[sortedChaps.length - 1];
                } else {
                    chapterState = sortedChaps[0];
                }
                chapterToSave = chapterState.chapterNumber;
            } else {
                return;
            }
        }

        if (
            fileBibleIdentifier === currentFileBibleIdentifier &&
            chapterToSave === currentChapter
        ) {
            return chapterState;
        }

        setEditorContent(fileBibleIdentifier, chapterToSave, chapterState);

        setCurrentFileBibleIdentifier(fileBibleIdentifier);
        setCurrentChapter(chapterToSave);

        updateAppSettings({
            lastChapterNumber: chapterToSave,
            lastBookIdentifier: fileBibleIdentifier,
        });

        const editorContainer = document.querySelector(
            `[data-js="${DATA_JS.editorContainer}"]`,
        );
        if (editorContainer) {
            editorContainer.scrollTop = 0;
        }

        return chapterState;
    }

    /**
     * Compute the "next chapter" affordance, including cross-book transitions.
     */
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
            (ch) => ch.chapterNumber === currentChapter,
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
            const nextBook = workingFilesStore
                .read()
                .find((file) => file.bookCode === nextBookId);
            if (!nextBook || !nextBook.chapters?.length)
                return {
                    hasNext: false,
                    go: () => {},
                };
            const firstChap = nextBook.chapters[0].chapterNumber;
            return {
                hasNext: true,
                display: t`Introduction`,
                go: () => switchBookOrChapter(nextBookId, firstChap),
            };
        } else {
            const nextChap =
                pickedFile.chapters[currentIndex + 1].chapterNumber;
            return {
                hasNext: true,
                display: `${getChapterDisplay(nextChap)}`,
                go: () => switchBookOrChapter(pickedFile.bookCode, nextChap),
            };
        }
    };

    /**
     * Compute the "previous chapter" affordance, including cross-book
     * transitions.
     */
    const determinePrevChapter = () => {
        if (!pickedFile || !pickedFile.chapters.length)
            return {
                hasPrev: false,
                go: () => {},
            };
        const currentIndex = pickedFile.chapters.findIndex(
            (ch) => ch.chapterNumber === currentChapter,
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
            const prevBook = workingFilesStore
                .read()
                .find((file) => file.bookCode === prevBookId);
            if (!prevBook || !prevBook.chapters?.length)
                return {
                    hasPrev: false,
                    go: () => {},
                };
            const lastChap =
                prevBook.chapters[prevBook.chapters.length - 1].chapterNumber;
            const title = prevBook.title || prevBook.bookCode;
            return {
                hasPrev: true,
                display: `${title} ${getChapterDisplay(lastChap)}`,
                go: () => switchBookOrChapter(prevBookId, lastChap),
            };
        } else {
            const prevChapter =
                pickedFile.chapters[currentIndex - 1].chapterNumber;
            return {
                hasPrev: true,
                display: `${getChapterDisplay(prevChapter)}`,
                go: () => switchBookOrChapter(pickedFile.bookCode, prevChapter),
            };
        }
    };

    /**
     * Parse a human-entered reference and navigate the editor there.
     *
     * This is the main bridge between fuzzy user input like "Mat 9:3" and the
     * concrete book/chapter/verse navigation state used by the scripture UI.
     */
    function goToReference(
        input: string,
        editorRef: React.RefObject<LexicalEditor | null>,
    ): boolean {
        const ref = parseReference(input);
        if (!ref) return false;

        let file = ref.knownBookId
            ? workingFilesStore
                  .read()
                  .find(
                      (f) =>
                          f.bookCode?.toLowerCase() ===
                          ref.knownBookId?.toLowerCase(),
                  )
            : undefined;

        if (!file) {
            const uniqueStartsWith = workingFilesStore
                .read()
                .filter(
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
        switchBookOrChapter,
        nextChapter: determineNextChapter(),
        prevChapter: determinePrevChapter(),
        goToReference,
    };
}
