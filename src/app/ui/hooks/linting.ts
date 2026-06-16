import type { ReadonlyScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { collectFileTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Re-run linting against a book's in-memory token view when the app already
 * holds chapter/book state and just needs fresh diagnostics without a reload —
 * e.g. the lint-autofix fallback recomputing issues after an in-place edit.
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
  file: ReadonlyScriptureBookState,
  usfmOnionService: IUsfmOnionService,
): Promise<LintIssue[]> {
  const tokens = collectFileTokens(file);
  if (!tokens.length) {
    return [];
  }

  return relintFlatTokens(tokens, usfmOnionService);
}
