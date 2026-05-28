import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    lexicalToTokens,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import { relintBookFile } from "@/app/ui/hooks/linting.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { formatTokenFixLabel } from "@/app/ui/i18n/usfmOnionLocalization.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * After a fix is applied and the book is relinted, issue ids/spans can shift.
 * Match the requested issue back to the relinted result set using progressively
 * looser heuristics so the UI can keep focus on the "same" logical problem.
 */
function sameSpan(
    left?: { start: number; end: number } | null,
    right?: { start: number; end: number } | null,
) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.start === right.start && left.end === right.end;
}

function findEquivalentIssue(
    issues: LintIssue[],
    target: LintIssue,
    targetBook: string,
    targetChapter: number,
): LintIssue | null {
    const candidates = issues.filter((candidate) => {
        const candidateSid = parseSid(candidate.sid ?? "");
        return (
            candidateSid?.book === targetBook &&
            candidateSid?.chapter === targetChapter &&
            candidate.code === target.code
        );
    });

    if (!candidates.length) return null;

    const exact = candidates.find(
        (candidate) =>
            candidate.sid === target.sid &&
            candidate.message === target.message &&
            sameSpan(candidate.span, target.span) &&
            sameSpan(candidate.relatedSpan, target.relatedSpan),
    );
    if (exact) return exact;

    const sameMessageAndSid = candidates.find(
        (candidate) =>
            candidate.sid === target.sid &&
            candidate.message === target.message,
    );
    if (sameMessageAndSid) return sameMessageAndSid;

    const sameMessage = candidates.find(
        (candidate) => candidate.message === target.message,
    );
    if (sameMessage) return sameMessage;

    if (candidates.length === 1) {
        return candidates[0];
    }

    return null;
}

export async function applyLintFixToFile(args: {
    err: LintIssue;
    issueFix: TokenFix;
    file: ScriptureBookState;
    targetBookCode: string;
    targetChapterNumber: number;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editor?: LexicalEditor;
    usfmOnionService: IUsfmOnionService;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    commitBookLintResults: (resultsByBook: Record<string, LintIssue[]>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
        editor?: LexicalEditor,
    ) => void;
    notifySuccess: (code: string) => void;
}): Promise<boolean> {
    const baselineTokens = args.file.chapters.flatMap((c) =>
        lexicalToTokens(c.lexicalState, {
            bookCode: args.file.bookCode,
        }),
    );
    let activeFix = args.issueFix;
    let result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
        activeFix,
    ]);

    if (!result.appliedChanges.length) {
        const relintedIssues = await relintBookFile(
            args.file,
            args.usfmOnionService,
        );
        args.commitBookLintResults({ [args.file.bookCode]: relintedIssues });

        const normalizedIssue = findEquivalentIssue(
            relintedIssues,
            args.err,
            args.targetBookCode,
            args.targetChapterNumber,
        );
        if (!normalizedIssue?.fix) return false;

        activeFix = normalizedIssue.fix;
        result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
            activeFix,
        ]);
    }

    if (!result.appliedChanges.length) return false;

    const nextUsfm = tokensToUsfm(result.tokens);
    await rebuildParsedFileFromUsfm({
        targetFile: args.file,
        sourceUsfm: nextUsfm,
        usfmOnionService: args.usfmOnionService,
    });

    args.file.chapters.forEach((updatedChapter) => {
        args.updateDiffMapForChapter(
            args.file.bookCode,
            updatedChapter.chapterNumber,
        );
    });

    const relintedIssues = await relintBookFile(
        args.file,
        args.usfmOnionService,
    );
    args.commitBookLintResults({ [args.file.bookCode]: relintedIssues });

    if (
        args.currentFileBibleIdentifier === args.targetBookCode &&
        args.currentChapter === args.targetChapterNumber
    ) {
        const nextChapter = args.file.chapters.find(
            (candidate) => candidate.chapterNumber === args.targetChapterNumber,
        );
        args.setEditorContent(
            args.targetBookCode,
            args.targetChapterNumber,
            nextChapter,
            args.editor,
        );
    }

    args.notifySuccess(args.err.code);
    return true;
}

/**
 * UI-facing lint-fix orchestration.
 *
 * This hook bridges from a clicked lint issue to the full workspace mutation flow:
 * sync current editor state, apply the token fix, rebuild chapter state, relint the
 * affected book, and record the change as one history transaction.
 */
export function useLintFixing({
    workingFilesStore,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
    updateDiffMapForChapter,
    commitBookLintResults,
    setEditorContent,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editorRef: React.RefObject<LexicalEditor | null>;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    commitBookLintResults: (resultsByBook: Record<string, LintIssue[]>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
        editor?: LexicalEditor,
    ) => void;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    async function fixLintError(err: LintIssue) {
        const issueFix = err.fix;
        if (!issueFix) return;
        if (!err.sid) return;
        const localizedFixLabel = formatTokenFixLabel(issueFix);

        const sidParsed = parseSid(err.sid);
        if (!sidParsed) return;

        // applyLintFixToFile mutates whatever ScriptureBookState we hand
        // it — rebuildParsedFileFromUsfm replaces `targetFile.chapters`
        // wholesale and may rebuild multiple chapters of the file. Draft
        // the entire affected book (every chapter ref) so the helper
        // can reassign `book.chapters` safely on the draft's shallow-
        // copied book object without leaking into the store.
        const workingFiles = workingFilesStore.read();
        const originalFile = workingFiles.find(
            (f) => f.bookCode === sidParsed.book,
        );
        if (!originalFile) {
            console.error(`File not found for book: ${sidParsed.book}`);
            return;
        }
        const draft = workingFilesStore.draftWithChapters(
            originalFile.chapters.map((c) => ({
                bookCode: originalFile.bookCode,
                chapterNum: c.chapterNumber,
            })),
        );
        const file = draft.find((f) => f.bookCode === sidParsed.book);
        if (!file) return;

        const chapter = file.chapters.find(
            (c) => c.chapterNumber === sidParsed.chapter,
        );
        if (!chapter) {
            console.error(`Chapter not found: ${sidParsed.chapter}`);
            return;
        }

        const didApply = await history.runTransaction({
            label: t`Apply Autofix (${localizedFixLabel})`,
            candidates: [
                {
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                },
            ],
            run: async () => {
                const applied = await applyLintFixToFile({
                    err,
                    issueFix,
                    file,
                    targetBookCode: file.bookCode,
                    targetChapterNumber: chapter.chapterNumber,
                    currentFileBibleIdentifier,
                    currentChapter,
                    editor: editorRef.current || undefined,
                    usfmOnionService,
                    updateDiffMapForChapter,
                    commitBookLintResults,
                    setEditorContent,
                    notifySuccess: () => {
                        ShowNotificationSuccess({
                            notification: {
                                title: t`Fix Applied`,
                                message: t`Autofix applied for ${localizedFixLabel}`,
                            },
                        });
                    },
                });
                if (applied) {
                    workingFilesStore.commit(
                        { kind: "bulk", files: draft },
                        {
                            kind: "programmaticFix",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                    );
                }
                return applied;
            },
        });

        if (!didApply) return;
    }

    return {
        fixLintError,
    };
}
