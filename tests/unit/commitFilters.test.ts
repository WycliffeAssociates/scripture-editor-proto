// commitFilters.test.ts
//
// Single source of truth for per-subscriber commit policy. Each pipeline
// wires its policy from `src/app/state/commitFilters.ts` — scope policies
// (`lintScopeFor` / `sousScopeFor`, returning the consumer's work-unit set
// where empty = skip) and boolean predicates (save status, structure
// maintenance, dirty buffer). The pipeline integration tests in
// `tests/unit/integration/` assert the wiring (one representative kind per
// pipeline) but lean on this file for the exhaustive per-kind matrix.
//
// Flip a polarity in `commitFilters.ts` and one row of the table below
// will fail with a readable mismatch — that's the contract.

import { describe, expect, it } from "vitest";
import {
    isDirtyBufferRelevant,
    isSaveStatusRelevant,
    isStructureMaintenanceRelevant,
    lintScopeFor,
    sousScopeFor,
} from "@/app/state/commitFilters.ts";
import type {
    CommitEvent,
    CommitKind,
    WorkingFilesPatch,
} from "@/app/state/types.ts";

const ALL_KINDS: ReadonlyArray<CommitKind> = [
    "userEdit",
    "programmaticFix",
    "import",
    "undo",
    "redo",
    "load",
    "structuralFixup",
    "metadataOnly",
];

function makeEvent(kind: CommitKind, dirtyTextContent: boolean): CommitEvent {
    return {
        meta: {
            kind,
            scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
            dirtyTextContent,
            generation: 1,
        },
        patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1, selection: null },
        snapshot: [],
    };
}

type Row = {
    kind: CommitKind;
    dirty: boolean;
    lint: boolean;
    saveStatus: boolean;
    structure: boolean;
};

// Policy matrix. Rows match the prose in `commitFilters.ts`:
//  - lint / sous (scope policies; `lint: true` = non-empty scope): dirty
//    text + not in { metadataOnly, structuralFixup, load }. Undo/redo ARE
//    relevant — replay commits carry precise chapter scope.
//  - saveStatus: dirty text + not in { metadataOnly, structuralFixup,
//    load }.
//  - structureMaintenance: userEdit + dirty text only.
const POLICY: ReadonlyArray<Row> = [
    { kind: "userEdit", dirty: true, lint: true, saveStatus: true, structure: true },
    { kind: "userEdit", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "programmaticFix", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "programmaticFix", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "import", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "import", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "undo", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "undo", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "redo", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "redo", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "load", dirty: true, lint: false, saveStatus: false, structure: false },
    { kind: "load", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "structuralFixup", dirty: true, lint: false, saveStatus: false, structure: false },
    { kind: "structuralFixup", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "metadataOnly", dirty: true, lint: false, saveStatus: false, structure: false },
    { kind: "metadataOnly", dirty: false, lint: false, saveStatus: false, structure: false },
];

describe("commitFilters policy matrix", () => {
    // Guard against the matrix silently going out of sync with the union.
    it("covers every CommitKind", () => {
        const covered = new Set(POLICY.map((r) => r.kind));
        for (const kind of ALL_KINDS) {
            expect(covered.has(kind)).toBe(true);
        }
        expect(POLICY).toHaveLength(ALL_KINDS.length * 2);
    });

    it.each(POLICY)(
        "lintScopeFor($kind, dirty=$dirty) non-empty → $lint",
        ({ kind, dirty, lint }) => {
            const scope = lintScopeFor(makeEvent(kind, dirty));
            expect(scope !== "all" && scope.size === 0).toBe(!lint);
        },
    );

    it.each(POLICY)(
        "sousScopeFor($kind, dirty=$dirty) non-empty → $lint",
        ({ kind, dirty, lint }) => {
            const scope = sousScopeFor(makeEvent(kind, dirty));
            expect(scope !== "all" && scope.size === 0).toBe(!lint);
        },
    );

    it.each(POLICY)(
        "isSaveStatusRelevant($kind, dirty=$dirty) → $saveStatus",
        ({ kind, dirty, saveStatus }) => {
            expect(isSaveStatusRelevant(makeEvent(kind, dirty))).toBe(saveStatus);
        },
    );

    it.each(POLICY)(
        "isStructureMaintenanceRelevant($kind, dirty=$dirty) → $structure",
        ({ kind, dirty, structure }) => {
            expect(isStructureMaintenanceRelevant(makeEvent(kind, dirty))).toBe(
                structure,
            );
        },
    );
});

