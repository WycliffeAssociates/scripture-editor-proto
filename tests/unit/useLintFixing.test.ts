import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyLintFixToFile } from "@/app/ui/hooks/useLintFixing.tsx";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const rebuildParsedFileFromUsfmMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts", () => ({
    rebuildParsedFileFromUsfm: rebuildParsedFileFromUsfmMock,
}));

function makeEditorState(
    text: string,
    sid: string,
    id: string,
): SerializedEditorState<SerializedLexicalNode> {
    return {
        root: {
            type: "root",
            version: 1,
            direction: "ltr",
            format: "start",
            indent: 0,
            children: [
                {
                    type: "paragraph",
                    version: 1,
                    direction: "ltr",
                    format: "",
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                        createSerializedUSFMTextNode({
                            text,
                            sid,
                            id,
                            tokenType: UsfmTokenTypes.text,
                        }),
                    ],
                } as unknown as SerializedLexicalNode,
            ],
        },
    };
}

function makeScriptureBookState(): ScriptureBookState {
    return {
        path: "/tmp/GEN.usfm",
        title: "Genesis",
        bookCode: "GEN",
        nextBookId: null,
        prevBookId: null,
        chapters: [
            {
                chapterNumber: 1,
                dirty: false,
                eol: "\n",
                sourceTokens: [],
                currentTokens: [],
                loadedLexicalState: makeEditorState("one", "GEN 1:1", "tok-1"),
                lexicalState: makeEditorState("one", "GEN 1:1", "tok-1"),
            },
            {
                chapterNumber: 2,
                dirty: false,
                eol: "\n",
                sourceTokens: [],
                currentTokens: [],
                loadedLexicalState: makeEditorState("two", "GEN 2:1", "tok-2"),
                lexicalState: makeEditorState("two", "GEN 2:1", "tok-2"),
            },
        ],
    };
}

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
    return {
        code: "missing-space" as LintIssue["code"],
        category: "structure",
        severity: "warning",
        issueType: "usfm",
        template: "Missing space",
        message: "Missing space",
        messageParams: {},
        span: { start: 0, end: 1 },
        tokenId: "tok-2",
        sid: "GEN 2:1",
        fix: {
            type: "replaceToken",
            code: "missing-space",
            label: "Fix",
            labelParams: {},
            targetTokenId: "tok-2",
            replacements: [
                {
                    kind: "text",
                    text: "fixed",
                    sid: "GEN 2:1",
                },
            ],
        },
        ...overrides,
    };
}

function makeService(args?: {
    applyTokenFixes?: ReturnType<typeof vi.fn>;
    lintScope?: ReturnType<typeof vi.fn>;
}): IUsfmOnionService {
    return {
        supportsPathIo: false,
        getMarkerCatalog: vi.fn(async () =>
            webUsfmOnionService.getMarkerCatalog(),
        ),
        applyTokenFixes:
            args?.applyTokenFixes ??
            vi.fn(async () => ({
                tokens: [
                    {
                        id: "tok-2",
                        kind: "text",
                        source: "fixed",
                        sid: "GEN 2:1",
                        span: { start: 0, end: 5 },
                    },
                ],
                appliedChanges: [
                    {
                        kind: "replaceToken",
                        code: "missing-space",
                        label: "Fix",
                        labelParams: {},
                        targetTokenId: "tok-2",
                    },
                ],
                skippedChanges: [],
            })),
        lintScope: args?.lintScope ?? vi.fn(async () => [[makeIssue()]]),
    } as unknown as IUsfmOnionService;
}

