import { Effect } from "effect";

import {
  type FoldedBookScope,
  makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import {
  type ConsumerBookScope,
  NO_BOOKS,
  touchedBooks,
} from "@/app/state/commitFilters.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

const DEFAULT_FIXPOINT_DEBOUNCE_MS = 250;

/**
 * The fixpoint alarm's reaction scope — its own copy of "dirty text content at
 * book scope" (identical to lint's today, but owned here so the dev-only alarm
 * can change its mind without touching lint).
 */
function tokenFixpointCommitScope(event: CommitEvent): ConsumerBookScope {
  if (!event.meta.dirtyTextContent) return NO_BOOKS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_BOOKS;
  }
  return touchedBooks(event);
}

/**
 * One token-level divergence between the editor's stream and the lexer's
 * reading of the same bytes.
 */
type FixpointDivergence = {
  index: number;
  editor: { kind: string; source: string } | null;
  lexer: { kind: string; source: string } | null;
};

/**
 * Compare the editor's token stream against a fresh lex of the same bytes —
 * the I2 re-lex fixpoint (`tokens ≡ lex(join(tokens.source))`).
 *
 * One sanctioned shape difference is tolerated: a synthetic paragraph-marker
 * token carries its `markerText` verbatim (e.g. `"\\p\n"`), which the lexer
 * yields as marker + trivia tokens. The matcher lets an editor marker token
 * consume the lexer's marker plus following whitespace/newline tokens when
 * the concatenation reproduces the editor token's source exactly. Everything
 * else must match kind-and-source pairwise.
 */
export function compareTokenFixpoint(
  editorTokens: readonly Token[],
  lexerTokens: readonly Token[],
): FixpointDivergence | null {
  let li = 0;
  for (let ei = 0; ei < editorTokens.length; ei++) {
    const editor = editorTokens[ei];
    const lexer = lexerTokens[li];
    if (!lexer) {
      return {
        index: ei,
        editor: { kind: editor.kind, source: editor.source },
        lexer: null,
      };
    }
    if (editor.kind === lexer.kind && editor.source === lexer.source) {
      li++;
      continue;
    }
    if (
      editor.kind === "marker" &&
      lexer.kind === "marker" &&
      editor.source.startsWith(lexer.source)
    ) {
      // Synthetic paragraph marker absorbing its trailing trivia.
      let absorbed = lexer.source;
      let probe = li + 1;
      while (
        absorbed.length < editor.source.length &&
        lexerTokens[probe] &&
        lexerTokens[probe].kind === "newline" &&
        editor.source.startsWith(absorbed + lexerTokens[probe].source)
      ) {
        absorbed += lexerTokens[probe].source;
        probe++;
      }
      if (absorbed === editor.source) {
        li = probe;
        continue;
      }
    }
    return {
      index: ei,
      editor: { kind: editor.kind, source: editor.source },
      lexer: { kind: lexer.kind, source: lexer.source },
    };
  }
  if (li < lexerTokens.length) {
    const lexer = lexerTokens[li];
    return {
      index: editorTokens.length,
      editor: null,
      lexer: { kind: lexer.kind, source: lexer.source },
    };
  }
  return null;
}

/**
 * Dev-only regression alarm for the I2 re-lex fixpoint (plan policy §3.3):
 * after each relevant commit, re-lex every affected book's joined bytes and
 * compare token streams. NEVER a production tokenizer — it mutates nothing,
 * moves no caret, and only `console.error`s the first divergence per book.
 * Wired behind `import.meta.env.DEV` in WorkspaceContext.
 */
export function makeTokenFixpointPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  usfmOnionService: IUsfmOnionService;
  debounceMs?: number;
}): Effect.Effect<void> {
  const assertPass = (scope: FoldedBookScope): Effect.Effect<void> =>
    Effect.gen(function* () {
      const latest = args.workingFilesStore.read();
      const files = scope.all
        ? latest
        : latest.filter((file) => scope.books.has(file.bookCode));
      for (const file of files) {
        const editorTokens = file.chapters.flatMap(
          (chapter) => chapter.currentTokens,
        );
        const source = editorTokens.map((token) => token.source).join("");
        const projected = yield* Effect.tryPromise(() =>
          args.usfmOnionService.parseUsfm(source),
        );
        const divergence = compareTokenFixpoint(editorTokens, projected.tokens);
        if (divergence) {
          // eslint-disable-next-line no-console
          console.error(
            "[tokenFixpoint] I2 violation — editor stream diverges from re-lex",
            { bookCode: file.bookCode, ...divergence },
          );
        }
      }
    }).pipe(
      Effect.catch((error: unknown) =>
        Effect.sync(() => {
          // eslint-disable-next-line no-console
          console.error("[tokenFixpoint] assert pass failed", {
            error,
          });
        }),
      ),
    );

  return makeFoldedScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: tokenFixpointCommitScope,
    debounceMs: args.debounceMs ?? DEFAULT_FIXPOINT_DEBOUNCE_MS,
    run: assertPass,
  });
}
