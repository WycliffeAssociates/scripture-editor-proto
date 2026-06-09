import { shapeForSurface } from "@/app/data/editor.ts";
import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { normalizeStoragePath } from "@/core/persistence/pathUtils.ts";
import type {
    BookContents,
    BookRef,
    Project,
} from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Version snapshots store book contents keyed by relative path, not as a fully
 * loaded scripture noun. These adapters project a snapshot back into a temporary
 * `Project`/workspace shape so the normal scripture parsing pipeline can be reused.
 */
function toSnapshotKey(projectPath: string, bookPath: string): string {
    const normalizedProjectPath = normalizeStoragePath(projectPath).replace(
        /\/+$/u,
        "",
    );
    const normalizedBookPath = normalizeStoragePath(bookPath);
    const relativePath = normalizedBookPath.startsWith(
        `${normalizedProjectPath}/`,
    )
        ? normalizedBookPath.slice(normalizedProjectPath.length + 1)
        : normalizedBookPath.replace(/^\/+/u, "");

    return relativePath.replace(/^\.\/+/u, "");
}

function readSnapshotBook(args: {
    loadedProject: Project;
    snapshot: Map<string, string>;
    book: BookRef;
}): BookContents {
    const relativePath = toSnapshotKey(
        args.loadedProject.projectPath,
        args.book.path,
    );
    const contents =
        args.snapshot.get(relativePath) ??
        args.snapshot.get(args.book.fileName) ??
        "";

    return {
        ...args.book,
        contents,
    };
}

function createSnapshotProject(args: {
    loadedProject: Project;
    snapshot: Map<string, string>;
}): Project {
    return {
        ...args.loadedProject,
        getBook: async (storageKey: string) => {
            const book = args.loadedProject.books.find(
                (candidate) => candidate.storageKey === storageKey,
            );
            if (!book) {
                throw new Error(
                    `Snapshot does not contain book for storage key ${storageKey}`,
                );
            }
            return readSnapshotBook({
                loadedProject: args.loadedProject,
                snapshot: args.snapshot,
                book,
            });
        },
    };
}

export async function snapshotToScriptureBookStates(args: {
    loadedProject: Project;
    snapshot: Map<string, string>;
    usfmOnionService: IUsfmOnionService;
}): Promise<ScriptureBookState[]> {
    const virtualProject = createSnapshotProject({
        loadedProject: args.loadedProject,
        snapshot: args.snapshot,
    });
    const contentOnlyUsfmOnionService: IUsfmOnionService = {
        supportsPathIo: false,
        getMarkerCatalog: (...serviceArgs) =>
            args.usfmOnionService.getMarkerCatalog(...serviceArgs),
        parseUsfm: (...serviceArgs) =>
            args.usfmOnionService.parseUsfm(...serviceArgs),
        parseUsfmBatchFromPaths: (...serviceArgs) =>
            args.usfmOnionService.parseUsfmBatchFromPaths(...serviceArgs),
        parseUsfmBatchFromContents: (...serviceArgs) =>
            args.usfmOnionService.parseUsfmBatchFromContents(...serviceArgs),
        lintExisting: (...serviceArgs) =>
            args.usfmOnionService.lintExisting(...serviceArgs),
        lintScope: (...serviceArgs) =>
            args.usfmOnionService.lintScope(...serviceArgs),
        formatScope: (...serviceArgs) =>
            args.usfmOnionService.formatScope(...serviceArgs),
        applyTokenFixes: (...serviceArgs) =>
            args.usfmOnionService.applyTokenFixes(...serviceArgs),
        diffTokens: (...serviceArgs) =>
            args.usfmOnionService.diffTokens(...serviceArgs),
        revertDiffBlock: (...serviceArgs) =>
            args.usfmOnionService.revertDiffBlock(...serviceArgs),
        diffScope: (...serviceArgs) =>
            args.usfmOnionService.diffScope(...serviceArgs),
    };

    // Snapshot states feed token-based diffing and apply flows only — their
    // lexical state is never rendered, so they materialize as compare sources.
    const parsed = await scriptureProjectToParsedFiles({
        loadedProject: virtualProject,
        shape: shapeForSurface("compareSource"),
        usfmOnionService: contentOnlyUsfmOnionService,
    });

    return parsed.parsedFiles;
}
