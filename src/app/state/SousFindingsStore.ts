// TODO: replaced by the unified FindingsStore (findings-store-unification plan).
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";

type Listener = () => void;

/** Per-book sous result: the findings AND the segment map they resolve against. */
export type SousResultsByBook = Record<string, SousAnalyzeResult>;

/**
 * Workspace-scoped store for sous content findings — the sibling of
 * {@link LintStore}, deliberately simpler. The sous pipeline writes one book's
 * result per pass; React consumers read via `useSyncExternalStore`. It holds
 * the segment map alongside the findings because the editor needs segments to
 * resolve each finding's `(sid, range)` to DOM rects.
 *
 * `Stream.switchMap` upstream guarantees only the newest pass per book writes
 * here, so no in-store staleness check is needed.
 */
export class SousFindingsStore {
    private state: SousResultsByBook = {};
    private readonly listeners = new Set<Listener>();

    read(): SousResultsByBook {
        return this.state;
    }

    getSnapshot = (): SousResultsByBook => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Replace one book's findings + segments. */
    commitBookResult(bookCode: string, result: SousAnalyzeResult): void {
        this.state = { ...this.state, [bookCode.toUpperCase()]: result };
        this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}
