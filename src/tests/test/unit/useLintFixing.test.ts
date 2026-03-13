import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
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

function makeParsedFile(): ParsedFile {
    return {
        path: "/tmp/GEN.usfm",
        title: "Genesis",
        bookCode: "GEN",
        nextBookId: null,
        prevBookId: null,
        chapters: [
            {
                chapNumber: 1,
                dirty: false,
                sourceTokens: [],
                currentTokens: [],
                loadedLexicalState: makeEditorState("one", "GEN 1:1", "tok-1"),
                lexicalState: makeEditorState("one", "GEN 1:1", "tok-1"),
            },
            {
                chapNumber: 2,
                dirty: false,
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
        code: "missing-space",
        severity: "warning",
        marker: null,
        message: "Missing space",
        messageParams: {},
        span: { start: 0, end: 1 },
        relatedSpan: null,
        tokenId: "tok-2",
        relatedTokenId: null,
        sid: "GEN 2:1",
        fix: {
            type: "replaceToken",
            code: "missing-space",
            label: "Fix",
            label_params: {},
            targetTokenId: "tok-2",
            replacements: [
                {
                    kind: "text",
                    text: "fixed",
                    marker: null,
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
                        text: "fixed",
                        sid: "GEN 2:1",
                        marker: null,
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

describe("applyLintFixToFile", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("applies an off-screen fix in one click without refreshing the current editor", async () => {
        const file = makeParsedFile();
        rebuildParsedFileFromUsfmMock.mockImplementation(
            async ({ targetFile }) => {
                targetFile.chapters = file.chapters;
            },
        );
        const service = makeService({
            lintScope: vi.fn(async () => [[]]),
        });
        const updateDiffMapForChapter = vi.fn();
        const replaceLintErrorsForBook = vi.fn();
        const setEditorContent = vi.fn();
        const notifySuccess = vi.fn();
        const fix = makeIssue().fix;
        if (!fix) {
            throw new Error("Fix is required");
        }

        const didApply = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            currentFileBibleIdentifier: "GEN",
            currentChapter: 1,
            usfmOnionService: service,
            updateDiffMapForChapter,
            replaceLintErrorsForBook,
            setEditorContent,
            notifySuccess,
        });

        expect(didApply).toBe(true);
        expect(service.applyTokenFixes).toHaveBeenCalledTimes(1);
        expect(updateDiffMapForChapter).toHaveBeenCalledWith("GEN", 1);
        expect(updateDiffMapForChapter).toHaveBeenCalledWith("GEN", 2);
        expect(setEditorContent).not.toHaveBeenCalled();
        expect(replaceLintErrorsForBook).toHaveBeenCalledWith("GEN", []);
        expect(notifySuccess).toHaveBeenCalledWith("missing-space");
    });

    it("re-lints once and retries when the original fix no longer anchors", async () => {
        const file = makeParsedFile();
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
                        text: "fixed",
                        sid: "GEN 2:1",
                        marker: null,
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
                label_params: {},
                targetTokenId: "tok-2b",
                replacements: [
                    {
                        kind: "text",
                        text: "fixed",
                        marker: null,
                        sid: "GEN 2:1",
                    },
                ],
            },
        });
        const lintScope = vi
            .fn()
            .mockResolvedValueOnce([[normalizedIssue]])
            .mockResolvedValueOnce([[normalizedIssue]]);
        const service = makeService({ applyTokenFixes, lintScope });
        const replaceLintErrorsForBook = vi.fn();

        const fix = makeIssue().fix;
        if (!fix) {
            throw new Error("Fix is required");
        }

        const didApply = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            currentFileBibleIdentifier: "GEN",
            currentChapter: 1,
            usfmOnionService: service,
            updateDiffMapForChapter: vi.fn(),
            replaceLintErrorsForBook,
            setEditorContent: vi.fn(),
            notifySuccess: vi.fn(),
        });

        expect(didApply).toBe(true);
        expect(applyTokenFixes).toHaveBeenCalledTimes(2);
        expect(replaceLintErrorsForBook).toHaveBeenCalledWith("GEN", [
            normalizedIssue,
        ]);
    });

    it("returns false and does not notify when retry still cannot apply", async () => {
        const file = makeParsedFile();
        const applyTokenFixes = vi.fn().mockResolvedValue({
            tokens: [],
            appliedChanges: [],
            skippedChanges: [],
        });
        const service = makeService({
            applyTokenFixes,
            lintScope: vi.fn(async () => [[makeIssue({ fix: null })]]),
        });
        const notifySuccess = vi.fn();
        const fix = makeIssue().fix;
        if (!fix) {
            throw new Error("Fix is required");
        }

        const didApply = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            currentFileBibleIdentifier: "GEN",
            currentChapter: 1,
            usfmOnionService: service,
            updateDiffMapForChapter: vi.fn(),
            replaceLintErrorsForBook: vi.fn(),
            setEditorContent: vi.fn(),
            notifySuccess,
        });

        expect(didApply).toBe(false);
        expect(notifySuccess).not.toHaveBeenCalled();
        expect(rebuildParsedFileFromUsfmMock).not.toHaveBeenCalled();
    });

    it("clears stale off-screen lint in one click by relinting the rebuilt file", async () => {
        const file = makeParsedFile();
        rebuildParsedFileFromUsfmMock.mockImplementation(
            async ({ targetFile }) => {
                targetFile.chapters = [
                    {
                        chapNumber: 1,
                        dirty: false,
                        sourceTokens: [],
                        currentTokens: [],
                        loadedLexicalState: makeEditorState(
                            "one",
                            "GEN 1:1",
                            "tok-1",
                        ),
                        lexicalState: makeEditorState(
                            "one",
                            "GEN 1:1",
                            "tok-1",
                        ),
                    },
                    {
                        chapNumber: 2,
                        dirty: true,
                        sourceTokens: [],
                        currentTokens: [],
                        loadedLexicalState: makeEditorState(
                            "two",
                            "GEN 2:1",
                            "tok-2",
                        ),
                        lexicalState: makeEditorState(
                            "rebuilt",
                            "GEN 2:1",
                            "tok-2-new",
                        ),
                    },
                ];
            },
        );

        const lintScope = vi.fn(async ([scope]) => {
            const texts = scope.tokens.map(
                (token: { text: string }) => token.text,
            );
            return [texts.includes("rebuilt") ? [] : [makeIssue()]];
        });
        const service = makeService({ lintScope });
        const replaceLintErrorsForBook = vi.fn();
        const fix = makeIssue().fix;
        if (!fix) {
            throw new Error("Fix is required");
        }

        const didApply = await applyLintFixToFile({
            err: makeIssue(),
            issueFix: fix,
            file,
            targetBookCode: "GEN",
            targetChapterNumber: 2,
            currentFileBibleIdentifier: "EXO",
            currentChapter: 1,
            usfmOnionService: service,
            updateDiffMapForChapter: vi.fn(),
            replaceLintErrorsForBook,
            setEditorContent: vi.fn(),
            notifySuccess: vi.fn(),
        });

        expect(didApply).toBe(true);
        expect(replaceLintErrorsForBook).toHaveBeenCalledWith("GEN", []);
    });
});
