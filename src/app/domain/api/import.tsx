import { ensureProjectGitReady } from "@/app/domain/git/ensureProjectGitReady.ts";
import { ProjectIndexer } from "@/app/domain/project/ProjectIndexer.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

type HandleDownloadArgs = {
    importer: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    gitProvider: GitProvider;
    invalidateRouterAndReload: () => void;
};

function isSuppressedDisposalError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return message.includes("suppressed during disposal");
}

async function shouldSuppressFinalizeImportError(args: {
    error: unknown;
    md5Service: IMd5Service;
    projectId: string;
    projectRepository: IProjectRepository;
    gitProvider: GitProvider;
}): Promise<boolean> {
    if (!isSuppressedDisposalError(args.error)) {
        return false;
    }

    const loadedProject = await args.projectRepository
        .loadProject(args.projectId, args.md5Service)
        .catch(() => null);
    if (!loadedProject) {
        return false;
    }

    try {
        return await args.gitProvider.isRepoHealthy(
            loadedProject.projectDir.path,
        );
    } catch (error) {
        console.error("Error checking repo health:", error);
        return false;
    }
}

async function finalizeImportedProject(args: {
    importedPath: string;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    gitProvider: GitProvider;
    invalidateRouterAndReload: () => void;
}) {
    const indexer = new ProjectIndexer(args.projectRepository, args.md5Service);
    await indexer.indexProject(args.importedPath);

    const projectId = args.importedPath.split("/").filter(Boolean).at(-1);
    if (!projectId) {
        throw new Error("Imported project path could not be resolved");
    }

    try {
        const loadedProject = await args.projectRepository.loadProject(
            projectId,
            args.md5Service,
        );
        if (!loadedProject) {
            throw new Error(
                `Imported project could not be loaded: ${projectId}`,
            );
        }

        await ensureProjectGitReady({
            gitProvider: args.gitProvider,
            loadedProject,
        });

        await Promise.resolve(args.invalidateRouterAndReload());
    } catch (error) {
        if (
            !(await shouldSuppressFinalizeImportError({
                error,
                md5Service: args.md5Service,
                projectId,
                projectRepository: args.projectRepository,
                gitProvider: args.gitProvider,
            }))
        ) {
            throw error;
        }
    }
}

export async function handleDownload(
    {
        importer,
        projectRepository,
        md5Service,
        gitProvider,
        invalidateRouterAndReload,
    }: HandleDownloadArgs,
    url: string,
): Promise<string> {
    const importedPath = await importer.import({ type: "fromGitRepo", url });
    await finalizeImportedProject({
        importedPath,
        projectRepository,
        md5Service,
        gitProvider,
        invalidateRouterAndReload,
    });
    return importedPath;
}

type OpenDirArgs = {
    directoryProvider: IDirectoryProvider;
    projectImporter: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    gitProvider: GitProvider;
    invalidateRouterAndReload: () => void;
};
export async function handleOpenDirectory(
    event: React.ChangeEvent<HTMLInputElement>,
    {
        directoryProvider,
        projectImporter,
        projectRepository,
        md5Service,
        gitProvider,
        invalidateRouterAndReload,
    }: OpenDirArgs,
): Promise<string | null> {
    const files = event.target.files;
    if (!files || files.length === 0) {
        return null;
    }
    const folderName = files[0].webkitRelativePath.split("/")[0];
    const tempDirectory = await directoryProvider.tempDirectory;
    const tempDirName = folderName;
    const tempProjectDir = await tempDirectory.getDirectoryHandle(tempDirName, {
        create: true,
    });

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = file.webkitRelativePath
                .split("/")
                .slice(1)
                .join("/"); // Get path relative to the selected directory
            if (
                relativePath === ".git" ||
                relativePath.startsWith(".git/") ||
                relativePath.includes("/.git/")
            ) {
                continue;
            }
            const filePathParts = relativePath.split("/");
            const fileName = filePathParts.pop();
            const dirPath = filePathParts.join("/");

            let currentDirHandle: IDirectoryHandle = tempProjectDir;
            if (dirPath) {
                const intermediateDirs = dirPath.split("/");
                for (const dirPart of intermediateDirs) {
                    currentDirHandle =
                        await currentDirHandle.getDirectoryHandle(dirPart, {
                            create: true,
                        });
                }
            }

            if (fileName) {
                const fileHandle = await currentDirHandle.getFileHandle(
                    fileName,
                    {
                        create: true,
                    },
                );
                const writer = await fileHandle.createWriter();
                await writer.write(await file.arrayBuffer());
                await writer.close();
            }
        }

        const importedPath = await projectImporter.import({
            type: "fromDir",
            dirHandle: tempProjectDir,
        });

        await finalizeImportedProject({
            importedPath,
            projectRepository,
            md5Service,
            gitProvider,
            invalidateRouterAndReload,
        });
        return importedPath;
    } finally {
        try {
            await tempDirectory.removeEntry(tempDirName, { recursive: true });
        } catch (error) {
            console.error("Failed to clean up temporary directory", error);
        }
    }
}

type OpenFileArgs = {
    directoryProvider: IDirectoryProvider;
    projectImporter: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    gitProvider: GitProvider;
    invalidateRouterAndReload: () => void;
};

export async function processFile(
    file: File,
    {
        directoryProvider,
        projectImporter,
        projectRepository,
        md5Service,
        gitProvider,
        invalidateRouterAndReload,
    }: OpenFileArgs,
): Promise<string> {
    const tempDirectory = await directoryProvider.tempDirectory;
    const tempFileName = `${Date.now()}-${file.name}`;
    const tempFileHandle = await tempDirectory.getFileHandle(tempFileName, {
        create: true,
    });

    try {
        const content = await file.arrayBuffer();

        const writer = await tempFileHandle.createWriter();
        await writer.write(content);
        await writer.close();

        const importedPath = await projectImporter.import({
            type: "fromZipFile",
            fileHandle: tempFileHandle,
        });

        await finalizeImportedProject({
            importedPath,
            projectRepository,
            md5Service,
            gitProvider,
            invalidateRouterAndReload,
        });
        return importedPath;
    } finally {
        try {
            await tempDirectory.removeEntry(tempFileName, { recursive: false });
        } catch (error) {
            console.error("Failed to clean up temporary file", error);
        }
    }
}
export async function handleOpenFile(
    event: React.ChangeEvent<HTMLInputElement>,
    args: OpenFileArgs,
): Promise<string | null> {
    const files = event.target.files;
    if (!files || files.length === 0) {
        return null;
    }
    const file = files[0];
    return await processFile(file, args);
}
