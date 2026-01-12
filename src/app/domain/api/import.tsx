import { ProjectIndexer } from "@/app/domain/project/ProjectIndexer.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

type HandleDownloadArgs = {
    importer: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    invalidateRouterAndReload: () => void;
};
export async function handleDownload(
    {
        importer,
        projectRepository,
        md5Service,
        invalidateRouterAndReload,
    }: HandleDownloadArgs,
    url: string,
): Promise<void> {
    const importedPath = await importer.import({ type: "fromGitRepo", url });
    if (importedPath) {
        const indexer = new ProjectIndexer(projectRepository, md5Service);
        await indexer.indexProject(importedPath);
        invalidateRouterAndReload();
    } else {
        throw new Error("Failed to download project");
    }
}

type OpenDirArgs = {
    directoryProvider: IDirectoryProvider;
    projectImporter: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    invalidateRouterAndReload: () => void;
};
export async function handleOpenDirectory(
    event: React.ChangeEvent<HTMLInputElement>,
    {
        directoryProvider,
        projectImporter,
        projectRepository,
        md5Service,
        invalidateRouterAndReload,
    }: OpenDirArgs,
) {
    console.log("Opening directory...");
    const files = event.target.files;
    if (!files || files.length === 0) {
        console.log("No directory selected.");
        return;
    }
    const folderName = files[0].webkitRelativePath.split("/")[0];
    const tempDirectory = await directoryProvider.tempDirectory;
    const tempDirName = folderName;
    const tempProjectDir = await tempDirectory.getDirectoryHandle(tempDirName, {
        create: true,
    });

    // Copy selected directory contents to the temporary directory
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath
            .split("/")
            .slice(1)
            .join("/"); // Get path relative to the selected directory
        const filePathParts = relativePath.split("/");
        const fileName = filePathParts.pop();
        const dirPath = filePathParts.join("/");

        let currentDirHandle: IDirectoryHandle = tempProjectDir;
        if (dirPath) {
            const intermediateDirs = dirPath.split("/");
            for (const dirPart of intermediateDirs) {
                currentDirHandle = await currentDirHandle.getDirectoryHandle(
                    dirPart,
                    {
                        create: true,
                    },
                );
            }
        }

        if (fileName) {
            const fileHandle = await currentDirHandle.getFileHandle(fileName, {
                create: true,
            });
            const writer = await fileHandle.createWriter();
            await writer.write(await file.arrayBuffer());
            await writer.close();
        }
    }

    const importedPath = await projectImporter.import({
        type: "fromDir",
        dirHandle: tempProjectDir,
    });

    // Clean up the temporary directory after import
    try {
        await tempDirectory.removeEntry(tempDirName, { recursive: true });
    } catch (e) {
        console.warn("[handleOpenDirectory] failed to remove temp dir:", e);
    }

    if (importedPath) {
        const indexer = new ProjectIndexer(projectRepository, md5Service);
        await indexer.indexProject(importedPath);
        invalidateRouterAndReload();
    } else {
        throw new Error("Failed to import directory");
    }
}

type OpenFileArgs = {
    directoryProvider: IDirectoryProvider;
    projectImporter: ProjectImporter;
    projectRepository: IProjectRepository;
    md5Service: IMd5Service;
    invalidateRouterAndReload: () => void;
};

export async function processFile(
    file: File,
    {
        directoryProvider,
        projectImporter,
        projectRepository,
        md5Service,
        invalidateRouterAndReload,
    }: OpenFileArgs,
): Promise<void> {
    console.log(
        `[processFile] Selected file name: ${file.name}, size: ${file.size} bytes`,
    );

    const tempDirectory = await directoryProvider.tempDirectory;
    const tempFileName = `${Date.now()}-${file.name}`;
    const tempFileHandle = await tempDirectory.getFileHandle(tempFileName, {
        create: true,
    });

    const content = await file.arrayBuffer();
    console.log(
        `[processFile] Read ArrayBuffer content size: ${content.byteLength} bytes`,
    );

    const writer = await tempFileHandle.createWriter();
    await writer.write(content);
    await writer.close();
    console.log(
        `[processFile] Content written to temporary file: ${tempFileHandle.name}`,
    );

    const importedPath = await projectImporter.import({
        type: "fromZipFile",
        fileHandle: tempFileHandle,
    });
    console.log("Selected ZIP File Handle:", tempFileHandle);

    // Clean up the temporary file after import
    try {
        await tempDirectory.removeEntry(tempFileName, { recursive: false });
    } catch (e) {
        console.warn("[processFile] failed to remove temp file:", e);
    }

    if (importedPath) {
        const indexer = new ProjectIndexer(projectRepository, md5Service);
        await indexer.indexProject(importedPath);
        invalidateRouterAndReload();
    } else {
        throw new Error("Failed to import file");
    }
}
export async function handleOpenFile(
    event: React.ChangeEvent<HTMLInputElement>,
    args: OpenFileArgs,
) {
    console.log("Opening file...");
    const files = event.target.files;
    if (!files || files.length === 0) {
        console.log("No file selected.");
        return;
    }
    const file = files[0];
    await processFile(file, args);
}
