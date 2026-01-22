// hooks/useProjectDiffs.ts

import { type Change, diffArrays, diffWordsWithSpace } from "diff";
import type {
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import { useEffectOnce } from "react-use";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    buildSidContentMapForChapter,
    type SidContent,
    type SidContentMap,
    serializeToUsfmString,
} from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

// Import types from react-diff-view

type UseProjectDiffsProps = {
    mutWorkingFilesRef: ParsedFile[];
    // setWorkingFiles: (files: ParsedFile[]) => void;
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    loadedProject: Project;
};
export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;
type BookCode = string;
type ChapterNum = string;
type Sid = string;
type FileChapScopedSids = Record<
    BookCode,
    Record<ChapterNum, Record<Sid, SidContent>>
>;
export function useProjectDiffs({
    mutWorkingFilesRef,
    editorRef,
    pickedFile,
    pickedChapter,
    loadedProject,
    // setWorkingFiles,
}: UseProjectDiffsProps) {
    const [diffMap, setDiffMap] = useState<DiffMap>({});
    const [openDiffModal, setOpenDiffModal] = useState(false);
    // const [isCalculating, setIsCalculating] = useState(false);
    // lie to ts a moment ot make life nicer below

    const currentSidMap = useRef(null) as unknown as {
        current: FileChapScopedSids;
    };
    const originalSidMapRef = useRef(null) as unknown as {
        current: FileChapScopedSids;
    };

    // This block ensures the map is created only once.
    if (!currentSidMap.current || !originalSidMapRef.current) {
        console.log(
            "Calculating CURRENT SID map... (This should only run once!)",
        );
        currentSidMap.current = getProjectSidContentMap(
            mutWorkingFilesRef,
            (c) => c.lexicalState,
        );
        originalSidMapRef.current = getProjectSidContentMap(
            mutWorkingFilesRef,
            (c) => c.loadedLexicalState,
        );
    }

    useEffectOnce(() => {
        if (!currentSidMap.current) {
            console.error("CURRENT SID map is null!");
            return;
        }
        const initialDiffs = calculateInitialDiffs(
            originalSidMapRef.current,
            currentSidMap.current,
        );
        setDiffMap(initialDiffs);
    });

    function updateDiffMapForChapter(bookCode: string, chapterNum: number) {
        const newMap = updateChapterInDiffMap({
            bookCode,
            chapterNum,
            currentDiffMap: diffMap,
            mutWorkingFiles: mutWorkingFilesRef,
            currentWorkingFilesSidMap: currentSidMap.current,
            originalSidMap: originalSidMapRef.current,
        });
        if (!newMap) {
            return;
        }
        setDiffMap(newMap);
    }

    const handleRevert = (diffToRevert: ProjectDiff) => {
        console.time("handleRevert");
        const sidParsed = parseSid(diffToRevert.semanticSid);
        if (!sidParsed) {
            console.error("Invalid SID in diffToRevert");
            return;
        }
        // 1. Directly mutate the 'workingFilesRef' source of truth via the references
        //    held in the diff object.
        console.time("mutateWorkingFilesRefRevertChange");
        mutateWorkingFilesRefRevertChange(
            diffToRevert,
            mutWorkingFilesRef,
            originalSidMapRef.current,
        );
        console.timeEnd("mutateWorkingFilesRefRevertChange");
        // 2. The `workingFiles` object is now correct, but the in-memory maps
        //    and the derived diff list are stale. We must now update them.

        // 3. Update the `currentSidMap` for the affected chapter.
        const { book, chapter } = sidParsed;
        const changedChapter = mutWorkingFilesRef
            .find((file) => file.bookCode === book)
            ?.chapters.find((chap) => chap.chapNumber === chapter);
        if (!changedChapter) {
            console.error("Invalid chapter in diffToRevert");
            return;
        }
        // the calcs new section of the map, and then runs diffs no that new section, and then pushes to diffs state
        updateDiffMapForChapter(book, chapter);
        // if we just reverted a sid we are currently viewing, update editor underneath:
        if (
            book === pickedFile?.bookCode &&
            chapter === pickedChapter?.chapNumber &&
            editorRef.current
        ) {
            editorRef.current.setEditorState(
                editorRef.current.parseEditorState(changedChapter.lexicalState),
                {
                    tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                },
            );
        }
        console.timeEnd("handleRevert");
    };

    // The list of diffs for the UI is now easily derived from the map.
    const diffListForUI = useMemo(() => {
        return Object.values(diffMap);
    }, [diffMap]);

    function toggleDiffModal(saveCurrentDirtyLexical: () => void) {
        if (openDiffModal) {
            setOpenDiffModal(false);
        } else {
            saveCurrentDirtyLexical();
            if (pickedFile && pickedChapter) {
                updateDiffMapForChapter(
                    pickedFile.bookCode,
                    pickedChapter.chapNumber,
                );
                setOpenDiffModal(true);
            }
        }
    }
    const closeModal = useCallback(() => {
        setOpenDiffModal(false);
    }, []);

    async function saveProjectToDisk() {
        const toSave: Record<string, string> = {};
        const uniqueBookIdsWithDiff = Object.keys(diffMap).reduce(
            (acc, key) => {
                const parsed = parseSid(key);
                if (!parsed) {
                    return acc;
                }
                acc.add(parsed.book);
                return acc;
            },
            new Set<string>(),
        );
        mutWorkingFilesRef
            .filter((file) => uniqueBookIdsWithDiff.has(file.bookCode))
            .forEach((file) => {
                toSave[file.bookCode] = "";
                file.chapters.forEach((chap) => {
                    const usfmPortion = serializeToUsfmString(
                        chap.lexicalState.root.children,
                    );
                    toSave[file.bookCode] += usfmPortion;
                });
            });
        const savePromise = await Promise.allSettled(
            Object.entries(toSave).map(async ([bookCode, content]) => {
                await loadedProject.addBook({
                    bookCode,
                    contents: content,
                });
            }),
        );
        await Promise.all(savePromise);
        // notify if any errors
        const error = savePromise.find((p) => p.status === "rejected");
        if (error) {
            console.error(error);
        } else {
            // Show success notification only if there were no errors and there were actually changes to save
            if (Object.keys(toSave).length > 0) {
                ShowNotificationSuccess({
                    notification: {
                        message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                        title: "Project Saved",
                    },
                });
            }
        }
        // now update the originalSidMapRef.current to = currentSidMap.current since we just saved the current state to disk
        originalSidMapRef.current = structuredClone(currentSidMap.current);
        // for the mutWorkingFiles, we also want to set their loadedLexical state to all the current state:
        mutWorkingFilesRef.forEach((file) => {
            file.chapters.forEach((chap) => {
                chap.loadedLexicalState = structuredClone(chap.lexicalState);
            });
        });
        // And recompute the diff map
        setDiffMap(
            calculateInitialDiffs(
                originalSidMapRef.current,
                currentSidMap.current,
            ),
        );
    }

    const handleRevertAll = () => {
        revertAllChanges({
            mutWorkingFilesRef,
            currentSidMap,
            originalSidMap: originalSidMapRef,
            setDiffMap,
            pickedFile,
            pickedChapter,
            editorRef,
        });
    };

    // HOOK RETURN
    return {
        /**
         * An array of parsed file diffs ready to be rendered by react-diff-view,
         * or null if no calculation has been run.
         */
        diffs: diffListForUI,
        toggleDiffModal,
        openDiffModal,
        closeModal,
        updateDiffMapForChapter,
        handleRevert,
        handleRevertAll,
        saveProjectToDisk,
    };
}

