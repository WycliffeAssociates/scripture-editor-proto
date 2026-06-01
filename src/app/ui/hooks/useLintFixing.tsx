import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    bookLineEnding,
    lexicalToTokens,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import { chapterRefsForBook } from "@/app/domain/project/workingFileMutations.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
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

/**
 * Result of computing a lint fix on the SCRATCH. Pure compute (per the
 * withWorkingFilesDraft contract): it mutates only the scratch file and returns
 * data. All UI/lint/editor side effects run post-commit in the hook's
 * `invalidate`, so a stale/gate abort can never publish a "fix applied" effect
 * for a write that didn't land.
 *
 * `fallbackIssues` is the relint computed when the first fix didn't apply (used
 * to re-find the issue whose id/span shifted). It's surfaced so the hook can
 * still refresh the lint panel even on the no-op path — without committing
 * anything mid-mutation.
 */
type LintFixComputeResult = {
    applied: boolean;
    fallbackIssues?: LintIssue[];
};

export async function applyLintFixToFile(args: {
    err: LintIssue;
    issueFix: TokenFix;
    file: ScriptureBookState;
    targetBookCode: string;
    targetChapterNumber: number;
    usfmOnionService: IUsfmOnionService;
}): Promise<LintFixComputeResult> {
    const baselineTokens = args.file.chapters.flatMap((c) =>
        lexicalToTokens(c.lexicalState, {
            bookCode: args.file.bookCode,
        }),
    );
    let activeFix = args.issueFix;
    let result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
        activeFix,
    ]);

    // The fix targets the token the lint panel pinned earlier. If anything shifted
    // token ids/spans since then — e.g. an earlier fix in this same book
    // renumbered tokens — the click no longer anchors and this first attempt
    // changes nothing. That's the only way in here: recover ONCE by relinting to
    // re-find the same logical issue, then retry with its refreshed fix. The happy
    // path applies on the first call and never enters this block.
    let fallbackIssues: LintIssue[] | undefined;
    if (!result.appliedChanges.length) {
        // Compute-only relint — NOT committed here; publishing lint results is the
        // post-commit invalidate's job.
        fallbackIssues = await relintBookFile(args.file, args.usfmOnionService);
        const normalizedIssue = findEquivalentIssue(
            fallbackIssues,
            args.err,
            args.targetBookCode,
            args.targetChapterNumber,
        );
        if (!normalizedIssue?.fix) return { applied: false, fallbackIssues };

        activeFix = normalizedIssue.fix;
        result = await args.usfmOnionService.applyTokenFixes(baselineTokens, [
            activeFix,
        ]);
    }

    if (!result.appliedChanges.length)
        return { applied: false, fallbackIssues };

    // `baselineTokens` came through `lexicalToTokens` (LF-stamped newlines), so
    // the file's own EOL — not the token sources — is the source of truth here.
    const nextUsfm = tokensToUsfm(result.tokens, bookLineEnding(args.file));
    await rebuildParsedFileFromUsfm({
        targetFile: args.file,
        sourceUsfm: nextUsfm,
        usfmOnionService: args.usfmOnionService,
    });

    return { applied: true, fallbackIssues };
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
    interactionGate,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
    updateDiffMapForChapter,
    commitBookLintResults,
    setEditorContent,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
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

        // applyLintFixToFile mutates whatever ScriptureBookState we hand it —
        // rebuildParsedFileFromUsfm replaces `targetFile.chapters` wholesale and
        // may rebuild multiple chapters. That whole-file replacement is why this
        // is a workspace-scope (validate-then-bulk) commit through the seam, not
        // a per-chapter overlay. Per the seam contract, the mutator only mutates
        // the scratch + computes a value; the diff/lint/editor refresh + success
        // toast run POST-COMMIT in `invalidate`, so a save racing this op (which
        // aborts the commit at the gate recheck) can't leave the UI claiming the
        // fix landed.
        const originalFile = workingFilesStore
            .read()
            .find((f) => f.bookCode === sidParsed.book);
        if (!originalFile) {
            console.error(`File not found for book: ${sidParsed.book}`);
            return;
        }
        const targetChapterNumber = sidParsed.chapter;
        if (
            !originalFile.chapters.some(
                (c) => c.chapterNumber === targetChapterNumber,
            )
        ) {
            console.error(`Chapter not found: ${targetChapterNumber}`);
            return;
        }

        await history.runTransaction({
            label: t`Apply Autofix (${localizedFixLabel})`,
            candidates: [
                {
                    bookCode: originalFile.bookCode,
                    chapterNum: targetChapterNumber,
                },
            ],
            run: async () => {
                const outcome = await withWorkingFilesDraft({
                    workingFilesStore,
                    interactionGate,
                    scope: "workspace",
                    draftRefs: chapterRefsForBook(originalFile),
                    commitMeta: {
                        kind: "programmaticFix",
                        // Scope to the affected book, not the whole project: the
                        // fix only touches this book, and the lint pipeline
                        // re-lints one book per commit.
                        scope: {
                            bookCode: originalFile.bookCode,
                            chapter: targetChapterNumber,
                        },
                        dirtyTextContent: true,
                    },
                    mutate: async (scratch) => {
                        const file = scratch.find(
                            (f) => f.bookCode === sidParsed.book,
                        );
                        if (!file) {
                            const noop: LintFixComputeResult = {
                                applied: false,
                            };
                            return { affected: [], value: noop };
                        }
                        const computed = await applyLintFixToFile({
                            err,
                            issueFix,
                            file,
                            targetBookCode: file.bookCode,
                            targetChapterNumber,
                            usfmOnionService,
                        });
                        return {
                            affected: computed.applied
                                ? chapterRefsForBook(file)
                                : [],
                            value: computed,
                        };
                    },
                    // Post-commit only: refresh diff/lint against the COMMITTED
                    // file, sync the visible editor, then notify. None of this
                    // runs if the commit aborted (stale/gate).
                    invalidate: async () => {
                        const committedFile = workingFilesStore
                            .read()
                            .find((f) => f.bookCode === sidParsed.book);
                        if (!committedFile) return;
                        committedFile.chapters.forEach((chapter) => {
                            updateDiffMapForChapter(
                                committedFile.bookCode,
                                chapter.chapterNumber,
                            );
                        });
                        const relintedIssues = await relintBookFile(
                            committedFile,
                            usfmOnionService,
                        );
                        commitBookLintResults({
                            [committedFile.bookCode]: relintedIssues,
                        });
                        if (
                            currentFileBibleIdentifier === sidParsed.book &&
                            currentChapter === targetChapterNumber
                        ) {
                            const nextChapter = committedFile.chapters.find(
                                (c) => c.chapterNumber === targetChapterNumber,
                            );
                            setEditorContent(
                                sidParsed.book,
                                targetChapterNumber,
                                nextChapter,
                                editorRef.current || undefined,
                            );
                        }
                        showNotificationSuccess({
                            notification: {
                                title: t`Fix Applied`,
                                message: t`Autofix applied for ${localizedFixLabel}`,
                            },
                        });
                    },
                });

                // No-op path: the fix didn't apply, but a fallback relint may
                // have refreshed the issue set. Publish it so the lint panel
                // reflects current truth — without having committed mid-mutation.
                if (
                    outcome.kind === "unchanged" &&
                    outcome.value.fallbackIssues
                ) {
                    commitBookLintResults({
                        [sidParsed.book]: outcome.value.fallbackIssues,
                    });
                }
            },
        });
    }

    return {
        fixLintError,
    };
}
