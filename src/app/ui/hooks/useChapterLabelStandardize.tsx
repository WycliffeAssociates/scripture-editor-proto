import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import {
    type EditorModeSetting,
    type EditorShape,
    shapeForSurface,
} from "@/app/data/editor.ts";
import {
    applyChapterLabelRewrites,
    fabricateChapterLabelRewrites,
} from "@/app/domain/editor/annotations/chapterLabelRewrite.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    bookLineEnding,
    lexicalToTokens,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import { chapterRefsForBook } from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

/**
 * Number-stripped chapter-label stems are number-stripped per book on the
 * SCRATCH (per the `withWorkingFilesDraft` contract: mutate the scratch + return
 * data, no side effects). Rewrites the off-target `\cl` labels in place by
 * direct token mutation → `tokensToUsfm` → rebuild, exactly like
 * `applyLintFixToFile` but with an app-fabricated rewrite instead of an onion
 * `TokenFix`. Returns whether this book changed.
 */
async function applyChapterLabelToFile(args: {
    file: ScriptureBookState;
    targetStem: string;
    usfmOnionService: IUsfmOnionService;
    /** The `workingRebuild` shape (see `shapeForSurface`). */
    shape: EditorShape;
}): Promise<boolean> {
    const tokens = args.file.chapters.flatMap((chapter) =>
        lexicalToTokens(chapter.lexicalState, {
            bookCode: args.file.bookCode,
        }),
    );
    const rewrites = fabricateChapterLabelRewrites(tokens, args.targetStem);
    if (rewrites.length === 0) return false;

    const nextTokens = applyChapterLabelRewrites(tokens, rewrites);
    // `lexicalToTokens` stamps LF newlines, so the file's own EOL is the source
    // of truth here (mirrors applyLintFixToFile — keeps the CRLF/LF fix intact).
    const nextUsfm = tokensToUsfm(nextTokens, bookLineEnding(args.file));
    await rebuildParsedFileFromUsfm({
        targetFile: args.file,
        sourceUsfm: nextUsfm,
        usfmOnionService: args.usfmOnionService,
        shape: args.shape,
    });
    return true;
}

/**
 * UI-facing project-wide chapter-label standardize.
 *
 * The multi-book sibling of `useLintFixing`: it spans every book that carries an
 * off-target `\cl` label, so it commits at WORKSPACE scope (a validated bulk
 * over N books) rather than the single-book per-chapter overlay. Per the
 * `withWorkingFilesDraft` contract, the mutator only writes the scratch and
 * computes which books changed; lint/diff/editor sync are commit-stream
 * subscribers reacting to the published scope, and the success toast runs on
 * the typed result.
 */
export function useChapterLabelStandardize({
    workingFilesStore,
    interactionGate,
    editorMode,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
    editorMode: EditorModeSetting;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    function booksWithOffTargetLabels(
        files: ScriptureBookState[],
        targetStem: string,
    ): string[] {
        return files
            .filter(
                (file) =>
                    fabricateChapterLabelRewrites(
                        file.chapters.flatMap((chapter) =>
                            lexicalToTokens(chapter.lexicalState, {
                                bookCode: file.bookCode,
                            }),
                        ),
                        targetStem,
                    ).length > 0,
            )
            .map((file) => file.bookCode);
    }

    async function standardizeChapterLabels(targetStem: string) {
        // Pre-scan the committed files to scope the draft + transaction to the
        // books that actually change. Recomputed against the scratch in
        // `mutate`, so a concurrent edit can only shrink the set, never produce
        // a write the workspace-scope staleness check wouldn't catch.
        const affectedBookCodes = booksWithOffTargetLabels(
            workingFilesStore.read(),
            targetStem,
        );
        if (affectedBookCodes.length === 0) return;

        const draftRefs = workingFilesStore
            .read()
            .filter((file) => affectedBookCodes.includes(file.bookCode))
            .flatMap(chapterRefsForBook);

        await history.runTransaction({
            label: t`Standardize chapter labels to "${targetStem}"`,
            candidates: draftRefs,
            run: async () => {
                const outcome = await withWorkingFilesDraft<{
                    changedBookCodes: string[];
                }>({
                    workingFilesStore,
                    interactionGate,
                    // Whole-file replacement across N books (rebuild swaps each
                    // book's chapters wholesale) → workspace scope.
                    scope: "workspace",
                    draftRefs,
                    commitMeta: {
                        kind: "programmaticFix",
                        action: "chapterLabelStandardize",
                        dirtyTextContent: true,
                    },
                    mutate: async (scratch) => {
                        const changedBookCodes: string[] = [];
                        for (const bookCode of affectedBookCodes) {
                            const file = scratch.find(
                                (f) => f.bookCode === bookCode,
                            );
                            if (!file) continue;
                            const changed = await applyChapterLabelToFile({
                                file,
                                targetStem,
                                usfmOnionService,
                                shape: shapeForSurface(
                                    "workingRebuild",
                                    editorMode,
                                ),
                            });
                            if (changed) changedBookCodes.push(bookCode);
                        }
                        const affected = scratch
                            .filter((f) =>
                                changedBookCodes.includes(f.bookCode),
                            )
                            .flatMap(chapterRefsForBook);
                        return { affected, value: { changedBookCodes } };
                    },
                });

                if (outcome.kind !== "committed") return;
                showNotificationSuccess({
                    notification: {
                        title: t`Chapter labels standardized`,
                        message: t`Set chapter labels to "${targetStem}" across ${outcome.value.changedBookCodes.length} book(s)`,
                    },
                });
            },
        });
    }

    return { standardizeChapterLabels };
}
