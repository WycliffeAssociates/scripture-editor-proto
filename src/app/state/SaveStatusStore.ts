type Listener = () => void;

/**
 * Discriminated union describing where the workspace is in its save lifecycle.
 *
 * - `clean`  — store reflects what's on disk; nothing to save.
 * - `dirty`  — at least one chapter has been edited since the last save.
 * - `saving` — a manual save is in flight.
 * - `saved`  — last save completed successfully; transient "just saved" tag
 *              that UIs can use to flash a checkmark. Returns to `clean` on
 *              the next clean→dirty transition (or when a UI explicitly
 *              acknowledges).
 * - `failed` — last save failed; carries the error for the UI to render.
 */
export type SaveStatus =
    | { kind: "clean" }
    | { kind: "dirty" }
    | { kind: "saving" }
    | { kind: "saved"; at: number }
    | { kind: "failed"; error: unknown };

/**
 * Workspace-scoped save-lifecycle store.
 *
 * Population (per plan.md Stage 2B):
 *  - A tiny subscriber on `workingFilesStore.changes` flips `clean` → `dirty`
 *    on any text-changing commit. Pure observation; no debounce, no disk
 *    write — auto-save-to-file is explicitly out of scope.
 *  - The save command (Cmd-S / Save button) wraps `saveProjectToDisk` with
 *    `setSaving()` → result → `setSaved()` | `setFailed(error)`.
 *
 * React-facing reads use `useSyncExternalStore(subscribe, getSnapshot)`.
 */
export class SaveStatusStore {
    private state: SaveStatus;
    private readonly listeners = new Set<Listener>();

    constructor(initial: SaveStatus = { kind: "clean" }) {
        this.state = initial;
    }

    read(): SaveStatus {
        return this.state;
    }

    getSnapshot = (): SaveStatus => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * Mark dirty. No-op when already dirty / saving (saving wins until it
     * resolves; subsequent edits during a save still keep status at `saving`
     * because mid-flight typing doesn't change that *this* save is in
     * progress).
     */
    setDirty(): void {
        if (this.state.kind === "dirty" || this.state.kind === "saving") return;
        this.transition({ kind: "dirty" });
    }

    /**
     * Pipeline-driven "no dirty chapters remain" transition (revert / discard
     * all). Defers to an in-flight save: the save flow's setSaved/setFailed
     * is the authoritative post-save transition, so we don't race it.
     */
    setCleanFromCommit(): void {
        if (this.state.kind === "saving") return;
        this.transition({ kind: "clean" });
    }

    setSaving(): void {
        this.transition({ kind: "saving" });
    }

    setSaved(): void {
        this.transition({ kind: "saved", at: Date.now() });
    }

    setFailed(error: unknown): void {
        this.transition({ kind: "failed", error });
    }

    private transition(next: SaveStatus): void {
        if (statusEquals(this.state, next)) return;
        this.state = next;
        for (const listener of this.listeners) listener();
    }
}

function statusEquals(a: SaveStatus, b: SaveStatus): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "saved" && b.kind === "saved") return a.at === b.at;
    if (a.kind === "failed" && b.kind === "failed") return a.error === b.error;
    return true;
}
