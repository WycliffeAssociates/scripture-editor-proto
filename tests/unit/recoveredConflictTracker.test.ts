import { describe, expect, it, vi } from "vitest";

import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";

describe("RecoveredConflictTracker", () => {
  it("tracks chapters by (book, chapter) and reports emptiness", () => {
    const tracker = new RecoveredConflictTracker();
    expect(tracker.isEmpty()).toBe(true);

    tracker.add("GEN", 5);
    expect(tracker.has("GEN", 5)).toBe(true);
    expect(tracker.has("GEN", 6)).toBe(false);
    expect(tracker.isEmpty()).toBe(false);
  });

  it("clear is idempotent and only empties the named chapter", () => {
    const tracker = new RecoveredConflictTracker();
    tracker.add("GEN", 5);
    tracker.add("GEN", 6);

    tracker.clear("GEN", 5);
    expect(tracker.has("GEN", 5)).toBe(false);
    expect(tracker.has("GEN", 6)).toBe(true);

    // Clearing an absent entry is a no-op, not an error.
    expect(() => tracker.clear("GEN", 99)).not.toThrow();
    expect(tracker.has("GEN", 6)).toBe(true);
  });

  it("notifies subscribers on add, clear, and clearAll — but not on no-op mutations", () => {
    const tracker = new RecoveredConflictTracker();
    const listener = vi.fn();
    const unsubscribe = tracker.subscribe(listener);

    tracker.add("GEN", 5);
    expect(listener).toHaveBeenCalledTimes(1);

    // Re-adding the same chapter is a no-op → no notification.
    tracker.add("GEN", 5);
    expect(listener).toHaveBeenCalledTimes(1);

    tracker.clear("GEN", 5);
    expect(listener).toHaveBeenCalledTimes(2);

    // Clearing an absent chapter is a no-op → no notification.
    tracker.clear("GEN", 5);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    tracker.add("EXO", 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("getSnapshot returns a stable reference between mutations and a new one after (for useSyncExternalStore)", () => {
    const tracker = new RecoveredConflictTracker();
    const empty = tracker.getSnapshot();
    expect(tracker.getSnapshot()).toBe(empty); // stable while unchanged

    tracker.add("GEN", 5);
    const afterAdd = tracker.getSnapshot();
    expect(afterAdd).not.toBe(empty);
    expect(afterAdd).toEqual([{ bookCode: "GEN", chapterNum: 5 }]);
    expect(tracker.getSnapshot()).toBe(afterAdd); // stable again until next mutation
  });

  it("clearAll empties everything and notifies once when non-empty", () => {
    const tracker = new RecoveredConflictTracker();
    tracker.add("GEN", 5);
    tracker.add("EXO", 1);
    const listener = vi.fn();
    tracker.subscribe(listener);

    tracker.clearAll();
    expect(tracker.isEmpty()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // clearAll on an already-empty tracker is a no-op.
    tracker.clearAll();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
