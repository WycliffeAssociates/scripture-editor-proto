import { describe, expect, it } from "vitest";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { shouldRunLintForEditorUpdate } from "@/app/domain/editor/hooks/useEditorLinter.ts";

describe("shouldRunLintForEditorUpdate", () => {
    const base = {
        prevEditorStateIsEmpty: false,
        dirtyElementsSize: 1,
        dirtyLeavesSize: 0,
    };

    it("returns true for normal content edits", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                tags: new Set<string>(),
            }),
        ).toBe(true);
    });

    it("returns false for selection-only updates without forced run tag", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                dirtyElementsSize: 0,
                dirtyLeavesSize: 0,
                tags: new Set<string>(),
            }),
        ).toBe(false);
    });

    it("returns false for programaticIgnore-only updates", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                tags: new Set<string>([EDITOR_TAGS_USED.programaticIgnore]),
            }),
        ).toBe(false);
    });

    it("returns true when forced run tag is present, even with programaticIgnore", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                dirtyElementsSize: 0,
                dirtyLeavesSize: 0,
                tags: new Set<string>([
                    EDITOR_TAGS_USED.programaticIgnore,
                    EDITOR_TAGS_USED.programmaticDoRunChanges,
                ]),
            }),
        ).toBe(true);
    });

    it("returns false when previous editor state is empty without forced run tag", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                prevEditorStateIsEmpty: true,
                tags: new Set<string>(),
            }),
        ).toBe(false);
    });

    it("returns true when previous editor state is empty but forced run tag is present", () => {
        expect(
            shouldRunLintForEditorUpdate({
                ...base,
                prevEditorStateIsEmpty: true,
                tags: new Set<string>([
                    EDITOR_TAGS_USED.programmaticDoRunChanges,
                ]),
            }),
        ).toBe(true);
    });
});
