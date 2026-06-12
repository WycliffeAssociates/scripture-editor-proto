// RecoveredConflictTracker.ts
//
// The fine-grained crash-recovery safety surface (the coarse one is
// WorkspaceInteractionGate). Holds the set of chapters that were restored from a
// backup whose disk baseline had moved underneath it — i.e. genuine conflicts
// the user must look at before they can be saved or clobbered.
//
// While the tracker is non-empty:
//  - the first save of those chapters is forced through the review modal (even
//    with auto-accept on), and
//  - incoming-source flows (remote-sync reconciliation, entering external
//    compare) are deferred, because they could overwrite the unreviewed work.
//
// Why this is an OBSERVABLE store and not a plain `Set`: the UI reads the
// tracker's emptiness to disable the external-compare control and to route
// saves. Entries are CLEARED asynchronously by `recoveredConflictTrackerSubscriber`
// (an Effect subscriber on `WorkingFilesStore.changes`). `WorkingFilesStore.commit`
// notifies React listeners synchronously and only THEN forks the Effect event
// the subscriber consumes — so without its own reactive channel, the last
// chapter going clean would render against a still-non-empty tracker and leave
// the disabled controls stale until some unrelated re-render. Exposing
// `subscribe`/`getSnapshot` lets UI consume it via `useSyncExternalStore`, so the
// subscriber's `clear` triggers the corrective render.

export type RecoveredChapter = { bookCode: string; chapterNum: number };

type Listener = () => void;

function keyOf(bookCode: string, chapterNum: number): string {
  return `${bookCode}:${chapterNum}`;
}

export class RecoveredConflictTracker {
  private readonly chapters = new Set<string>();
  private readonly listeners = new Set<Listener>();
  // Stable reference, replaced on every mutation so `useSyncExternalStore`
  // sees a new identity and re-renders.
  private snapshotCache: ReadonlyArray<RecoveredChapter> = [];

  add(bookCode: string, chapterNum: number): void {
    const key = keyOf(bookCode, chapterNum);
    if (this.chapters.has(key)) return;
    this.chapters.add(key);
    this.refreshSnapshot();
    this.notify();
  }

  /** Idempotent — clearing a chapter that isn't tracked is not an error. */
  clear(bookCode: string, chapterNum: number): void {
    const key = keyOf(bookCode, chapterNum);
    if (!this.chapters.delete(key)) return;
    this.refreshSnapshot();
    this.notify();
  }

  /** For the Discard banner action — empties the whole set in one notify. */
  clearAll(): void {
    if (this.chapters.size === 0) return;
    this.chapters.clear();
    this.refreshSnapshot();
    this.notify();
  }

  has(bookCode: string, chapterNum: number): boolean {
    return this.chapters.has(keyOf(bookCode, chapterNum));
  }

  isEmpty(): boolean {
    return this.chapters.size === 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ReadonlyArray<RecoveredChapter> {
    return this.snapshotCache;
  }

  private refreshSnapshot(): void {
    this.snapshotCache = Array.from(this.chapters, (key) => {
      const sep = key.lastIndexOf(":");
      return {
        bookCode: key.slice(0, sep),
        chapterNum: Number(key.slice(sep + 1)),
      };
    });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
