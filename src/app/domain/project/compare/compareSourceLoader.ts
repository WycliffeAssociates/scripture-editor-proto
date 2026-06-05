import { type Unzipped, unzip } from "fflate";
import { shapeForSurface } from "@/app/data/editor.ts";
import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import { buildRemoteLatestCompareSource } from "@/app/domain/project/compare/remoteCompareSource.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteRelationshipKind } from "@/core/persistence/gitRemoteRelationship.ts";
import { readGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import { joinStoragePath } from "@/core/persistence/pathUtils.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ReadOnlyOpenProjectService } from "@/core/persistence/WorkspaceService.ts";
import type { CompareMetadataSummary } from "./compareService.ts";

export type CompareSourceLoadResult = {
    parsedFiles: ScriptureBookState[];
    metadataSummary: CompareMetadataSummary;
    cleanup?: () => Promise<void>;
    remoteSync?: {
        remoteHead: string;
        localHead: string | null;
        mergeBase: string | null;
        trackedBranch: string;
        relationship: GitRemoteRelationshipKind;
    };
};

type CompareSourceLoaderArgs = {
    projectsService: ReadOnlyOpenProjectService;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    usfmOnionService: IUsfmOnionService;
    authSessionProvider: AuthSessionProvider;
    gitProvider: GitProvider;
};

/**
 * Normalizes the different compare-source entrypoints into the same parsed
 * scripture workspace shape.
 *
 * Compare can start from an already-indexed project, a picked directory, or an
 * uploaded zip. This loader hides that branching so the compare service only sees
 * `ScriptureBookState[]` plus lightweight metadata and cleanup hooks.
 */
export class CompareSourceLoader {
    private readonly projectsService: ReadOnlyOpenProjectService;
    private readonly fileSystem: FileSystem;
    private readonly storageRoots: StorageRoots;
    private readonly usfmOnionService: IUsfmOnionService;
    private readonly authSessionProvider: AuthSessionProvider;
    private readonly gitProvider: GitProvider;

    constructor(args: CompareSourceLoaderArgs) {
        this.projectsService = args.projectsService;
        this.fileSystem = args.fileSystem;
        this.storageRoots = args.storageRoots;
        this.usfmOnionService = args.usfmOnionService;
        this.authSessionProvider = args.authSessionProvider;
        this.gitProvider = args.gitProvider;
    }

    async loadExistingProject(
        projectId: string,
    ): Promise<CompareSourceLoadResult> {
        const opened =
            await this.projectsService.openProjectReadOnly(projectId);
        if (!opened) {
            throw new Error("Failed to load selected source project.");
        }
        const parsed = await scriptureProjectToParsedFiles({
            loadedProject: opened,
            shape: shapeForSurface("compareSource"),
            usfmOnionService: this.usfmOnionService,
        });
        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(opened),
        };
    }

    async loadFromZipFile(file: File): Promise<CompareSourceLoadResult> {
        const tempRoot = joinStoragePath(
            this.storageRoots.tempRoot,
            `compare-zip-${Date.now()}`,
        );
        await this.fileSystem.mkdir(tempRoot, { recursive: true });
        await extractZipToDirectory(file, tempRoot, this.fileSystem);
        const projectRoot = await resolveProjectRoot(tempRoot, this.fileSystem);
        const loaded = await this.loadProjectFromDirectory(projectRoot);
        const parsed = await scriptureProjectToParsedFiles({
            loadedProject: loaded,
            shape: shapeForSurface("compareSource"),
            usfmOnionService: this.usfmOnionService,
        });

        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(loaded),
            cleanup: async () => {
                await this.fileSystem.remove(tempRoot, {
                    recursive: true,
                });
            },
        };
    }

    async loadFromDirectoryFiles(
        files: FileList,
    ): Promise<CompareSourceLoadResult> {
        const tempRoot = joinStoragePath(
            this.storageRoots.tempRoot,
            `compare-dir-${Date.now()}`,
        );
        await this.fileSystem.mkdir(tempRoot, { recursive: true });
        await copyDirectorySelectionToTemp(files, tempRoot, this.fileSystem);
        const projectRoot = await resolveProjectRoot(tempRoot, this.fileSystem);
        const loaded = await this.loadProjectFromDirectory(projectRoot);
        const parsed = await scriptureProjectToParsedFiles({
            loadedProject: loaded,
            shape: shapeForSurface("compareSource"),
            usfmOnionService: this.usfmOnionService,
        });
        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(loaded),
            cleanup: async () => {
                await this.fileSystem.remove(tempRoot, {
                    recursive: true,
                });
            },
        };
    }

    async loadRemoteLatest(
        loadedProject: Project,
    ): Promise<CompareSourceLoadResult> {
        const remoteInfo = await readGitRemoteProjectInfo({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
            projectPath: loadedProject.projectPath,
        });
        if (!remoteInfo) {
            throw new Error("Project is not linked to a remote source.");
        }

        const session = await this.authSessionProvider.getCurrentSession();
        if (!session || session.hostBaseUrl !== remoteInfo.hostBaseUrl) {
            throw new Error(
                "Remote compare requires an active session for the linked host.",
            );
        }

        const remoteSource = await buildRemoteLatestCompareSource({
            loadedProject,
            remoteInfo,
            auth: {
                username: session.username,
                token: session.token,
            },
            gitProvider: this.gitProvider,
            usfmOnionService: this.usfmOnionService,
        });

        return {
            parsedFiles: remoteSource.parsedFiles,
            metadataSummary: remoteSource.metadataSummary,
            remoteSync: remoteSource.remoteSync,
        };
    }

    private async loadProjectFromDirectory(
        directoryPath: string,
    ): Promise<Project> {
        const loaded =
            await this.projectsService.openProjectReadOnly(directoryPath);
        if (!loaded) {
            throw new Error(
                "Selected compare source is not a supported project.",
            );
        }
        return loaded;
    }
}

