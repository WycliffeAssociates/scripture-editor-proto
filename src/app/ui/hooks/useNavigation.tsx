import { useLingui } from "@lingui/react/macro";
import {
    $getRoot,
    $isElementNode,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { makeSid, parseReference } from "@/core/data/bible/bible.ts";

export function useNavigation({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    setCurrentFileBibleIdentifier,
    setCurrentChapter,
    updateAppSettings,
    pickedFile,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    pickedFile: ParsedFile | null;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
}) {
    const { t } = useLingui();

    function switchBookOrChapter(fileBibleIdentifier: string, chapter: number) {
        const dirtySaved = saveCurrentDirtyLexical();
        const filesToUse = dirtySaved || mutWorkingFilesRef;
        const targetFile = filesToUse?.find(
            (f) => f.bookCode === fileBibleIdentifier,
        );
        if (!targetFile) return;

        let chapterToSave = chapter;
        let chapterState = targetFile.chapters.find(
            (c) => c.chapNumber === chapter,
        );

        if (!chapterState) {
            // Fallback: If chapter not found, use first or last chapter
            if (targetFile.chapters.length > 0) {
                const sortedChaps = [...targetFile.chapters].sort(
                    (a, b) => a.chapNumber - b.chapNumber,
                );
                if (chapter > sortedChaps[sortedChaps.length - 1].chapNumber) {
                    chapterState = sortedChaps[sortedChaps.length - 1];
                } else {
                    chapterState = sortedChaps[0];
                }
                chapterToSave = chapterState.chapNumber;
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
            '[data-js="editor-container"]',
        );
        if (editorContainer) {
            editorContainer.scrollTop = 0;
        }

        return chapterState;
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

    function goToReference(
        input: string,
        editorRef: React.RefObject<LexicalEditor | null>,
    ): boolean {
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
        switchBookOrChapter,
        nextChapter: determineNextChapter(),
        prevChapter: determinePrevChapter(),
        goToReference,
    };
}
