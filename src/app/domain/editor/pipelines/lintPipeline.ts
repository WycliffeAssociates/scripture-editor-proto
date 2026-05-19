import { Duration, Effect, Stream } from "effect";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { isLintRelevant } from "@/app/state/commitFilters.ts";
import type { LintStore } from "@/app/state/LintStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { collectFileTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

const DEFAULT_LINT_DEBOUNCE_MS = 100;

/**
 * Run lint for one book against a snapshot. Writes results into the LintStore
 * via `commitBookLintResults`. The previous lint pass for that book is wiped
 * (matches legacy `commitBookLintResults` semantics).
 */
function lintOneBook(args: {
    file: ScriptureBookState;
    lintStore: LintStore;
    usfmOnionService: IUsfmOnionService;
}): Effect.Effect<void> {
    return Effect.gen(function* () {
        const tokens = collectFileTokens(args.file, {
            structuralParagraphBreaks: true,
        });
        if (tokens.length === 0) {
            args.lintStore.commitBookLintResults({ [args.file.bookCode]: [] });
            return;
        }
        const issues = yield* Effect.tryPromise(() =>
            args.usfmOnionService.lintExisting(tokens),
        );
        args.lintStore.commitBookLintResults({
            [args.file.bookCode]: issues,
        });
    }).pipe(
        Effect.catch((error: unknown) =>
            Effect.sync(() => {
                // eslint-disable-next-line no-console
                console.error("[lintPipeline] lint failed", {
                    bookCode: args.file.bookCode,
                    error,
                });
            }),
        ),
    );
}

/**
 * Determine which books to re-lint for a given commit event.
 *
 * Project-scope commits (bulk import / version switch / revert all) touch
 * every book; chapter-scope commits touch one book. We always lint the whole
 * file (not just one chapter) because the USFM linter's structure checks span
 * chapters within a book.
 */
function booksToLintForEvent(event: CommitEvent): Set<string> {
    const result = new Set<string>();
    const scope = event.meta.scope;
    if ("bookCode" in scope) {
        result.add(scope.bookCode);
        return result;
    }
    for (const file of event.snapshot) {
        result.add(file.bookCode);
    }
    return result;
}

/**
 * Stream pipeline that runs lint in response to working-files commits.
 *
 * Filters text-changing commits, excluding:
 *  - `metadataOnly` — only dirty-flag flips, no token changes.
 *  - `structuralFixup` — writebacks from the structure-maintenance pipeline;
 *    they fix structure, not surface new issues.
 *  - `load` — initial project load; initial lint state is loader-seeded.
 *  - `undo` / `redo` — `WorkspaceContext`'s post-undo/redo effect re-lints
 *    just the touched books; without this exclusion the pipeline would lint
 *    the entire snapshot because undo commits use project scope.
 *
 * `debounce` coalesces rapid typing; `switchMap` interrupts in-flight lint
 * when a newer commit arrives.
 */
export function makeLintPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    lintStore: LintStore;
    usfmOnionService: IUsfmOnionService;
    debounceMs?: number;
}): Effect.Effect<void> {
    const debounceMs = args.debounceMs ?? DEFAULT_LINT_DEBOUNCE_MS;
    return args.workingFilesStore.changes.pipe(
        Stream.filter(isLintRelevant),
        Stream.debounce(Duration.millis(debounceMs)),
        Stream.switchMap((event) =>
            Stream.fromIterable(booksToLintForEvent(event)).pipe(
                Stream.mapEffect((bookCode) => {
                    const file = event.snapshot.find(
                        (f) => f.bookCode === bookCode,
                    );
                    if (!file) return Effect.void;
                    return lintOneBook({
                        file,
                        lintStore: args.lintStore,
                        usfmOnionService: args.usfmOnionService,
                    });
                }),
            ),
        ),
        Stream.runDrain,
    );
}