function toMetadataSummary(project: Project): CompareMetadataSummary {
    return {
        projectId: project.projectId ?? project.folderName,
        languageId: project.language.code,
        languageDirection: project.language.direction,
    };
}

async function copyDirectorySelectionToTemp(
    files: FileList,
    tempRoot: string,
    fileSystem: FileSystem,
) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath
            .split("/")
            .slice(1)
            .join("/");
        if (!relativePath) continue;
        await fileSystem.writeBytes(
            joinStoragePath(tempRoot, relativePath),
            new Uint8Array(await file.arrayBuffer()),
        );
    }
}

async function extractZipToDirectory(
    file: File,
    destination: string,
    fileSystem: FileSystem,
) {
    const data = await file.arrayBuffer();
    const loadedZip = await new Promise<Unzipped>((resolve, reject) => {
        unzip(new Uint8Array(data), {}, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    for (const fileName of Object.keys(loadedZip)) {
        const zipEntry = loadedZip[fileName];
        if (
            fileName.endsWith("/") &&
            fileName.split("/").filter(Boolean).length === 0
        ) {
            continue;
        }
        const pathParts = fileName.split("/").filter(Boolean);
        const entryName = pathParts.pop();
        if (!entryName) continue;
        const targetPath = joinStoragePath(
            destination,
            ...pathParts,
            entryName,
        );
        if (fileName.endsWith("/")) {
            await fileSystem.mkdir(targetPath, { recursive: true });
            continue;
        }
        await fileSystem.writeBytes(targetPath, zipEntry);
    }
}

async function resolveProjectRoot(
    tempRoot: string,
    fileSystem: FileSystem,
): Promise<string> {
    const entries = await fileSystem.list(tempRoot);
    const directories = entries.filter((entry) => entry.kind === "directory");
    if (directories.length === 1) {
        return directories[0].path;
    }
    return tempRoot;
}
