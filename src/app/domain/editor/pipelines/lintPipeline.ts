import { Effect } from "effect";
import {
    type FoldedBookScope,
    makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import { lintScopeFor } from "@/app/state/commitFilters.ts";
import type { LintStore } from "@/app/state/LintStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

const DEFAULT_LINT_DEBOUNCE_MS = 100;

/**
 * Stream pipeline that runs lint in response to working-files commits.
 *
 * Relevance + expansion live in `lintScopeFor` (book granularity); scopes
 * accumulated across the debounce window are drained as ONE pass — a single
 * `lintScope` service call carries every book as a token batch (one IPC
 * round-trip on Tauri), and all results land in the LintStore as a single
 * commit. The previous lint pass for each book is wiped (matches legacy
 * `commitBookLintResults` semantics).
 */
export function makeLintPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    lintStore: LintStore;
    usfmOnionService: IUsfmOnionService;
    debounceMs?: number;
}): Effect.Effect<void> {
    const lintPass = (scope: FoldedBookScope): Effect.Effect<void> =>
        Effect.gen(function* () {
            const latest = args.workingFilesStore.read();
            const files = scope.all
                ? latest
                : latest.filter((file) => scope.books.has(file.bookCode));
            if (files.length === 0) return;
            const results = yield* Effect.tryPromise(() =>
                // PoC (Phase 3): sous-chef now owns content whitespace, so
                // disable onion's structural rule to avoid double-flagging
                // the same span. TODO: removable once onion drops that rule.
                relintBookFiles(files, args.usfmOnionService, {
                    disabledRules: ["excess-whitespace-in-content"],
                }),
            );
            args.lintStore.commitBookLintResults(results);
        }).pipe(
            Effect.catch((error: unknown) =>
                Effect.sync(() => {
                    // eslint-disable-next-line no-console
                    console.error("[lintPipeline] lint failed", {
                        all: scope.all,
                        books: Array.from(scope.books),
                        error,
                    });
                }),
            ),
        );

    return makeFoldedScopePipeline({
        changes: args.workingFilesStore.changes,
        scopeFor: lintScopeFor,
        debounceMs: args.debounceMs ?? DEFAULT_LINT_DEBOUNCE_MS,
        run: lintPass,
    });
}
