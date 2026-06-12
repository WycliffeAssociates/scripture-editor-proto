export function isGitAuthLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /401|403|authentication|authorization|access denied|forbidden/i.test(
    message,
  );
}
