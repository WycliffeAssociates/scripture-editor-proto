/**
 * Portable project artifacts are the files we intentionally allow to leave or
 * enter managed storage through export/share/import boundaries.
 *
 * Remote session state now lives in app-local storage, not inside the project
 * tree, so the only project-local artifact we explicitly strip today is Git's
 * internal metadata directory.
 */
export function shouldStripPortableProjectPath(path: string): boolean {
  return path.split("/").filter(Boolean).includes(".git");
}
