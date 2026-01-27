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
}

interface ParagraphingContextType {
    isActive: boolean;
    queue: Marker[];
    currentIndex: number;
    currentMarker: Marker | null;
    activate: (queue: Marker[]) => void;
    deactivate: () => void;
    stamp: () => void;
    skip: () => void;
    undo: () => void;
}

const ParagraphingContext = createContext<ParagraphingContextType | undefined>(
    undefined,
);

export function ParagraphingProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isActive, setIsActive] = useState(false);
    const [queue, setQueue] = useState<Marker[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [history, setHistory] = useState<number[]>([]);

    const activate = useCallback((newQueue: Marker[]) => {
        setQueue(newQueue);
        setCurrentIndex(0);
        setHistory([]);
        setIsActive(true);
    }, []);

    const deactivate = useCallback(() => {
        setIsActive(false);
        setQueue([]);
        setCurrentIndex(0);
        setHistory([]);
    }, []);

    const stamp = useCallback(() => {
        if (!isActive) return;
        setHistory((prev) => [...prev, currentIndex]);
        setCurrentIndex((prev) => Math.min(prev + 1, queue.length));
    }, [isActive, currentIndex, queue.length]);

    const skip = useCallback(() => {
        if (!isActive) return;
        setHistory((prev) => [...prev, currentIndex]);
        setCurrentIndex((prev) => Math.min(prev + 1, queue.length));
    }, [isActive, currentIndex, queue.length]);

    const undo = useCallback(() => {
        if (!isActive || history.length === 0) return;
        const prevIndex = history[history.length - 1];
        setHistory((prev) => prev.slice(0, -1));
        setCurrentIndex(prevIndex);
    }, [isActive, history]);

    const currentMarker = useMemo(() => {
        if (!isActive || currentIndex >= queue.length) return null;
        return queue[currentIndex];
    }, [isActive, currentIndex, queue]);

    const value = useMemo(
        () => ({
            isActive,
            queue,
            currentIndex,
            currentMarker,
            activate,
            deactivate,
            stamp,
            skip,
            undo,
        }),
        [
            isActive,
            queue,
            currentIndex,
            currentMarker,
            activate,
            deactivate,
            stamp,
            skip,
            undo,
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
