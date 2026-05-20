// commitFilters.test.ts
//
// Single source of truth for `CommitFilter` policy. Each of the three
// pipeline subscribers (lint, save status, structure maintenance) wires
// `Stream.filter` to one predicate in `src/app/state/commitFilters.ts`;
// the pipeline integration tests in `tests/unit/integration/` assert
// the wiring (one representative kind per pipeline) but lean on this
// file for the exhaustive per-kind matrix.
//
// Flip a polarity in `commitFilters.ts` and one row of the table below
// will fail with a readable mismatch — that's the contract.

import { describe, expect, it } from "vitest";
import {
    isLintRelevant,
    isSaveStatusRelevant,
    isStructureMaintenanceRelevant,
} from "@/app/state/commitFilters.ts";
import type { CommitEvent, CommitKind } from "@/app/state/types.ts";

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
            scope: { bookCode: "GEN", chapter: 1 },
            dirtyTextContent,
            generation: 1,
        },
        patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1 },
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
//  - lint: dirty text + not in { metadataOnly, structuralFixup, load,
//    undo, redo }.
//  - saveStatus: dirty text + not in { metadataOnly, structuralFixup,
//    load }. Undo/redo *do* drive dirty/clean transitions.
//  - structureMaintenance: userEdit + dirty text only.
const POLICY: ReadonlyArray<Row> = [
    { kind: "userEdit", dirty: true, lint: true, saveStatus: true, structure: true },
    { kind: "userEdit", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "programmaticFix", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "programmaticFix", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "import", dirty: true, lint: true, saveStatus: true, structure: false },
    { kind: "import", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "undo", dirty: true, lint: false, saveStatus: true, structure: false },
    { kind: "undo", dirty: false, lint: false, saveStatus: false, structure: false },
    { kind: "redo", dirty: true, lint: false, saveStatus: true, structure: false },
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
        "isLintRelevant($kind, dirty=$dirty) → $lint",
        ({ kind, dirty, lint }) => {
            expect(isLintRelevant(makeEvent(kind, dirty))).toBe(lint);
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