// applyLintFixToFile is now SCRATCH-ONLY + COMPUTE per the withWorkingFilesDraft
// contract: it mutates only the file it's handed and returns data. The diff/lint
// refresh, editor sync, and success toast moved to the hook's post-commit
// `invalidate` (so a stale/gate abort can't publish "fix applied" for a write
// that didn't land). These tests pin the compute contract; the post-commit
// ordering is guaranteed by workingFileCommand.test.ts (invalidate runs only on
// a real commit).
describe("applyLintFixToFile (scratch compute)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("applies a fix to the scratch file and reports applied:true", async () => {
        const file = makeScriptureBookState();
        rebuildParsedFileFromUsfmMock.mockImplementation(
            async ({ targetFile }) => {
                targetFile.chapters = file.chapters;
            },
        );
        const service = makeService({ lintScope: vi.fn(async () => [[]]) });
        const fix = makeIssue().fix;
        if (!fix) throw new Error("Fix is required");

        const result = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            usfmOnionService: service,
            shape: "regular",
        });

        expect(result.applied).toBe(true);
        // No fallback relint needed when the fix anchors on the first try.
        expect(result.fallbackIssues).toBeUndefined();
        expect(service.applyTokenFixes).toHaveBeenCalledTimes(1);
        expect(rebuildParsedFileFromUsfmMock).toHaveBeenCalledTimes(1);
    });

    it("re-lints once and retries when the original fix no longer anchors, surfacing fallbackIssues", async () => {
        const file = makeScriptureBookState();
        rebuildParsedFileFromUsfmMock.mockImplementation(
            async ({ targetFile }) => {
                targetFile.chapters = file.chapters;
            },
        );
        const applyTokenFixes = vi
            .fn()
            .mockResolvedValueOnce({
                tokens: [],
                appliedChanges: [],
                skippedChanges: [],
            })
            .mockResolvedValueOnce({
                tokens: [
                    {
                        id: "tok-2b",
                        kind: "text",
                        source: "fixed",
                        sid: "GEN 2:1",
                        span: { start: 0, end: 5 },
                    },
                ],
                appliedChanges: [
                    {
                        kind: "replaceToken",
                        code: "missing-space",
                        label: "Fix",
                        labelParams: {},
                        targetTokenId: "tok-2b",
                    },
                ],
                skippedChanges: [],
            });
        const normalizedIssue = makeIssue({
            sid: "GEN 2:1-2",
            message: "Missing space",
            span: { start: 3, end: 4 },
            tokenId: "tok-2b",
            fix: {
                type: "replaceToken",
                code: "missing-space",
                label: "Fix",
                labelParams: {},
                targetTokenId: "tok-2b",
                replacements: [
                    {
                        kind: "text",
                        text: "fixed",
                        sid: "GEN 2:1",
                    },
                ],
            },
        });
        const lintScope = vi.fn().mockResolvedValueOnce([[normalizedIssue]]);
        const service = makeService({ applyTokenFixes, lintScope });

        const fix = makeIssue().fix;
        if (!fix) throw new Error("Fix is required");

        const result = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            usfmOnionService: service,
            shape: "regular",
        });

        expect(result.applied).toBe(true);
        expect(applyTokenFixes).toHaveBeenCalledTimes(2);
        // The fallback relint is surfaced (compute only) so the hook can refresh
        // the lint panel — it is NOT committed inside this function.
        expect(result.fallbackIssues).toEqual([normalizedIssue]);
    });

    it("reports applied:false and does not rebuild when retry still cannot apply", async () => {
        const file = makeScriptureBookState();
        const applyTokenFixes = vi.fn().mockResolvedValue({
            tokens: [],
            appliedChanges: [],
            skippedChanges: [],
        });
        const fallback = [makeIssue({ fix: undefined })];
        const service = makeService({
            applyTokenFixes,
            lintScope: vi.fn(async () => [fallback]),
        });
        const fix = makeIssue().fix;
        if (!fix) throw new Error("Fix is required");

        const result = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            usfmOnionService: service,
            shape: "regular",
        });

        expect(result.applied).toBe(false);
        // The fallback relint is still surfaced so the no-op path can refresh
        // the lint panel post-transaction.
        expect(result.fallbackIssues).toEqual(fallback);
        expect(rebuildParsedFileFromUsfmMock).not.toHaveBeenCalled();
    });
});
