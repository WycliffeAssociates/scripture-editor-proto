import { Effect } from "effect";
import { onionFindingsByChapter } from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
    type FoldedBookScope,
    makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import { lintScopeFor } from "@/app/state/commitFilters.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
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
 * round-trip on Tauri). Each book's result then supersedes that book's node
 * in the findings store's onion slice wholesale — a clean book commits `{}`.
 */
export function makeLintPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    findingsStore: FindingsStore;
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
                relintBookFiles(files, args.usfmOnionService),
            );
            for (const [bookCode, issues] of Object.entries(results)) {
                args.findingsStore.commitBookFindings(
                    "onion",
                    bookCode,
                    onionFindingsByChapter(issues),
                );
            }
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
