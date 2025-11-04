// hooks/useProjectDiffs.ts

import type { SerializedEditorState } from "lexical";
import { useCallback, useRef, useState } from "react";
import type {
    ParsedChapter,
    ParsedFile,
    ProjectFile,
} from "@/app/data/parsedProject";
import { processSerializedNodes } from "@/app/domain/editor/serialization/lexicalToUsfm";

// Import types from react-diff-view

type UseProjectDiffsProps = {
    workingFiles: ParsedFile[];
};
export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;

export function useProjectDiffs({ workingFiles }: UseProjectDiffsProps) {
    const [diffs, setDiffs] = useState<ProjectDiff[] | null>(null);
    const [openDiffModal, setOpenDiffModal] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);

    // Use a ref to capture the initial "loaded" state of the files.
    // This ensures we have a stable original version to compare against.
    const originalFilesSidMap = useRef(
        getSidUsfmMap(
            workingFiles,
            (chap: ParsedChapter) => chap.loadedLexicalState,
        ),
    );
    const toggleDiffModal = useCallback(() => {
        if (openDiffModal) {
            setOpenDiffModal(false);
        } else {
            calculateDiffs();
            setOpenDiffModal(true);
        }
    }, []);
    const closeModal = useCallback(() => {
        setOpenDiffModal(false);
    }, []);

    /**
     * Calculates the differences between the original and current project states.
     * This process is memory-efficient, creating and parsing diffs one by one.
     */
    const calculateDiffs = () =>
        calcDiffs(
            setIsCalculating,
            workingFiles,
            originalFilesSidMap.current,
            setDiffs,
        );

    return {
        /**
         * An array of parsed file diffs ready to be rendered by react-diff-view,
         * or null if no calculation has been run.
         */
        diffs,
        /** A boolean indicating if the diff calculation is in progress. */
        isCalculating,
        /** A stable function to trigger the diff calculation. */
        calculateDiffs,
        toggleDiffModal,
        openDiffModal,
        closeModal,
    };
}

type ProjectDiff = {
    sid: string;
    original: string;
    current: string;
};

export function* createDiffGenerator(
    originalFiles: ProcessForCompare[],
    currentFiles: ProcessForCompare[],
): Generator<ProjectDiff> {
    for (let i = 0; i < currentFiles.length; i++) {
        const currentFile = currentFiles[i];
        const originalFile = originalFiles[i];

        if (!currentFile || !originalFile) continue;

        const originalChapters = originalFile.chapters;
        const currentChapters = currentFile.chapters;

        const allChapterSids = new Set([
            ...Object.keys(originalChapters),
            ...Object.keys(currentChapters),
        ]);

        for (const chapterSid of allChapterSids) {
            const originalVerses = originalChapters[chapterSid] ?? {};
            const currentVerses = currentChapters[chapterSid] ?? {};

            const allVerseSids = new Set([
                ...Object.keys(originalVerses),
                ...Object.keys(currentVerses),
            ]);

            for (const verseSid of allVerseSids) {
                const originalText = originalVerses[verseSid] ?? null;
                const currentText = currentVerses[verseSid] ?? null;

                // Yield the change if the texts are different.
                if (originalText !== currentText) {
                    yield {
                        sid: verseSid,
                        original: originalText,
                        current: currentText,
                    };
                }
            }
        }
    }
}

// For easier comparison, flatten the nested structure into simple SID -> text maps
const flattenUsfmSidMap = (
    processedFiles: ProcessForCompare[],
): Record<string, string> => {
    return processedFiles.reduce(
        (acc, file) => {
            Object.values(file.chapters).forEach((verses) => {
                Object.entries(verses).forEach(([sid, text]) => {
                    acc[sid] = text;
                });
            });
            return acc;
        },
        {} as Record<string, string>,
    );
};

// A helper function to process files, avoiding code duplication
type ProcessForCompare = ProjectFile & {
    chapters: Record<string, Record<string, string>>;
};
const getSidUsfmMap = (
    workingFiles: ParsedFile[],
    getLexicalState: (chap: ParsedChapter) => SerializedEditorState,
): ProcessForCompare[] => {
    return workingFiles.map((file) => ({
        ...file,
        chapters: file.chapters.reduce(
            (acc: Record<string, Record<string, string>>, chap) => {
                const chapterSid = `${file.bookCode} ${chap.chapNumber}`;
                const lexicalState = getLexicalState(chap);
                acc[chapterSid] = processSerializedNodes(
                    lexicalState.root.children,
                    {
                        mode: "sidUsfmMap",
                    },
                    {} as Record<string, string>,
                );
                return acc;
            },
            {} as Record<string, Record<string, string>>,
        ),
    }));
};

const calcDiffs = (
    setIsCalculating: (value: boolean) => void,
    workingFiles: ParsedFile[],
    originalFilesSidMap: ProcessForCompare[],
    setDiffs: (value: ProjectDiff[] | null) => void,
) => {
    setIsCalculating(true);
    // Use queueMicrotask to allow the UI to update with the loading state
    // before we start the potentially long-running diff process.
    queueMicrotask(() => {
        const current = getSidUsfmMap(
            workingFiles,
            (chap: ParsedChapter) => chap.lexicalState,
        );

        // Instantiate the memory-efficient generator.
        const diffGenerator = createDiffGenerator(originalFilesSidMap, current);

        const allParsedDiffs: ProjectDiff[] = [];

        // Iterate through each change without loading everything into memory.
        for (const diff of diffGenerator) {
            allParsedDiffs.push(diff);
        }
        setDiffs(allParsedDiffs);
        setIsCalculating(false);
    });
};
