import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import { lexicalEditorStateToOnionFlatTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import { relintBookFile } from "@/app/ui/hooks/linting.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { formatTokenFixLabel } from "@/app/ui/i18n/usfmOnionLocalization.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
    file: ParsedFile;
    targetBookCode: string;
    targetChapterNumber: number;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editor?: LexicalEditor;
    usfmOnionService: IUsfmOnionService;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
        editor?: LexicalEditor,
    ) => void;
    notifySuccess: (code: string) => void;
}): Promise<boolean> {
    const baselineTokens = args.file.chapters.flatMap((c) =>
        lexicalEditorStateToOnionFlatTokens(c.lexicalState),
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
        args.replaceLintErrorsForBook(args.file.bookCode, relintedIssues);

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

    const nextUsfm = result.tokens.map((token) => token.text).join("");
    await rebuildParsedFileFromUsfm({
        targetFile: args.file,
        sourceUsfm: nextUsfm,
        usfmOnionService: args.usfmOnionService,
    });

    args.file.chapters.forEach((updatedChapter) => {
        args.updateDiffMapForChapter(
            args.file.bookCode,
            updatedChapter.chapNumber,
        );
    });

    const relintedIssues = await relintBookFile(
        args.file,
        args.usfmOnionService,
    );
    args.replaceLintErrorsForBook(args.file.bookCode, relintedIssues);

    if (
        args.currentFileBibleIdentifier === args.targetBookCode &&
        args.currentChapter === args.targetChapterNumber
    ) {
        const nextChapter = args.file.chapters.find(
            (candidate) => candidate.chapNumber === args.targetChapterNumber,
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

export function useLintFixing({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
    updateDiffMapForChapter,
    replaceLintErrorsForBook,
    setEditorContent,
    saveCurrentDirtyLexical,
    history,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editorRef: React.RefObject<LexicalEditor | null>;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
        editor?: LexicalEditor,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
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

        // Sync any unsaved changes from the editor to mutWorkingFilesRef
        const syncedFiles = saveCurrentDirtyLexical() ?? mutWorkingFilesRef;

        const file = syncedFiles.find((f) => f.bookCode === sidParsed.book);
        if (!file) {
            console.error(`File not found for book: ${sidParsed.book}`);
            return;
        }

        const chapter = file.chapters.find(
            (c) => c.chapNumber === sidParsed.chapter,
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
                    chapterNum: chapter.chapNumber,
                },
            ],
            run: async () => {
                return applyLintFixToFile({
                    err,
                    issueFix,
                    file,
                    targetBookCode: file.bookCode,
                    targetChapterNumber: chapter.chapNumber,
                    currentFileBibleIdentifier,
                    currentChapter,
                    editor: editorRef.current || undefined,
                    usfmOnionService,
                    updateDiffMapForChapter,
                    replaceLintErrorsForBook,
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
            },
        });

        if (!didApply) return;
    }

    return {
        fixLintError,
    };
}
