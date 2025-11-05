// hooks/useProjectDiffs.ts

import type {
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import { useEffectOnce } from "react-use";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";
import {
    buildSidContentMapForChapter,
    type SidContent,
    type SidContentMap,
} from "@/app/domain/editor/serialization/lexicalToUsfm";
import { makeSid, parseSid } from "@/core/data/bible/bible";

// Import types from react-diff-view

type UseProjectDiffsProps = {
    mutWorkingFilesRef: ParsedFile[];
    // setWorkingFiles: (files: ParsedFile[]) => void;
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
};
export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;

export function useProjectDiffs({
    mutWorkingFilesRef,
    editorRef,
    pickedFile,
    pickedChapter,
    saveCurrentDirtyLexical,
    // setWorkingFiles,
}: UseProjectDiffsProps) {
    const [diffMap, setDiffMap] = useState<DiffMap>({});
    const [openDiffModal, setOpenDiffModal] = useState(false);
    // const [isCalculating, setIsCalculating] = useState(false);
    // lie to ts a moment ot make life nicer below
    const currentSidMap = useRef(null) as unknown as { current: SidContentMap };
    const originalSidMapRef = useRef(null) as unknown as {
        current: SidContentMap;
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

    // todo: reverting deletions not working see above todo first?  Todo, if reversion not working well or bugy, jut make it a preview with go to sid, and editing in place taken. Need to get actually writing to file working. Take workingFileMut and pass to get string serialize function and write. And save on open of modal.
    const handleRevert = (diffToRevert: ProjectDiff) => {
        console.time("handleRevert");
        const sidParsed = parseSid(diffToRevert.sid);
        if (!sidParsed) {
            console.error("Invalid SID in diffToRevert");
            return;
        }
        // 1. Directly mutate the 'workingFilesRef' source of truth via the references
        //    held in the diff object.
        debugger;
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
            );
        }
        // STEP 4: PUBLISH THE MUTATED STATE BACK TO REACT.
        // This is the final and most important step.
        // We create a new array reference to trigger a re-render for any component
        // that depends on the `workingFiles` prop.
        // setWorkingFiles([...mutWorkingFilesRef]);
        console.timeEnd("handleRevert");
    };

    // The list of diffs for the UI is now easily derived from the map.
    const diffListForUI = useMemo(() => {
        return Object.values(diffMap);
    }, [diffMap]);

    function toggleDiffModal() {
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
    };
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
export function getProjectSidContentMap(
    workingFiles: ParsedFile[],
    getLexicalState: (chap: ParsedChapter) => SerializedEditorState,
): SidContentMap {
    const projectMap: SidContentMap = {};
    console.time("getProjectSidContentMap");
    // 1. Iterate through each file
    for (const file of workingFiles) {
        // 2. Iterate through each chapter in the file
        for (const chapter of file.chapters) {
            const lexicalState = getLexicalState(chapter);
            const chapterMap = getSidContentMapForChapter(lexicalState);

            // 4. Merge this chapter's map into the single, project-wide map
            // Using Object.assign is a clean and performant way to do this.
            Object.assign(projectMap, chapterMap);
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
    currentMap: SidContentMap,
    mapToMergeIn: SidContentMap,
    bookCode: string,
    chapterNum: number,
) {
    const currentApplicableKeys = Object.keys(currentMap).filter((key) =>
        key.startsWith(`${makeSid({ bookId: bookCode, chapter: chapterNum })}`),
    );
    const allKeys = new Set([
        ...currentApplicableKeys,
        ...Object.keys(mapToMergeIn),
    ]);
    for (const key of allKeys) {
        if (mapToMergeIn[key]) {
            currentMap[key] = mapToMergeIn[key];
        } else {
            delete currentMap[key];
        }
    }
}

export type ProjectDiff = {
    sid: string;
    original: SidContent;
    current: SidContent;
};
export type DiffMap = Record<string, ProjectDiff>;
function* createDiffGenerator(
    originalMap: SidContentMap,
    currentMap: SidContentMap,
): Generator<ProjectDiff> {
    const allSids = new Set([
        ...Object.keys(originalMap),
        ...Object.keys(currentMap),
    ]);

    for (const sid of allSids) {
        const original = originalMap[sid] ?? null;
        const current = currentMap[sid] ?? null;

        if (original?.text !== current?.text) {
            yield { sid, original, current };
        }
    }
}
function calculateInitialDiffs(
    originalMap: SidContentMap,
    currentMap: SidContentMap,
): DiffMap {
    const diffGenerator = createDiffGenerator(originalMap, currentMap);
    const initialDiffMap: DiffMap = {};

    for (const diff of diffGenerator) {
        initialDiffMap[diff.sid] = diff;
    }

    return initialDiffMap;
}
/**
 * Surgically updates an existing DiffMap by re-calculating the differences for
 * only a single chapter. This function MUTATES the `diffMap` for performance.
 *
 * @param diffMap The current DiffMap to be updated.
 * @param originalMap The complete original SidContentMap.
 * @param currentMap The complete current SidContentMap.
 * @param bookCode The book code of the chapter that changed.
 * @param chapterNum The number of the chapter that changed.
 */
function updateDiffsForChapter(
    diffMap: DiffMap,
    originalMap: SidContentMap,
    currentMap: SidContentMap,
    bookCode: string,
    chapterNum: number,
): void {
    const chapterPrefix = makeSid({ bookId: bookCode, chapter: chapterNum });

    // Step 1: Find all SIDs relevant to this chapter from BOTH original and current states.
    const chapterSids = new Set<string>();
    for (const sid in originalMap) {
        if (sid.startsWith(chapterPrefix)) {
            chapterSids.add(sid);
        }
    }
    for (const sid in currentMap) {
        if (sid.startsWith(chapterPrefix)) {
            chapterSids.add(sid);
        }
    }

    // Step 2: Iterate through the relevant SIDs and update the main diffMap.
    for (const sid of chapterSids) {
        const original = originalMap[sid] ?? null;
        const current = currentMap[sid] ?? null;

        const hasDifference = original?.text !== current?.text;

        if (hasDifference) {
            // If there's a difference, add or update it in the map.
            diffMap[sid] = { sid, original, current };
        } else {
            // If there's NO difference, ensure it's removed from the map.
            // This correctly handles cases where a user reverts a change.
            delete diffMap[sid];
        }
    }
    // step 3; if diffMap has any keys left not in chapterSids, delete them
    for (const sid in diffMap) {
        if (!chapterSids.has(sid)) {
            delete diffMap[sid];
        }
    }
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

function mutateWorkingFilesRefRevertChange(
    diff: ProjectDiff,
    mutWorkingFilesRef: ParsedFile[],
    originalSidMap: SidContentMap,
) {
    const isAddition = diff.original === null;
    const isDeletion = diff.current === null;

    // --- Case 1: Reverting an ADDITION (Action: Delete current nodes) ---
    if (isAddition && diff.current) {
        const { parentChapterNodeList, startIndexInParent, nodes } =
            diff.current;

        // Remove the added nodes from the parent array.
        parentChapterNodeList.splice(startIndexInParent, nodes.length);
        return;
    }

    // --- Case 2: Reverting a DELETION (ROBUST IMPLEMENTATION) ---
    if (isDeletion && diff.original) {
        const { nodes: originalNodes } = diff.original;
        const sidParsed = parseSid(diff.sid);
        if (!sidParsed) return;

        const targetChapter = mutWorkingFilesRef
            .find((file) => file.bookCode === sidParsed.book)
            ?.chapters.find((chap) => chap.chapNumber === sidParsed.chapter);
        if (!targetChapter) return;

        const topPara = targetChapter.lexicalState.root.children[0];
        if (!isSerializedElementNode(topPara)) return;
        const targetNodeList = topPara.children;

        // --- Find the Stable Anchor ---
        let insertionIndex = 0; // Default to start of chapter
        let anchorSidToSearch = diff.original.previousSid; // Start with the immediate predecessor

        while (anchorSidToSearch) {
            // Try to find the anchor in the CURRENT document state
            const anchorNodeIndex = findEndOfSidBlockIndex(
                targetNodeList,
                anchorSidToSearch,
            );

            if (anchorNodeIndex !== -1) {
                // SUCCESS: We found a stable anchor that still exists.
                insertionIndex = anchorNodeIndex + 1;
                break; // Exit the loop
            } else {
                // FAILURE: This anchor was also deleted. Trace back further.
                // Use the originalSidMap to find the *next* predecessor in the original chain.
                const previousBlockInChain = originalSidMap[anchorSidToSearch];
                anchorSidToSearch = previousBlockInChain
                    ? previousBlockInChain.previousSid
                    : null;
            }
        }
        // If the loop finishes without breaking, no anchor was found, and insertionIndex remains 0.

        // Insert the original nodes at the determined stable position.
        targetNodeList.splice(insertionIndex, 0, ...originalNodes);
        return;
    }

    // --- Case 3: Reverting a MODIFICATION (Action: Replace current with original) ---
    if (diff.current && diff.original) {
        const {
            parentChapterNodeList,
            startIndexInParent,
            nodes: currentNodes,
        } = diff.current;
        const { nodes: originalNodes } = diff.original;

        // Perform an atomic replace operation at the exact same starting index.
        parentChapterNodeList.splice(
            startIndexInParent,
            currentNodes.length,
            ...originalNodes,
        );
        return;
    }
}
type UpdateDiffMapArgs = {
    bookCode: string;
    chapterNum: number;
    currentDiffMap: DiffMap;
    mutWorkingFiles: ParsedFile[];
    currentWorkingFilesSidMap: SidContentMap;
    originalSidMap: SidContentMap;
};
function updateChapterInDiffMap({
    bookCode,
    chapterNum,
    currentDiffMap,
    mutWorkingFiles,
    currentWorkingFilesSidMap,
    originalSidMap,
}: UpdateDiffMapArgs) {
    console.time("updateDiffMapForChapter");
    // To work with React state, we create a copy before mutating.
    const newDiffMap = { ...currentDiffMap };
    const chapToUpdate = mutWorkingFiles
        .find((file) => file.bookCode === bookCode)
        ?.chapters.find((chap) => chap.chapNumber === chapterNum);
    if (!chapToUpdate) {
        console.error("Invalid chapter in diffToRevert");
        return;
    }
    const newMapPiece = getSidContentMapForChapter(chapToUpdate.lexicalState);
    // get the new sid content map for this chapter first. Mutates the currentSidMap to latest
    updateMutSidContentMap(
        currentWorkingFilesSidMap,
        newMapPiece,
        bookCode,
        chapterNum,
    );
    // now for that chapter, calc if there are any diffs
    updateDiffsForChapter(
        newDiffMap,
        originalSidMap,
        currentWorkingFilesSidMap,
        bookCode,
        chapterNum,
    );
    console.timeEnd("updateDiffMapForChapter");
    return newDiffMap;
}
