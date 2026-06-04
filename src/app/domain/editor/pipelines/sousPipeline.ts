import { Effect } from "effect";
import {
    type FoldedBookScope,
    makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { sousScopeFor } from "@/app/state/commitFilters.ts";
import type { SousFindingsStore } from "@/app/state/SousFindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { collectFileTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { ISousService } from "@/core/domain/sous/ISousService.ts";

// sous work is more expensive than lint and wants its own clock — a calmer
// cadence than lint's ~100ms. A superseded pass is still cancelled, so this
// is "lint at typing cadence + sous at a calmer cadence", not 2x traffic.
const DEFAULT_SOUS_DEBOUNCE_MS = 200;

/**
 * Analyze one book against the latest store state and write the result
 * (segments + findings) into the SousFindingsStore.
 *
 * `ISousService.analyze` is single-book (Rust `sous_analyze`), so a
 * multi-book pass is a sequential loop of service calls — batching it like
 * lint's `lintScope` needs an interface + Rust command change.
 */
function analyzeOneBook(args: {
    file: ScriptureBookState;
    sousFindingsStore: SousFindingsStore;
    sousService: ISousService;
}): Effect.Effect<void> {
    return Effect.gen(function* () {
        const tokens = collectFileTokens(args.file, {
            structuralParagraphBreaks: true,
        });
        if (tokens.length === 0) {
            args.sousFindingsStore.commitBookResult(args.file.bookCode, {
                segments: {},
                findings: [],
            });
            return;
        }
        const result = yield* Effect.tryPromise(() =>
            args.sousService.analyze(tokens),
        );
        args.sousFindingsStore.commitBookResult(args.file.bookCode, result);
    }).pipe(
        Effect.catch((error: unknown) =>
            Effect.sync(() => {
                console.error("[sousPipeline] analyze failed", {
                    bookCode: args.file.bookCode,
                    error,
                });
            }),
        ),
    );
}

/**
 * Stream pipeline that runs sous content analysis in response to working-
 * files commits — a PARALLEL subscriber to the same store the lint pipeline
 * rides, NOT a tee on the lint IPC.
 *
 * Relevance + expansion live in `sousScopeFor` (book granularity); scopes
 * accumulated across the (larger) debounce window are drained as one pass.
 */
export function makeSousPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    sousFindingsStore: SousFindingsStore;
    sousService: ISousService;
    debounceMs?: number;
}): Effect.Effect<void> {
    const sousPass = (scope: FoldedBookScope): Effect.Effect<void> =>
        Effect.gen(function* () {
            const latest = args.workingFilesStore.read();
            const files = scope.all
                ? latest
                : latest.filter((file) => scope.books.has(file.bookCode));
            for (const file of files) {
                yield* analyzeOneBook({
                    file,
                    sousFindingsStore: args.sousFindingsStore,
                    sousService: args.sousService,
                });
            }
        });

    return makeFoldedScopePipeline({
        changes: args.workingFilesStore.changes,
        scopeFor: sousScopeFor,
        debounceMs: args.debounceMs ?? DEFAULT_SOUS_DEBOUNCE_MS,
        run: sousPass,
    });
}
