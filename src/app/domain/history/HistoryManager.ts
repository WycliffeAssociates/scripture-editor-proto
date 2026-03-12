export type HistoryChapterRef = {
    bookCode: string;
    chapterNum: number;
};

export type HistorySnapshotChange<TSnapshot> = {
    chapter: HistoryChapterRef;
    before: TSnapshot;
    after: TSnapshot;
    selectionBefore?: unknown;
    selectionAfter?: unknown;
};

type HistoryEntrySource = "typing" | "transaction";

export type HistoryEntry<TSnapshot> = {
    id: string;
    label: string;
    source: HistoryEntrySource;
    timestamp: number;
    changes: HistorySnapshotChange<TSnapshot>[];
};

type HistoryManagerOptions = {
    maxEntries: number;
    coalesceWindowMs: number;
    now?: () => number;
};

type RecordTypingChangeArgs<TSnapshot> = {
    label: string;
    change: HistorySnapshotChange<TSnapshot>;
    forceNewEntry?: boolean;
};

type PushTransactionArgs<TSnapshot> = {
    label: string;
    changes: HistorySnapshotChange<TSnapshot>[];
};

export class HistoryManager<TSnapshot> {
    private readonly maxEntries: number;
    private readonly coalesceWindowMs: number;
    private readonly now: () => number;
    private entries: HistoryEntry<TSnapshot>[] = [];
    private cursor = 0;
    private idCounter = 0;

    constructor(options: HistoryManagerOptions) {
        this.maxEntries = options.maxEntries;
        this.coalesceWindowMs = options.coalesceWindowMs;
        this.now = options.now ?? Date.now;
    }

    canUndo() {
        return this.cursor > 0;
    }

    canRedo() {
        return this.cursor < this.entries.length;
    }

    peekUndoLabel() {
        if (!this.canUndo()) return null;
        return this.entries[this.cursor - 1]?.label ?? null;
    }

    peekRedoLabel() {
        if (!this.canRedo()) return null;
        return this.entries[this.cursor]?.label ?? null;
    }

    recordTypingChange(args: RecordTypingChangeArgs<TSnapshot>) {
        this.truncateRedoBranch();
        const timestamp = this.now();
        const latest = this.entries[this.cursor - 1];
        const canMerge =
            !args.forceNewEntry &&
            latest &&
            latest.source === "typing" &&
            latest.label === args.label &&
            timestamp - latest.timestamp <= this.coalesceWindowMs &&
            latest.changes.length === 1 &&
            latest.changes[0]?.chapter.bookCode ===
                args.change.chapter.bookCode &&
            latest.changes[0]?.chapter.chapterNum ===
                args.change.chapter.chapterNum;

        if (canMerge && latest) {
            latest.timestamp = timestamp;
            latest.changes[0] = {
                ...latest.changes[0],
                after: args.change.after,
                selectionAfter: args.change.selectionAfter,
            };
            return latest;
        }

        return this.pushEntry({
            label: args.label,
            source: "typing",
            timestamp,
            changes: [args.change],
        });
    }

    mergeLatestChapterAfter(
        chapter: HistoryChapterRef,
        after: TSnapshot,
        selectionAfter?: unknown,
    ): boolean {
        if (!this.canUndo()) return false;
        const latest = this.entries[this.cursor - 1];
        if (!latest) return false;
        const match = latest.changes.find(
            (c) =>
                c.chapter.bookCode === chapter.bookCode &&
                c.chapter.chapterNum === chapter.chapterNum,
        );
        if (!match) return false;
        match.after = after;
        match.selectionAfter = selectionAfter;
        latest.timestamp = this.now();
        return true;
    }

    pushTransaction(args: PushTransactionArgs<TSnapshot>) {
        if (!args.changes.length) return null;
        this.truncateRedoBranch();
        return this.pushEntry({
            label: args.label,
            source: "transaction",
            timestamp: this.now(),
            changes: args.changes,
        });
    }

    undo(): HistoryEntry<TSnapshot> | null {
        if (!this.canUndo()) return null;
        this.cursor -= 1;
        return this.entries[this.cursor] ?? null;
    }

    redo(): HistoryEntry<TSnapshot> | null {
        if (!this.canRedo()) return null;
        const entry = this.entries[this.cursor] ?? null;
        if (entry) {
            this.cursor += 1;
        }
        return entry;
    }

    reset() {
        this.entries = [];
        this.cursor = 0;
    }

    private truncateRedoBranch() {
        if (!this.canRedo()) return;
        this.entries = this.entries.slice(0, this.cursor);
    }

    private pushEntry(args: {
        label: string;
        source: HistoryEntrySource;
        timestamp: number;
        changes: HistorySnapshotChange<TSnapshot>[];
    }): HistoryEntry<TSnapshot> {
        const entry: HistoryEntry<TSnapshot> = {
            id: `history-entry-${this.idCounter++}`,
            label: args.label,
            source: args.source,
            timestamp: args.timestamp,
            changes: args.changes,
        };
        this.entries.push(entry);
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        } else {
            this.cursor += 1;
        }
        if (this.cursor > this.entries.length) {
            this.cursor = this.entries.length;
        }
        return entry;
    }
}
