// applyIncomingToStore.test.ts
//
// Concurrency contract for committing incoming-source changes. Real
// WorkingFilesStore + WorkspaceGateStore; only the USFM service's
// revertDiffBlock is stubbed (deferred, so a concurrent edit can be injected
// while a hunk is "computing").

import { describe, expect, it, vi } from "vitest";
import {
    applyIncomingToStore,
    runIncomingMutation,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    findChapterInDraft,
    WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

function chapter(
    chapterNumber: number,
    current: string,
    source = current,
): ScriptureChapterState {
    return {
        chapterNumber,
        dirty: current !== source,
        sourceTokens: [{ kind: "text", source, id: `s-${chapterNumber}` }],
        currentTokens: [{ kind: "text", source: current, id: `c-${chapterNumber}` }],
        lexicalState: { root: { children: [], direction: "ltr" } },
        loadedLexicalState: { root: { children: [], direction: "ltr" } },
    } as unknown as ScriptureChapterState;
}

function book(
    bookCode: string,
    current: string,
    source = current,
): ScriptureBookState {
    return {
        path: `/userData/projects/demo/${bookCode}.usfm`,
        title: bookCode,
        bookCode,
        nextBookId: null,
        prevBookId: null,
        chapters: [chapter(1, current, source)],
    } as ScriptureBookState;
}

const genHunk = {
    bookCode: "GEN",
    chapterNum: 1,
    uniqueKey: "diff-1",
    semanticSid: "GEN 1:1",
    status: "modified",
} as unknown as ProjectDiff;

function contentOf(store: WorkingFilesStore, bookCode: string): string {
    const chapter = store
        .read()
        .find((b) => b.bookCode === bookCode)
        ?.chapters[0];
    return chapter?.currentTokens.map((t) => t.source).join("") ?? "";
}

function editChapterConcurrently(
    store: WorkingFilesStore,
    bookCode: string,
    next: string,
) {
    const draft = store.draftWithChapters([{ bookCode, chapterNum: 1 }]);
    const target = findChapterInDraft(draft, bookCode, 1);
    if (target) {
        target.currentTokens = [
            { kind: "text", source: next, id: `edit-${bookCode}` },
        ] as never;
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

describe("applyIncomingToStore concurrency", () => {
    it("aborts a mixed full-chapter + hunk batch when the FULL-CHAPTER target is edited during the hunk await", async () => {
        // The batch awaits the GEN hunk; MAT is a full-chapter take. While the
        // GEN hunk is computing the user edits MAT. The overlay would otherwise
        // commit the pre-await MAT — discarding the edit — so the apply aborts.
        const store = new WorkingFilesStore([
            book("GEN", "gen-local"),
            book("MAT", "mat-local"),
        ]);
        const gate = new WorkspaceGateStore();
        let releaseRevert!: () => void;
        const usfmOnionService = {
            revertDiffBlock: () =>
                new Promise((resolve) => {
                    releaseRevert = () =>
                        resolve([
                            { kind: "text", source: "gen-incoming", id: "gi" },
                        ]);
                }),
        } as unknown as IUsfmOnionService;

        const promise = applyIncomingToStore({
            workingFilesStore: store,
            interactionGate: gate,
            usfmOnionService,
            fullChapterApplies: [{ bookCode: "MAT", chapterNum: 1 }],
            hunkApplies: [genHunk],
            sourceFiles: [book("GEN", "gen-incoming"), book("MAT", "mat-incoming")],
        });

        // Concurrent edit to the full-chapter target while the hunk is pending.
        editChapterConcurrently(store, "MAT", "mat-edited");
        releaseRevert();
        const committed = await promise;

        expect(committed).toMatchObject({ kind: "aborted" });
        // Neither chapter committed; the concurrent MAT edit survives.
        expect(contentOf(store, "MAT")).toBe("mat-edited");
        expect(contentOf(store, "GEN")).toBe("gen-local");
    });

    it("commits a mixed batch when nothing changes concurrently", async () => {
        const store = new WorkingFilesStore([
            book("GEN", "gen-local"),
            book("MAT", "mat-local"),
        ]);
        const usfmOnionService = {
            revertDiffBlock: async () => [
                { kind: "text", source: "gen-incoming", id: "gi" },
            ],
        } as unknown as IUsfmOnionService;

        const committed = await applyIncomingToStore({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            usfmOnionService,
            fullChapterApplies: [{ bookCode: "MAT", chapterNum: 1 }],
            hunkApplies: [genHunk],
            sourceFiles: [book("GEN", "gen-incoming"), book("MAT", "mat-incoming")],
        });

        expect(committed).toMatchObject({ kind: "committed" });
        expect(contentOf(store, "GEN")).toBe("gen-incoming");
        expect(contentOf(store, "MAT")).toBe("mat-incoming");
    });

    it("preserves a concurrent edit to an UNAFFECTED book and still applies the hunk", async () => {
        const store = new WorkingFilesStore([
            book("GEN", "gen-local"),
            book("EXO", "exo-local"),
        ]);
        let releaseRevert!: () => void;
        const usfmOnionService = {
            revertDiffBlock: () =>
                new Promise((resolve) => {
                    releaseRevert = () =>
                        resolve([
                            { kind: "text", source: "gen-incoming", id: "gi" },
                        ]);
                }),
        } as unknown as IUsfmOnionService;

        const promise = applyIncomingToStore({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            usfmOnionService,
            fullChapterApplies: [],
            hunkApplies: [genHunk],
            sourceFiles: [book("GEN", "gen-incoming")],
        });

        editChapterConcurrently(store, "EXO", "exo-edited");
        releaseRevert();
        const committed = await promise;

        expect(committed).toMatchObject({ kind: "committed" });
        expect(contentOf(store, "EXO")).toBe("exo-edited"); // preserved
        expect(contentOf(store, "GEN")).toBe("gen-incoming"); // hunk applied
    });

    it("aborts when a SAME-TEXT save-rebase replaces the hunk target during the await (doesn't revert the saved baseline)", async () => {
        // GEN 1 is dirty (current "gen-edited" vs source "gen-original"). While
        // the incoming hunk computes, a save completes: it rebases the baseline
        // to the current text and marks the chapter clean — sourceTokens/dirty
        // change but currentTokens TEXT does not. A text fingerprint would miss
        // this and overlay the pre-save (dirty) chapter, reverting the saved
        // baseline. Identity-based staleness must catch the replacement and abort.
        const store = new WorkingFilesStore([
            book("GEN", "gen-edited", "gen-original"),
        ]);
        let releaseRevert!: () => void;
        const usfmOnionService = {
            revertDiffBlock: () =>
                new Promise((resolve) => {
                    releaseRevert = () =>
                        resolve([
                            { kind: "text", source: "gen-incoming", id: "gi" },
                        ]);
                }),
        } as unknown as IUsfmOnionService;

        const promise = applyIncomingToStore({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            usfmOnionService,
            fullChapterApplies: [],
            hunkApplies: [genHunk],
            sourceFiles: [book("GEN", "gen-incoming")],
        });

        // Same-text save-rebase on GEN 1: baseline → current text, dirty → false,
        // currentTokens text UNCHANGED. Produces a NEW chapter object.
        const draft = store.draftWithChapters([
            { bookCode: "GEN", chapterNum: 1 },
        ]);
        const target = findChapterInDraft(draft, "GEN", 1);
        if (target) {
            target.sourceTokens = [
                { kind: "text", source: "gen-edited", id: "saved" },
            ] as never;
            target.dirty = false;
        }
        store.commit({
            patch: { kind: "bulk", files: draft },
            meta: {
                kind: "metadataOnly",
                scope: { project: true },
                dirtyTextContent: false,
            },
        });

        releaseRevert();
        const committed = await promise;

        expect(committed).toMatchObject({ kind: "aborted" });
        const gen = store.read()[0]?.chapters[0];
        // Saved baseline intact (clean), NOT reverted to the stale dirty scratch;
        // incoming text not applied.
        expect(gen?.dirty).toBe(false);
        expect(gen?.currentTokens[0]?.source).toBe("gen-edited");
    });

    it("does not commit while the gate is saving", async () => {
        const store = new WorkingFilesStore([book("GEN", "gen-local")]);
        const gate = new WorkspaceGateStore({ kind: "saving" });
        const usfmOnionService = {
            revertDiffBlock: async () => [
                { kind: "text", source: "gen-incoming", id: "gi" },
            ],
        } as unknown as IUsfmOnionService;

        const committed = await applyIncomingToStore({
            workingFilesStore: store,
            interactionGate: gate,
            usfmOnionService,
            fullChapterApplies: [],
            hunkApplies: [genHunk],
            sourceFiles: [book("GEN", "gen-incoming")],
        });

        expect(committed).toMatchObject({ kind: "aborted" });
        expect(contentOf(store, "GEN")).toBe("gen-local");
    });
});

// The boundary every incoming write routes through (apply, behind-only
// normalization, and the post-apply refreshed-diff normalization). These cover
// the "edit-during-refreshed-comparison" contract directly: on abort the commit
// callback never runs (no edit loss / no snapshot write) and `committed` is
// false (so the caller skips remote acceptance).
describe("runIncomingMutation", () => {
    it("aborts without calling commit when an affected chapter is replaced during compute (edit during refreshed comparison)", async () => {
        const store = new WorkingFilesStore([book("GEN", "gen-edited")]);
        let releaseCompute!: () => void;
        const compute = () =>
            new Promise<string>((resolve) => {
                releaseCompute = () => resolve("refreshed-diff");
            });
        const commit = vi.fn();

        const promise = runIncomingMutation({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            scope: { kind: "chapters", candidates: [{ bookCode: "GEN", chapterNum: 1 }] },
            compute,
            commit,
        });

        // User edits GEN 1 while the refreshed comparison is still computing.
        editChapterConcurrently(store, "GEN", "user-typed");
        releaseCompute();
        const result = await promise;

        expect(result).toMatchObject({ kind: "aborted" });
        expect(commit).not.toHaveBeenCalled(); // no snapshot write
        expect(result.computed).toBe("refreshed-diff"); // still returned for display
        expect(contentOf(store, "GEN")).toBe("user-typed"); // edit preserved
    });

    it("commits from the latest state and returns the computed value when nothing changes", async () => {
        const store = new WorkingFilesStore([book("GEN", "gen-local")]);
        const commit = vi.fn();

        const result = await runIncomingMutation({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            scope: { kind: "chapters", candidates: [{ bookCode: "GEN", chapterNum: 1 }] },
            compute: async () => "refreshed-diff",
            commit,
        });

        expect(result).toMatchObject({ kind: "committed" });
        expect(result.computed).toBe("refreshed-diff");
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("workspace scope aborts when a NEW chapter/book is committed during compute, and the new work survives", async () => {
        // The snapshot paths mutate the whole workspace, including chapters
        // created during the await. A fixed-ref check would miss a new book; the
        // workspace scope catches it via the read() array identity.
        const store = new WorkingFilesStore([book("GEN", "gen-local")]);
        let releaseCompute!: () => void;
        const compute = () =>
            new Promise<string>((resolve) => {
                releaseCompute = () => resolve("refreshed-diff");
            });
        const commit = vi.fn();

        const promise = runIncomingMutation({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            scope: { kind: "workspace" },
            compute,
            commit,
        });

        // A permitted local op adds a NEW book while the compute is pending.
        store.commit({
            patch: { kind: "bulk", files: [...store.read(), book("MAT", "new-book")] },
            meta: { kind: "import", scope: { project: true }, dirtyTextContent: true },
        });
        releaseCompute();
        const result = await promise;

        expect(result).toMatchObject({ kind: "aborted" }); // → caller skips remote acceptance
        expect(commit).not.toHaveBeenCalled(); // no snapshot write
        expect(contentOf(store, "MAT")).toBe("new-book"); // new work survives
    });

    it("workspace scope tolerates a selection-only commit during compute (cursor move is not a state change)", async () => {
        const store = new WorkingFilesStore([book("GEN", "gen-local")]);
        let releaseCompute!: () => void;
        const compute = () =>
            new Promise<string>((resolve) => {
                releaseCompute = () => resolve("refreshed-diff");
            });
        const commit = vi.fn();

        const promise = runIncomingMutation({
            workingFilesStore: store,
            interactionGate: new WorkspaceGateStore(),
            scope: { kind: "workspace" },
            compute,
            commit,
        });

        // selectionOnly preserves the state array → not a state change.
        store.commit({
            patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1, selection: null },
            meta: {
                kind: "metadataOnly",
                scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
                dirtyTextContent: false,
            },
        });
        releaseCompute();
        const result = await promise;

        expect(result).toMatchObject({ kind: "committed" });
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("aborts without committing when a save begins during compute", async () => {
        const store = new WorkingFilesStore([book("GEN", "gen-local")]);
        const gate = new WorkspaceGateStore();
        let releaseCompute!: () => void;
        const compute = () =>
            new Promise<string>((resolve) => {
                releaseCompute = () => resolve("refreshed-diff");
            });
        const commit = vi.fn();

        const promise = runIncomingMutation({
            workingFilesStore: store,
            interactionGate: gate,
            scope: { kind: "chapters", candidates: [{ bookCode: "GEN", chapterNum: 1 }] },
            compute,
            commit,
        });

        gate.set({ kind: "saving" });
        releaseCompute();
        const result = await promise;

        expect(result).toMatchObject({ kind: "aborted" });
        expect(commit).not.toHaveBeenCalled();
    });
});
