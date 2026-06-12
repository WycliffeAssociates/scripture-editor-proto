import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
  collectFileTokens,
  collectWorkingFileTokens,
} from "@/app/ui/hooks/utils/editorUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  LintIssue,
  Token,
  TokenLintOptions,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Re-run linting against the token view of the current scripture workspace.
 *
 * These helpers are used after history replay and similar in-memory mutations
 * where the app already has chapter/book state and simply needs fresh diagnostics
 * without going back through a load or import step.
 */
async function relintFlatTokens(
  tokens: Token[],
  usfmOnionService: IUsfmOnionService,
): Promise<LintIssue[]> {
  if (!tokens.length) {
    return [];
  }

  const [issues] = await usfmOnionService.lintScope([{ tokens }]);
  return issues ?? [];
}

export async function relintBookFile(
  file: ScriptureBookState,
  usfmOnionService: IUsfmOnionService,
): Promise<LintIssue[]> {
  const tokens = collectFileTokens(file, {
    structuralParagraphBreaks: true,
  });
  if (!tokens.length) {
    return [];
  }

  return relintFlatTokens(tokens, usfmOnionService);
}

/**
 * Re-lint many scripture books in one batch so workspace-level refreshes can
 * update diagnostics without issuing one USFM service call (IPC round-trip on
 * Tauri) per book.
 */
export async function relintBookFiles(
  files: ScriptureBookState[],
  usfmOnionService: IUsfmOnionService,
  tokenOptions?: TokenLintOptions,
): Promise<Record<string, LintIssue[]>> {
  if (!files.length) return {};

  const lintResults = await usfmOnionService.lintScope(
    collectWorkingFileTokens({
      files,
      options: { structuralParagraphBreaks: true },
    }).map(({ tokens }) => ({ tokens })),
    tokenOptions ? { tokenOptions } : {},
  );

  const next: Record<string, LintIssue[]> = {};
  for (let i = 0; i < files.length; i++) {
    next[files[i].bookCode] = lintResults[i] ?? [];
  }
  return next;
}
