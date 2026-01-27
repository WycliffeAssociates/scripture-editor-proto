import type { SerializedEditorState } from "lexical";
import type React from "react";
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

export interface Marker {
    type: string;
    text?: string;
    verse?: string;
    verseNumber?: string;
    contextText?: string;
    sid?: string;
    id: string;
}

export type ParagraphingSnapshot = {
    fileBibleIdentifier: string;
    chapterNumber: number;
    serializedState: SerializedEditorState;
    wasDirty: boolean;
};

interface ParagraphingContextType {
    isParagraphingActive: boolean;
    paragraphingMarkerQueue: Marker[];
    currentParagraphingQueueIndex: number;
    currentParagraphingMarker: Marker | null;
    paragraphingSnapshot: ParagraphingSnapshot | null;
    activateParagraphingMode: (paragraphingMarkerQueue: Marker[]) => void;
    deactivateParagraphingMode: () => void;
    setParagraphingSnapshot: (snapshot: ParagraphingSnapshot | null) => void;
    stampParagraphingMarker: () => void;
    skipParagraphingMarker: () => void;
    undoParagraphingMarker: () => void;
}

const ParagraphingContext = createContext<ParagraphingContextType | undefined>(
    undefined,
);

export function ParagraphingProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isParagraphingActive, setIsParagraphingActive] = useState(false);
    const [paragraphingMarkerQueue, setParagraphingMarkerQueue] = useState<
        Marker[]
    >([]);
    const [currentParagraphingQueueIndex, setCurrentParagraphingQueueIndex] =
        useState(0);
    const [history, setHistory] = useState<number[]>([]);
    const [paragraphingSnapshot, setParagraphingSnapshot] =
        useState<ParagraphingSnapshot | null>(null);

    const activateParagraphingMode = useCallback(
        (newParagraphingMarkerQueue: Marker[]) => {
            setParagraphingMarkerQueue(newParagraphingMarkerQueue);
            setCurrentParagraphingQueueIndex(0);
            setHistory([]);
            setIsParagraphingActive(true);
        },
        [],
    );

    const deactivateParagraphingMode = useCallback(() => {
        setIsParagraphingActive(false);
        setParagraphingMarkerQueue([]);
        setCurrentParagraphingQueueIndex(0);
        setHistory([]);
        setParagraphingSnapshot(null);
    }, []);

    const stampParagraphingMarker = useCallback(() => {
        if (!isParagraphingActive) return;
        setHistory((prev) => [...prev, currentParagraphingQueueIndex]);
        setCurrentParagraphingQueueIndex((prev) =>
            Math.min(prev + 1, paragraphingMarkerQueue.length),
        );
    }, [
        isParagraphingActive,
        currentParagraphingQueueIndex,
        paragraphingMarkerQueue.length,
    ]);

    const skipParagraphingMarker = useCallback(() => {
        if (!isParagraphingActive) return;
        setHistory((prev) => [...prev, currentParagraphingQueueIndex]);
        setCurrentParagraphingQueueIndex((prev) =>
            Math.min(prev + 1, paragraphingMarkerQueue.length),
        );
    }, [
        isParagraphingActive,
        currentParagraphingQueueIndex,
        paragraphingMarkerQueue.length,
    ]);

    const undoParagraphingMarker = useCallback(() => {
        if (!isParagraphingActive || history.length === 0) return;
        const prevIndex = history[history.length - 1];
        setHistory((prev) => prev.slice(0, -1));
        setCurrentParagraphingQueueIndex(prevIndex);
    }, [isParagraphingActive, history]);

    const currentParagraphingMarker = useMemo(() => {
        if (
            !isParagraphingActive ||
            currentParagraphingQueueIndex >= paragraphingMarkerQueue.length
        )
            return null;
        return paragraphingMarkerQueue[currentParagraphingQueueIndex];
    }, [
        isParagraphingActive,
        currentParagraphingQueueIndex,
        paragraphingMarkerQueue,
    ]);

    const value = useMemo(
        () => ({
            isParagraphingActive,
            paragraphingMarkerQueue,
            currentParagraphingQueueIndex,
            currentParagraphingMarker,
            paragraphingSnapshot,
            activateParagraphingMode,
            deactivateParagraphingMode,
            setParagraphingSnapshot,
            stampParagraphingMarker,
            skipParagraphingMarker,
            undoParagraphingMarker,
        }),
        [
            isParagraphingActive,
            paragraphingMarkerQueue,
            currentParagraphingQueueIndex,
            currentParagraphingMarker,
            paragraphingSnapshot,
            activateParagraphingMode,
            deactivateParagraphingMode,
            stampParagraphingMarker,
            skipParagraphingMarker,
            undoParagraphingMarker,
        ],
    );

    return (
        <ParagraphingContext.Provider value={value}>
            {children}
        </ParagraphingContext.Provider>
    );
}

export function useParagraphing() {
    const context = useContext(ParagraphingContext);
    if (context === undefined) {
        throw new Error(
            "useParagraphing must be used within a ParagraphingProvider",
        );
    }
    return context;
}
