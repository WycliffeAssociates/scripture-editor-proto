// hooks/useProjectDiffs.ts

import type { Change } from "diff";
import type {
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    type ContentEditorModeSetting,
    EDITOR_TAGS_USED,
} from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import {
    materializeFlatTokensArray,
    transformToMode,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { diffSidBlocks } from "@/core/domain/usfm/sidBlockDiff.ts";
import { applyRevertByBlockId } from "@/core/domain/usfm/sidBlockRevert.ts";
import { buildSidBlocks } from "@/core/domain/usfm/sidBlocks.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

type UseProjectDiffsProps = {
    mutWorkingFilesRef: ParsedFile[];
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    loadedProject: Project;
    history: CustomHistoryHook;
};

export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;

type BookCode = string;

export type ProjectDiff = {
    /** Stable per-block id (sid + first-token-id fallback). */
    uniqueKey: string;
    /** Semantic sid string (e.g. "GEN 1:1"). */
    semanticSid: string;
    status: "added" | "deleted" | "modified";
    originalDisplayText: string;
    currentDisplayText: string;
    wordDiff?: Change[];
    bookCode: string;
    chapterNum: number;
    isWhitespaceChange?: boolean;
};

export type ChapterDiffMap = Record<string, ProjectDiff>;
export type DiffsByChapter = Record<BookCode, Record<number, ChapterDiffMap>>;

type FlatToken = {
    sid: string;
    text: string;
    id?: string;
    node: SerializedLexicalNode;
};

function inferChapterModeFromRootChildren(
    rootChildren: SerializedLexicalNode[],
): "regular" | "usfm" {
    return rootChildren.some(
        (child) => (child as { type?: string }).type === "usfm-paragraph-node",
    )
        ? "regular"
        : "usfm";
}

function isChapterDirtyUsfm(chapter: ParsedChapter): boolean {
    return (
        serializeToUsfmString(chapter.lexicalState.root.children) !==
        serializeToUsfmString(chapter.loadedLexicalState.root.children)
    );
}

function listDirtyChapters(
    files: ParsedFile[],
): Array<{ bookCode: string; chapterNum: number }> {
    const result: Array<{ bookCode: string; chapterNum: number }> = [];
    for (const file of files) {
        for (const chapter of file.chapters) {
            if (chapter.dirty) {
                result.push({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapNumber,
                });
            }
        }
    }
    return result;
}

function flattenChapterStateToTokens(
    state: SerializedEditorState,
): FlatToken[] {
    const rootChildren = structuredClone(
        state.root.children as SerializedLexicalNode[],
    );

    // Produces a real flat token stream (with explicit paragraph markers) while
    // preserving nested editor nodes (notes) as atomic nodes.
    const flatNodes = materializeFlatTokensArray(rootChildren, {
        nested: "preserve",
    });

    let lastSid = "";
    const tokens: FlatToken[] = [];

    for (const node of flatNodes) {
        let sid: string | undefined;
        let id: string | undefined;
        let text = "";

        if (node.type === "linebreak") {
            sid = lastSid;
            text = "\n";
        } else if (isSerializedUSFMTextNode(node)) {
            sid = node.sid ?? lastSid;
            id = node.id;
            text = node.text ?? "";
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            sid = node.sid ?? lastSid;
            id = node.id;
            const opening = node.text ?? `\\${node.marker} `;
            // NOTE: nested editorState includes the closing marker token.
            const nested = serializeToUsfmString(
                node.editorState?.root?.children ?? [],
            );
            text = `${opening}${nested}`;
        } else {
            // Unknown node type: keep as inert token.
            sid = lastSid;
            text = "";
        }

        lastSid = sid ?? lastSid;
        tokens.push({ sid: sid ?? "", text, id, node });
    }

    return tokens;
}

function tokensToChapterState(args: {
    flatNodes: SerializedLexicalNode[];
    direction: "ltr" | "rtl";
    targetMode: ContentEditorModeSetting;
}): SerializedEditorState {
    const base: SerializedEditorState = {
        root: {
            children: [
                wrapFlatTokensInLexicalParagraph(
                    args.flatNodes,
                    args.direction,
                ),
            ],
            type: "root",
            version: 1,
            direction: args.direction,
            format: "start",
            indent: 0,
        },
    };

    return transformToMode(base, args.targetMode);
}

function revertAllChanges({
    mutWorkingFilesRef,
    setDiffsByChapter,
    bumpDirtyVersion,
    pickedFile,
    pickedChapter,
    editorRef,
}: {
    mutWorkingFilesRef: ParsedFile[];
    setDiffsByChapter: (next: DiffsByChapter) => void;
    bumpDirtyVersion: () => void;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    editorRef: React.RefObject<LexicalEditor | null>;
}) {
    for (const { chapter } of walkChapters(mutWorkingFilesRef)) {
        const currentMode = inferChapterModeFromRootChildren(
            chapter.lexicalState.root.children as SerializedLexicalNode[],
        );
        chapter.lexicalState = transformToMode(
            structuredClone(chapter.loadedLexicalState),
            currentMode,
        );
        chapter.dirty = false;
    }

    setDiffsByChapter({});
    bumpDirtyVersion();

    if (pickedFile && pickedChapter && editorRef.current) {
        const currentChap = mutWorkingFilesRef
            .find((file) => file.bookCode === pickedFile.bookCode)
            ?.chapters.find(
                (chap) => chap.chapNumber === pickedChapter.chapNumber,
            );
        if (currentChap) {
            editorRef.current.setEditorState(
                editorRef.current.parseEditorState(currentChap.lexicalState),
                {
                    tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                },
            );
        }
    }
}

export function useProjectDiffs({
    mutWorkingFilesRef,
    editorRef,
    pickedFile,
    pickedChapter,
    loadedProject,
    history,
}: UseProjectDiffsProps) {
    const [diffsByChapter, setDiffsByChapter] = useState<DiffsByChapter>({});
    const [openDiffModal, setOpenDiffModal] = useState(false);
    const [isCalculatingDiffs, setIsCalculatingDiffs] = useState(false);
    const [, setDirtyVersion] = useState(0);

    const bumpDirtyVersion = () => setDirtyVersion((v) => v + 1);

    const hasUnsavedChanges = (() => {
        for (const file of mutWorkingFilesRef) {
            for (const chapter of file.chapters) {
                if (chapter.dirty) return true;
            }
        }
        return false;
    })();

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!hasUnsavedChanges) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasUnsavedChanges]);

    function calculateDiffsForChapter(
        bookCode: string,
        chapterNum: number,
    ): ChapterDiffMap {
        const chapToUpdate = mutWorkingFilesRef
            .find((file) => file.bookCode === bookCode)
            ?.chapters.find((chap) => chap.chapNumber === chapterNum);
        if (!chapToUpdate) return {};

        const currentUsfm = serializeToUsfmString(
            chapToUpdate.lexicalState.root.children,
        );
        const originalUsfm = serializeToUsfmString(
            chapToUpdate.loadedLexicalState.root.children,
        );
        if (currentUsfm === originalUsfm) return {};

        const baselineTokens = flattenChapterStateToTokens(
            chapToUpdate.loadedLexicalState,
        );
        const currentTokens = flattenChapterStateToTokens(
            chapToUpdate.lexicalState,
        );
        const baselineBlocks = buildSidBlocks(baselineTokens);
        const currentBlocks = buildSidBlocks(currentTokens);
        const diffs = diffSidBlocks(baselineBlocks, currentBlocks);

        const map: ChapterDiffMap = {};
        for (const diff of diffs) {
            map[diff.blockId] = {
                uniqueKey: diff.blockId,
                semanticSid: diff.semanticSid,
                status: diff.status,
                originalDisplayText: diff.originalText,
                currentDisplayText: diff.currentText,
                bookCode,
                chapterNum,
                isWhitespaceChange: diff.isWhitespaceChange,
            };
        }
        return map;
    }

    function updateDiffMapForChapter(bookCode: string, chapterNum: number) {
        bumpDirtyVersion();
        if (!openDiffModal) return;

        setDiffsByChapter((prev) => {
            const next = { ...prev };
            const book = { ...(next[bookCode] ?? {}) };
            const chapterDiffs = calculateDiffsForChapter(bookCode, chapterNum);

            if (Object.keys(chapterDiffs).length === 0) {
                delete book[chapterNum];
            } else {
                book[chapterNum] = chapterDiffs;
            }

            if (Object.keys(book).length === 0) {
                delete next[bookCode];
            } else {
                next[bookCode] = book;
            }
            return next;
        });
    }

    async function updateDiffMapForChapters(
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) {
        bumpDirtyVersion();
        if (!openDiffModal) return;

        setIsCalculatingDiffs(true);
        await new Promise((resolve) => setTimeout(resolve, 0));

        setDiffsByChapter((prev) => {
            const next = { ...prev };
            const touchedBooks = new Set<string>();

            for (const { bookCode, chapterNum } of chapters) {
                if (!touchedBooks.has(bookCode)) {
                    next[bookCode] = { ...(next[bookCode] ?? {}) };
                    touchedBooks.add(bookCode);
                }

                const chapterDiffs = calculateDiffsForChapter(
                    bookCode,
                    chapterNum,
                );
                if (Object.keys(chapterDiffs).length === 0) {
                    delete next[bookCode]?.[chapterNum];
                } else if (next[bookCode]) {
                    next[bookCode][chapterNum] = chapterDiffs;
                }
                if (
                    next[bookCode] &&
                    Object.keys(next[bookCode]).length === 0
                ) {
                    delete next[bookCode];
                }
            }

            return next;
        });

        setIsCalculatingDiffs(false);
    }

    const handleRevert = (diffToRevert: ProjectDiff) => {
        void history.runTransaction({
            label: `Revert Change (${diffToRevert.semanticSid})`,
            candidates: [
                {
                    bookCode: diffToRevert.bookCode,
                    chapterNum: diffToRevert.chapterNum,
                },
            ],
            run: async () => {
                const { bookCode, chapterNum } = diffToRevert;
                const changedChapter = mutWorkingFilesRef
                    .find((file) => file.bookCode === bookCode)
                    ?.chapters.find((chap) => chap.chapNumber === chapterNum);
                if (!changedChapter) return;

                const baselineTokens = flattenChapterStateToTokens(
                    changedChapter.loadedLexicalState,
                );
                const currentTokens = flattenChapterStateToTokens(
                    changedChapter.lexicalState,
                );

                const nextTokens = applyRevertByBlockId({
                    diffBlockId: diffToRevert.uniqueKey,
                    baselineTokens,
                    currentTokens,
                });

                const nextFlatNodes = nextTokens.map((t) => t.node);
                const direction =
                    (changedChapter.lexicalState.root.direction ?? "ltr") ===
                    "rtl"
                        ? "rtl"
                        : "ltr";
                const currentMode = inferChapterModeFromRootChildren(
                    changedChapter.lexicalState.root
                        .children as SerializedLexicalNode[],
                );

                changedChapter.lexicalState = tokensToChapterState({
                    flatNodes: nextFlatNodes,
                    direction,
                    targetMode: currentMode,
                });

                changedChapter.dirty = isChapterDirtyUsfm(changedChapter);
                updateDiffMapForChapter(bookCode, chapterNum);

                if (
                    bookCode === pickedFile?.bookCode &&
                    chapterNum === pickedChapter?.chapNumber &&
                    editorRef.current
                ) {
                    editorRef.current.setEditorState(
                        editorRef.current.parseEditorState(
                            changedChapter.lexicalState,
                        ),
                        {
                            tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                        },
                    );
                }
            },
        });
    };

    const diffListForUI = useMemo(() => {
        const result: ProjectDiff[] = [];
        for (const bookCode of Object.keys(diffsByChapter)) {
            const chapters = diffsByChapter[bookCode];
            for (const chapNum of Object.keys(chapters)) {
                result.push(...Object.values(chapters[Number(chapNum)]));
            }
        }
        return result;
    }, [diffsByChapter]);

    async function toggleDiffModal(saveCurrentDirtyLexical: () => void) {
        if (openDiffModal) {
            setOpenDiffModal(false);
            return;
        }

        saveCurrentDirtyLexical();
        setOpenDiffModal(true);
        setIsCalculatingDiffs(true);

        await new Promise((resolve) => setTimeout(resolve, 0));

        const chaptersToDiff = listDirtyChapters(mutWorkingFilesRef);
        const next: DiffsByChapter = {};
        for (const { bookCode, chapterNum } of chaptersToDiff) {
            const chapterDiffs = calculateDiffsForChapter(bookCode, chapterNum);
            if (Object.keys(chapterDiffs).length === 0) continue;
            if (!next[bookCode]) next[bookCode] = {};
            next[bookCode][chapterNum] = chapterDiffs;
        }

        setDiffsByChapter(next);
        setIsCalculatingDiffs(false);
    }

    const closeModal = useCallback(() => {
        setOpenDiffModal(false);
    }, []);

    async function saveProjectToDisk() {
        const toSave: Record<string, string> = {};

        const filesToSave = mutWorkingFilesRef.filter((file) =>
            file.chapters.some((c) => c.dirty),
        );
        const entriesToSave = walkChapters(filesToSave);
        for (const { file, chapter } of entriesToSave) {
            if (!toSave[file.bookCode]) toSave[file.bookCode] = "";
            toSave[file.bookCode] += serializeToUsfmString(
                chapter.lexicalState.root.children,
            );
        }

        const savePromise = await Promise.allSettled(
            Object.entries(toSave).map(async ([bookCode, content]) => {
                await loadedProject.addBook({ bookCode, contents: content });
            }),
        );
        await Promise.all(savePromise);

        const error = savePromise.find((p) => p.status === "rejected");
        if (error) {
            console.error(error);
        } else if (Object.keys(toSave).length > 0) {
            ShowNotificationSuccess({
                notification: {
                    message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                    title: "Project Saved",
                },
            });
        }

        for (const file of filesToSave) {
            for (const chapter of file.chapters) {
                chapter.loadedLexicalState = structuredClone(
                    chapter.lexicalState,
                );
                chapter.dirty = false;
            }
        }

        setDiffsByChapter({});
        bumpDirtyVersion();
    }

    const handleRevertAll = () => {
        const candidates = mutWorkingFilesRef.flatMap((file) =>
            file.chapters.map((chapter) => ({
                bookCode: file.bookCode,
                chapterNum: chapter.chapNumber,
            })),
        );
        void history.runTransaction({
            label: "Revert All Changes",
            candidates,
            run: async () => {
                revertAllChanges({
                    mutWorkingFilesRef,
                    setDiffsByChapter,
                    bumpDirtyVersion,
                    pickedFile,
                    pickedChapter,
                    editorRef,
                });
            },
        });
    };

    return {
        diffs: diffListForUI,
        toggleDiffModal,
        openDiffModal,
        closeModal,
        updateDiffMapForChapter,
        updateDiffMapForChapters,
        handleRevert,
        handleRevertAll,
        saveProjectToDisk,
        isCalculatingDiffs,
        hasUnsavedChanges,
    };
}
