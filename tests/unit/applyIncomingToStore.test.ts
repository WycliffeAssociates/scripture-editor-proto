import { describe, expect, it, vi } from "vitest";

import {
  applyIncomingToStore,
  runIncomingMutation,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import type { CompareProjectionArtifact } from "@/app/domain/project/compare/projection.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
  findChapterInDraft,
  WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

function book(bookCode: string, current: string): ScriptureBookState {
  return {
    path: `/${bookCode}.usfm`,
    title: bookCode,
    bookCode,
    nextBookId: null,
    prevBookId: null,
    chapters: [
      {
        chapterNumber: 1,
        dirty: false,
        direction: "ltr",
        eol: "\n",
        sourceTokens: [{ id: `${bookCode}-s`, kind: "text", source: current }],
        currentTokens: [{ id: `${bookCode}-c`, kind: "text", source: current }],
      },
    ],
  };
}

function artifact(
  chapters: CompareProjectionArtifact["chapters"],
): CompareProjectionArtifact {
  return { revision: 3, chapters, unresolved: [], complete: true };
}

function projected(args: {
  bookCode: string;
  source?: string;
  action?: "add" | "update" | "delete" | "unchanged";
  present?: boolean;
}) {
  return {
    address: { bookCode: args.bookCode, chapterNum: 1 },
    tokens:
      args.present === false
        ? []
        : [
            {
              id: "projected",
              kind: "text" as const,
              source: args.source ?? "incoming",
            },
          ],
    present: args.present ?? true,
    eol: args.present === false ? null : ("\n" as const),
    direction: args.present === false ? null : ("ltr" as const),
    book: {
      path: `/${args.bookCode}.usfm`,
      title: args.bookCode,
      bookCode: args.bookCode,
      nextBookId: null,
      prevBookId: null,
    },
    structuralAction: args.action ?? "update",
  };
}

function content(store: WorkingFilesStore, bookCode: string) {
  return (
    store
      .read()
      .find((book) => book.bookCode === bookCode)
      ?.chapters[0]?.currentTokens.map((token) => token.source)
      .join("") ?? ""
  );
}

function edit(store: WorkingFilesStore, bookCode: string, value: string) {
  const draft = store.draftWithChapters([{ bookCode, chapterNum: 1 }]);
  const chapter = findChapterInDraft(draft, bookCode, 1);
  if (chapter) {
    chapter.currentTokens = [{ id: "edit", kind: "text", source: value }];
  }
  store.commit({
    patch: { kind: "bulk", files: draft },
    meta: {
      kind: "userEdit",
      scope: { chapters: [{ bookCode, chapterNum: 1 }] },
      dirtyTextContent: true,
    },
  });
}

describe("projection apply boundary", () => {
  it("applies the exact artifact tokens without invoking Onion", async () => {
    const store = new WorkingFilesStore([
      book("GEN", "local"),
      book("EXO", "untouched"),
    ]);
    const projection = artifact([
      projected({ bookCode: "GEN", source: "merged" }),
      projected({
        bookCode: "EXO",
        source: "must-not-write",
        action: "unchanged",
      }),
    ]);
    const outcome = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: projection,
    });
    expect(outcome).toMatchObject({ kind: "committed", computed: projection });
    expect(content(store, "GEN")).toBe("merged");
    expect(content(store, "EXO")).toBe("untouched");
  });

  it("adds a missing book and removes the last chapter as a real book deletion", async () => {
    const store = new WorkingFilesStore([book("GEN", "local")]);
    const outcome = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: artifact([
        projected({ bookCode: "GEN", action: "delete", present: false }),
        projected({ bookCode: "MAT", action: "add", source: "new" }),
      ]),
    });
    expect(outcome.kind).toBe("committed");
    expect(store.read().map((entry) => entry.bookCode)).toEqual(["MAT"]);
    expect(content(store, "MAT")).toBe("new");
  });

  it("preserves a concurrent edit to an unaffected chapter", async () => {
    const store = new WorkingFilesStore([
      book("GEN", "local"),
      book("EXO", "other"),
    ]);
    const promise = applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: artifact([projected({ bookCode: "GEN" })]),
    });
    edit(store, "EXO", "edited");
    expect((await promise).kind).toBe("committed");
    expect(content(store, "GEN")).toBe("incoming");
    expect(content(store, "EXO")).toBe("edited");
  });

  it("aborts if an affected chapter changes before the commit tail", async () => {
    const store = new WorkingFilesStore([book("GEN", "local")]);
    const promise = applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: artifact([projected({ bookCode: "GEN" })]),
    });
    edit(store, "GEN", "user typed");
    expect((await promise).kind).toBe("aborted");
    expect(content(store, "GEN")).toBe("user typed");
  });

  it("refuses an incomplete artifact", async () => {
    const store = new WorkingFilesStore([book("GEN", "local")]);
    const outcome = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: { ...artifact([]), complete: false },
    });
    expect(outcome.kind).toBe("aborted");
  });
});

describe("runIncomingMutation", () => {
  it("aborts a stale workspace computation and never calls commit", async () => {
    const store = new WorkingFilesStore([book("GEN", "local")]);
    let release!: () => void;
    const commit = vi.fn();
    const pending = runIncomingMutation({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      scope: { kind: "workspace" },
      compute: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      commit,
    });
    edit(store, "GEN", "newer");
    release();
    expect((await pending).kind).toBe("aborted");
    expect(commit).not.toHaveBeenCalled();
  });

  it("rechecks the interaction gate at commit", async () => {
    const store = new WorkingFilesStore([book("GEN", "local")]);
    const gate = new WorkspaceGateStore({ kind: "saving" });
    const commit = vi.fn();
    const outcome = await runIncomingMutation({
      workingFilesStore: store,
      interactionGate: gate,
      scope: { kind: "workspace" },
      compute: async () => "done",
      commit,
    });
    expect(outcome.kind).toBe("aborted");
    expect(commit).not.toHaveBeenCalled();
  });
});