describe("scope policies — expansion shape", () => {
    function makeScopedEvent(
        scope: CommitEvent["meta"]["scope"],
    ): CommitEvent {
        return {
            meta: {
                kind: "userEdit",
                scope,
                dirtyTextContent: true,
                generation: 1,
            },
            patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1, selection: null },
            snapshot: [],
        };
    }

    it("widens chapter refs to their books, deduped", () => {
        const scope = lintScopeFor(
            makeScopedEvent({
                chapters: [
                    { bookCode: "GEN", chapterNum: 1 },
                    { bookCode: "GEN", chapterNum: 2 },
                    { bookCode: "EXO", chapterNum: 5 },
                ],
            }),
        );
        expect(scope).toEqual(new Set(["GEN", "EXO"]));
    });

    it("maps project scope to the all sentinel", () => {
        expect(lintScopeFor(makeScopedEvent({ project: true }))).toBe("all");
        expect(sousScopeFor(makeScopedEvent({ project: true }))).toBe("all");
    });

    it("returns an empty set for an empty chapter list", () => {
        const scope = lintScopeFor(makeScopedEvent({ chapters: [] }));
        expect(scope !== "all" && scope.size === 0).toBe(true);
    });
});

// isDirtyBufferRelevant keys off BOTH meta.kind (drop `load`) and patch.kind
// (drop pure `selectionOnly`) — unlike the others it cannot use the shared
// matrix, whose events all carry a `selectionOnly` patch.
describe("isDirtyBufferRelevant", () => {
    function makeEvent(
        kind: CommitKind,
        patch: WorkingFilesPatch,
        dirtyTextContent: boolean,
    ): CommitEvent {
        return {
            meta: {
                kind,
                scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
                dirtyTextContent,
                generation: 1,
            },
            patch,
            snapshot: [],
        };
    }

    const chapterPatch: WorkingFilesPatch = {
        kind: "chapter",
        bookCode: "GEN",
        chapter: 1,
        lexicalState: { root: {} } as never,
    };
    const bulkPatch: WorkingFilesPatch = { kind: "bulk", files: [] };
    const selectionPatch: WorkingFilesPatch = {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: null,
    };

    it("reacts to a user edit (could make a book dirty)", () => {
        expect(isDirtyBufferRelevant(makeEvent("userEdit", chapterPatch, true))).toBe(true);
    });

    it("reacts to the save clean-mark (metadataOnly + bulk patch, dirtyTextContent false) so it can CLEAR a backup", () => {
        expect(isDirtyBufferRelevant(makeEvent("metadataOnly", bulkPatch, false))).toBe(true);
    });

    it("ignores pure selection-only commits (no state change)", () => {
        expect(isDirtyBufferRelevant(makeEvent("metadataOnly", selectionPatch, false))).toBe(false);
    });

    it("ignores initial load population", () => {
        expect(isDirtyBufferRelevant(makeEvent("load", bulkPatch, true))).toBe(false);
    });

    it("reacts to imports and structural fixups (content may change dirty state)", () => {
        expect(isDirtyBufferRelevant(makeEvent("import", chapterPatch, true))).toBe(true);
        expect(isDirtyBufferRelevant(makeEvent("structuralFixup", chapterPatch, true))).toBe(true);
    });
});