function revertAllChanges({
    mutWorkingFilesRef,
    currentSidMap,
    originalSidMap,
    setDiffMap,
    pickedFile,
    pickedChapter,
    editorRef,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentSidMap: { current: FileChapScopedSids };
    originalSidMap: { current: FileChapScopedSids };
    setDiffMap: (diffMap: DiffMap) => void;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    editorRef: React.RefObject<LexicalEditor | null>;
}) {
    for (const file of mutWorkingFilesRef) {
        for (const chap of file.chapters) {
            chap.lexicalState = structuredClone(chap.loadedLexicalState);
            chap.dirty = false;
        }
    }

    // Update the currentSidMap
    currentSidMap.current = getProjectSidContentMap(
        mutWorkingFilesRef,
        (c) => c.lexicalState,
    );

    // Recompute the diff map
    setDiffMap(
        calculateInitialDiffs(originalSidMap.current, currentSidMap.current),
    );

    // If we are currently viewing a chapter, update the editor
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

// A helper function to process files, avoiding code duplication
/**
 * Creates a single, flat, project-wide map of SIDs to their rich content.
 * This map is a "view" that contains direct references back to the node arrays
 * within the workingFiles structure, enabling direct mutation.
 *
 * @param workingFiles The complete array of parsed files.
 * @param getLexicalState A function to extract either the current or original state from a chapter.
 * @returns A single, flat SidContentMap for the entire project.
 */
function getProjectSidContentMap(
    workingFiles: ParsedFile[],
    getLexicalState: (chap: ParsedChapter) => SerializedEditorState,
): FileChapScopedSids {
    const projectMap: FileChapScopedSids = {};
    console.time("getProjectSidContentMap");
    // 1. Iterate through each file
    for (const file of workingFiles) {
        projectMap[file.bookCode] = {};
        // 2. Iterate through each chapter in the file
        for (const chapter of file.chapters) {
            const lexicalState = getLexicalState(chapter);
            const chapterMap = getSidContentMapForChapter(lexicalState);
            projectMap[file.bookCode][chapter.chapNumber] = chapterMap;
            // if (file.bookCode === "GEN" && chapter.chapNumber === 1) {
            //     ;
            // }

            // 4. Merge this chapter's map into the single, project-wide map
            // Using Object.assign is a clean and performant way to do this.
            Object.assign(
                projectMap[file.bookCode][chapter.chapNumber],
                chapterMap,
            );
        }
    }
    console.timeEnd("getProjectSidContentMap");
    return projectMap;
}
function getSidContentMapForChapter(
    lexicalState: SerializedEditorState,
): SidContentMap {
    const chapterNodeList = lexicalState.root.children;
    return buildSidContentMapForChapter(chapterNodeList);
}
function updateMutSidContentMap(
    currentMap: FileChapScopedSids,
    mapToMergeIn: FileChapScopedSids,
    bookCode: string,
    chapterNum: number,
) {
    const currentApplicableKeys = currentMap[bookCode][String(chapterNum)];
    const mergeInKeys = mapToMergeIn[bookCode][String(chapterNum)];
    const allKeys = new Set([
        ...Object.keys(currentApplicableKeys),
        ...Object.keys(mergeInKeys),
    ]);
    for (const key of allKeys) {
        if (mergeInKeys[key]) {
            currentMap[bookCode][String(chapterNum)][key] = mergeInKeys[key];
        } else {
            delete currentMap[bookCode][String(chapterNum)][key];
        }
    }
}

//================================================================================
// 1. Updated Type Definitions
//================================================================================

export type ProjectDiff = {
    /** The unique key for this block (e.g., "GEN 1:2" or "GEN 1:2_dup_1") */
    uniqueKey: string;

    /** The clean, semantic SID for display purposes. */
    semanticSid: string;

    /** The status of the change, determined by positional diffing. */
    status: "added" | "deleted" | "modified";

    original: SidContent | null;
    current: SidContent | null;
    wordDiff?: Change[];
    originalDisplayText: string;
    currentDisplayText: string;
    bookCode: string;
    chapterNum: number;
    detail?: string;
};

export type DiffMap = Record<string, ProjectDiff>; // The key is the uniqueKey

//================================================================================
// 2. Core Diffing Functions (Refactored for Positional Awareness)
//================================================================================

/**
 * Creates a rich, detailed ProjectDiff object by comparing an original and current SidContent.
 * This is the single source of truth for building a diff.
 *
 * @param uniqueKey The unique key for this block (e.g., "GEN 1:2_dup_1").
 * @param original The original SidContent object, or null.
 * @param current The current SidContent object, or null.
 * @param status The positional status of the change.
 * @returns A fully enriched ProjectDiff object.
 */
function buildRichDiff(
    uniqueKey: string,
    original: SidContent | null,
    current: SidContent | null,
    status: "added" | "deleted" | "modified",
    bookCode: string,
    chapterNum: number,
): ProjectDiff {
    const semanticSid = original?.semanticSid ?? current?.semanticSid;
    if (!semanticSid) {
        console.error("No semantic SID found for diff");
        throw new Error("No semantic SID found for diff");
    }
    const structureHasChanged =
        original?.usfmStructure !== current?.usfmStructure;

    const originalDisplayText = structureHasChanged
        ? (original?.fullText ?? "")
        : (original?.plainTextStructure ?? "");
    const currentDisplayText = structureHasChanged
        ? (current?.fullText ?? "")
        : (current?.plainTextStructure ?? "");

    let wordDiff: Change[] | undefined;
    if (status === "modified") {
        wordDiff = diffWordsWithSpace(originalDisplayText, currentDisplayText);
    }
    const detail = current?.detail;

    return {
        uniqueKey,
        semanticSid,
        status,
        original,
        current,
        wordDiff,
        originalDisplayText,
        currentDisplayText,
        bookCode,
        chapterNum,
        detail,
    };
}

/**
 * Extracts an ordered sequence of unique block keys for a specific chapter from a SidContentMap.
 */
function getChapterKeySequence(chapterMap: SidContentMap): string[] {
    // 1. Get an array of [key, value] pairs from the map.
    const entries = Object.entries(chapterMap);

    // 2. Sort the entries based on the `foundOrder` of the value (the SidContent object).
    entries.sort(([, a], [, b]) => a.foundOrder - b.foundOrder);

    // 3. Map the sorted entries back to just their keys.
    return entries.map(([key]) => key);
}

/**
 * Calculates a semantically and positionally correct diff for a single chapter
 * using a Longest Common Subsequence (LCS) algorithm.
 *
 * @param originalChapterMap The SidContentMap for the original chapter state.
 * @param currentChapterMap The SidContentMap for the current chapter state.
 * @returns A DiffMap containing all additions, deletions, and modifications for the chapter.
 */
function calculatePositionalDiffsForChapter(
    originalChapterMap: SidContentMap,
    currentChapterMap: SidContentMap,
    bookCode: string,
    chapNum: number,
): DiffMap {
    const chapterDiffs: DiffMap = {};

    const originalSequence = getChapterKeySequence(originalChapterMap);
    const currentSequence = getChapterKeySequence(currentChapterMap);
    const sequenceChanges = diffArrays(originalSequence, currentSequence);

    for (const change of sequenceChanges) {
        if (change.added) {
            for (const uniqueKey of change.value) {
                if (chapterDiffs[uniqueKey]) {
                    // This block was already added or modified as a  known change
                    continue;
                }
                const cur = currentChapterMap[uniqueKey];
                if (!cur) {
                    throw new Error(
                        `Missing current content for key: ${uniqueKey}`,
                    );
                }
                chapterDiffs[uniqueKey] = buildRichDiff(
                    uniqueKey,
                    null,
                    cur,
                    "added",
                    bookCode,
                    chapNum,
                );
            }
        } else if (change.removed) {
            for (const uniqueKey of change.value) {
                if (chapterDiffs[uniqueKey]) {
                    // This block was already added or modified as a  known change
                    continue;
                }
                const original = originalChapterMap[uniqueKey];
                if (!original) {
                    throw new Error(
                        `Missing original content for key: ${uniqueKey}`,
                    );
                }
                chapterDiffs[uniqueKey] = buildRichDiff(
                    uniqueKey,
                    original,
                    null,
                    "deleted",
                    bookCode,
                    chapNum,
                );
            }
        } else {
            // Common (unmoved) blocks
            for (const uniqueKey of change.value) {
                const original = originalChapterMap[uniqueKey];
                if (!original) {
                    throw new Error(
                        `Missing original content for key: ${uniqueKey}`,
                    );
                }
                const current = currentChapterMap[uniqueKey];
                if (!current) {
                    throw new Error(
                        `Missing current content for key: ${uniqueKey}`,
                    );
                }

                if (original.fullText !== current.fullText) {
                    chapterDiffs[uniqueKey] = buildRichDiff(
                        uniqueKey,
                        original,
                        current,
                        "modified",
                        bookCode,
                        chapNum,
                    );
                }
            }
        }
    }
    return chapterDiffs;
}

//================================================================================
// 3. Orchestrator Functions (Adapted for the Nested Structure)
//================================================================================

/**
 * Performs a full comparison of the original and current project maps to generate
 * the initial, complete DiffMap, running chapter by chapter.
 */
function calculateInitialDiffs(
    originalMap: FileChapScopedSids,
    currentMap: FileChapScopedSids,
): DiffMap {
    const initialDiffMap: DiffMap = {};
    const allBookCodes = new Set([
        ...Object.keys(originalMap),
        ...Object.keys(currentMap),
    ]);

    for (const bookCode of allBookCodes) {
        const originalChapters = originalMap[bookCode] ?? {};
        const currentChapters = currentMap[bookCode] ?? {};
        const allChapterNums = new Set([
            ...Object.keys(originalChapters),
            ...Object.keys(currentChapters),
        ]);

        for (const chapNum of allChapterNums) {
            const originalChapterMap = originalChapters[chapNum] ?? {};
            const currentChapterMap = currentChapters[chapNum] ?? {};
            const chapterChanges = calculatePositionalDiffsForChapter(
                originalChapterMap,
                currentChapterMap,
                bookCode,
                Number(chapNum),
            );
            Object.assign(initialDiffMap, chapterChanges);
        }
    }
    return initialDiffMap;
}

/**
 * Surgically updates a project-wide DiffMap by recalculating and replacing the
 * diffs for only a single chapter.
 */
function updateChapterInDiffMap({
    bookCode,
    chapterNum,
    currentDiffMap,
    mutWorkingFiles,
    currentWorkingFilesSidMap,
    originalSidMap,
}: {
    bookCode: string;
    chapterNum: number;
    currentDiffMap: DiffMap;
    mutWorkingFiles: ParsedFile[];
    currentWorkingFilesSidMap: FileChapScopedSids;
    originalSidMap: FileChapScopedSids;
}): DiffMap {
    console.time("updateChapterInDiffMap");
    const newDiffMap = { ...currentDiffMap };
    // Step 1: Update the current SidContentMap for the changed chapter.
    const chapToUpdate = mutWorkingFiles
        .find((file) => file.bookCode === bookCode)
        ?.chapters.find((chap) => chap.chapNumber === chapterNum);
    if (!chapToUpdate) {
        console.error("Invalid chapter in updateChapterInDiffMap");
        return newDiffMap;
    }
    const newChapterMap = getSidContentMapForChapter(chapToUpdate.lexicalState);
    const asFileScopes = { [bookCode]: { [chapterNum]: newChapterMap } };
    updateMutSidContentMap(
        currentWorkingFilesSidMap,
        asFileScopes,
        bookCode,
        chapterNum,
    );

    // Step 3: Calculate the new, positionally-aware diffs for this chapter.
    const originalChapterMap = originalSidMap[bookCode]?.[chapterNum] ?? {};
    const currentChapterMap =
        currentWorkingFilesSidMap[bookCode]?.[chapterNum] ?? {};
    const chapterChanges = calculatePositionalDiffsForChapter(
        originalChapterMap,
        currentChapterMap,
        bookCode,
        chapterNum,
    );

    // Clear out any old diffs for this chapter from our copy before setting new
    for (const key in newDiffMap) {
        const sidParsed = parseSid(key);
        if (sidParsed?.book === bookCode && sidParsed?.chapter === chapterNum) {
            delete newDiffMap[key];
        }
    }

    // Step 4: Merge the new diffs back into the main map copy.
    Object.assign(newDiffMap, chapterChanges);

    console.timeEnd("updateChapterInDiffMap");
    return newDiffMap;
}

//================================================================================
// 4. Revert Logic (Updated to work with the Nested SID Map)
//================================================================================

/**
 * Helper to find a SID's content from the nested project map.
 */
function findSidInProjectMap(
    map: FileChapScopedSids,
    sid: string,
): SidContent | null {
    const parsed = parseSid(sid);
    if (!parsed) return null;
    return map[parsed.book]?.[parsed.chapter]?.[sid] ?? null;
}

/**
 * Finds the index of the TRUE last node of a semantic SID block.
 * This includes the last node with the given SID plus any subsequent "follower"
 * nodes (like line breaks) that appear before the next SID block begins.
 *
 * @param nodeList The array of nodes to search (e.g., a chapter's root.children).
 * @param sid The Scripture ID of the block to find the end of.
 * @returns The index of the very last node in the semantic block, or -1 if the SID is not found.
 */
function findEndOfSidBlockIndex(
    nodeList: SerializedLexicalNode[],
    sid: string,
): number {
    // Step 1: Find the last node that explicitly has the target SID.
    // We iterate backwards to find this starting point efficiently.
    let lastNodeWithSidIndex = -1;
    for (let i = nodeList.length - 1; i >= 0; i--) {
        const node = nodeList[i];
        if (isSerializedUSFMTextNode(node) && node.sid === sid) {
            lastNodeWithSidIndex = i;
            break; // Found our starting point, exit the loop.
        }
    }

    // If the SID itself was never found, we can't find its end.
    if (lastNodeWithSidIndex === -1) {
        return -1;
    }

    // Step 2: Scan forward from that point to find the true end of the block.
    // The end is the last node before we encounter a NEW SID.
    let endOfBlockIndex = lastNodeWithSidIndex;
    for (let i = lastNodeWithSidIndex + 1; i < nodeList.length; i++) {
        const nextNode = nodeList[i];

        // The block ends as soon as we hit any node that has a SID property.
        // This marks the beginning of the next semantic block.
        if (isSerializedUSFMTextNode(nextNode) && nextNode.sid) {
            break; // We've gone too far, so the previous index was the true end.
        }

        // If the node has no SID, it's a follower (like <br>).
        // Extend our block's boundary to include it.
        endOfBlockIndex = i;
    }

    return endOfBlockIndex;
}

/**
 * Reverts a single change by directly mutating the serialized lexical state.
 */
function mutateWorkingFilesRefRevertChange(
    diff: ProjectDiff,
    mutWorkingFilesRef: ParsedFile[],
    originalSidMap: FileChapScopedSids, // Now takes the nested map
) {
    const isAddition = diff.original === null;
    const isDeletion = diff.current === null;

    if (isAddition && diff.current) {
        const { parentChapterNodeList, startIndexInParent, nodes } =
            diff.current;
        parentChapterNodeList.splice(startIndexInParent, nodes.length);
        return;
    }

    if (isDeletion && diff.original) {
        const { nodes: originalNodes } = diff.original;
        const sidParsed = parseSid(diff.semanticSid);
        if (!sidParsed) return;

        const targetChapter = mutWorkingFilesRef
            .find((file) => file.bookCode === sidParsed.book)
            ?.chapters.find((chap) => chap.chapNumber === sidParsed.chapter);
        if (!targetChapter) return;

        const topPara = targetChapter.lexicalState.root.children[0];
        if (!isSerializedElementNode(topPara)) return;
        const targetNodeList = topPara.children;

        let insertionIndex = 0;
        let anchorSidToSearch = diff.original.previousSid;

        while (anchorSidToSearch) {
            const anchorNodeIndex = findEndOfSidBlockIndex(
                targetNodeList,
                anchorSidToSearch,
            );
            if (anchorNodeIndex !== -1) {
                insertionIndex = anchorNodeIndex + 1;
                break;
            } else {
                // Use the new helper to look up the previous block in the nested map.
                const previousBlockInChain = findSidInProjectMap(
                    originalSidMap,
                    anchorSidToSearch,
                );
                anchorSidToSearch = previousBlockInChain
                    ? previousBlockInChain.previousSid
                    : null;
            }
        }
        targetNodeList.splice(insertionIndex, 0, ...originalNodes);
        return;
    }

    if (diff.current && diff.original) {
        const {
            parentChapterNodeList,
            startIndexInParent,
            nodes: currentNodes,
        } = diff.current;
        const { nodes: originalNodes } = diff.original;
        parentChapterNodeList.splice(
            startIndexInParent,
            currentNodes.length,
            ...originalNodes,
        );
        return;
    }
}
