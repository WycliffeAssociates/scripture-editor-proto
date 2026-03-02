import { type Unzipped, unzip } from "fflate";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

type ExtractionResult = {
    tempDirHandle: IDirectoryHandle;
    extractedTopLevelItem: IPathHandle;
    topLevelEntryName: string;
};

export class ZipImportPipeline {
    constructor(private readonly directoryProvider: IDirectoryProvider) {}

    private isGitMetadataPath(path: string): boolean {
        return path.split("/").filter(Boolean).includes(".git");
    }

    async importFromZipData(args: {
        archiveName: string;
        data: ArrayBuffer;
        stagedZipHandle?: IFileHandle;
    }): Promise<string | null> {
        const projectsDir = await this.directoryProvider.projectsDirectory;
        const tempDirectory = await this.directoryProvider.tempDirectory;

        let tempExtractionDir: IDirectoryHandle | null = null;

        try {
            const extractionResult = await this.extractZipToTemp({
                archiveName: args.archiveName,
                data: args.data,
                tempDirectory,
            });
            tempExtractionDir = extractionResult.tempDirHandle;

            const finalProjectDir = await this.resolveProjectDirectory(
                extractionResult.topLevelEntryName,
                projectsDir,
            );

            await this.copyContentToFinalDestination(
                extractionResult.extractedTopLevelItem,
                finalProjectDir,
            );

            return finalProjectDir.path;
        } catch {
            return null;
        } finally {
            await this.cleanup(tempExtractionDir, args.stagedZipHandle ?? null);
        }
    }

    private async extractZipToTemp(args: {
        archiveName: string;
        data: ArrayBuffer;
        tempDirectory: IDirectoryHandle;
    }): Promise<ExtractionResult> {
        const tempExtractionDirName = `${args.archiveName.split(".")[0]}-extract-${Date.now()}`;
        const tempExtractionDir = await args.tempDirectory.getDirectoryHandle(
            tempExtractionDirName,
            { create: true },
        );

        const loadedZip = await new Promise<Unzipped>((resolve, reject) => {
            unzip(new Uint8Array(args.data), {}, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        for (const fileName of Object.keys(loadedZip)) {
            if (this.isGitMetadataPath(fileName)) {
                continue;
            }
            const file = loadedZip[fileName];

            if (
                fileName.endsWith("/") &&
                fileName.split("/").filter(Boolean).length === 0
            ) {
                continue;
            }

            const entryPathParts = fileName.split("/").filter(Boolean);
            const entryName = entryPathParts.pop();
            const entryDirPath = entryPathParts.join("/");

            let currentExtractionTargetDir: IDirectoryHandle =
                tempExtractionDir;

            if (entryDirPath) {
                const intermediateDirs = entryDirPath.split("/");
                let tempSubDir = tempExtractionDir;
                for (const dirPart of intermediateDirs) {
                    tempSubDir = await tempSubDir.getDirectoryHandle(dirPart, {
                        create: true,
                    });
                }
                currentExtractionTargetDir = tempSubDir;
            }

            if (fileName.endsWith("/")) {
                if (entryName) {
                    await currentExtractionTargetDir.getDirectoryHandle(
                        entryName,
                        {
                            create: true,
                        },
                    );
                }
                continue;
            }

            if (!entryName) continue;

            const fileHandle = await currentExtractionTargetDir.getFileHandle(
                entryName,
                {
                    create: true,
                },
            );
            const writer = await fileHandle.createWriter();
            await writer.write(file);
            await writer.close();
        }

        const topLevelEntries: Array<{ name: string; handle: IPathHandle }> =
            [];
        for await (const [name, handle] of tempExtractionDir.entries()) {
            topLevelEntries.push({ name, handle });
        }

        if (topLevelEntries.length === 0) {
            throw new Error("No content extracted from zip.");
        }

        const selectedTopLevel =
            await this.selectTopLevelEntry(topLevelEntries);

        return {
            tempDirHandle: tempExtractionDir,
            extractedTopLevelItem: selectedTopLevel.handle,
            topLevelEntryName: selectedTopLevel.name,
        };
    }

    private async selectTopLevelEntry(
        entries: Array<{ name: string; handle: IPathHandle }>,
    ) {
        if (entries.length === 1) {
            return entries[0];
        }

        for (const entry of entries) {
            if (!entry.handle.isDir) continue;
            const dir = entry.handle as IDirectoryHandle;
            const hasMetadata = await dir.containsFile("metadata.json");
            const hasManifest = await dir.containsFile("manifest.yaml");
            if (hasMetadata || hasManifest) {
                return entry;
            }
        }

        return entries[0];
    }

    private async resolveProjectDirectory(
        initialName: string,
        projectsDir: IDirectoryHandle,
    ): Promise<IDirectoryHandle> {
        let counter = 0;
        let uniqueProjectDirName = initialName;

        let containsDir = await projectsDir.containsDir(uniqueProjectDirName);

        while (containsDir === true) {
            counter++;
            uniqueProjectDirName = `${initialName} (${counter})`;
            containsDir = await projectsDir.containsDir(uniqueProjectDirName);
        }

        return projectsDir.getDirectoryHandle(uniqueProjectDirName, {
            create: true,
        });
    }

    private async copyContentToFinalDestination(
        sourceEntry: IPathHandle,
        destinationDir: IDirectoryHandle,
    ): Promise<void> {
        if (sourceEntry.isDir) {
            await this.copyDirectoryContents(
                sourceEntry as IDirectoryHandle,
                destinationDir,
            );
            return;
        }

        if (sourceEntry.isFile) {
            const sourceFileHandle = sourceEntry as IFileHandle;
            await this.copyFile(
                sourceFileHandle,
                destinationDir,
                sourceFileHandle.name,
            );
        }
    }

    private async copyDirectoryContents(
        sourceDir: IDirectoryHandle,
        destinationDir: IDirectoryHandle,
    ): Promise<void> {
        for await (const [name, handle] of sourceDir.entries()) {
            if (handle.isDir) {
                const newDestDir = await destinationDir.getDirectoryHandle(
                    name,
                    {
                        create: true,
                    },
                );
                await this.copyDirectoryContents(
                    handle as IDirectoryHandle,
                    newDestDir,
                );
            } else if (handle.isFile) {
                await this.copyFile(
                    handle as IFileHandle,
                    destinationDir,
                    name,
                );
            }
        }
    }

    private async copyFile(
        sourceFileHandle: IFileHandle,
        destinationDir: IDirectoryHandle,
        newFileName: string,
    ): Promise<void> {
        const destFileHandle = await destinationDir.getFileHandle(newFileName, {
            create: true,
        });

        const content = await sourceFileHandle
            .getFile()
            .then((f: File) => f.arrayBuffer());
        const writer = await destFileHandle.createWriter();
        await writer.write(content);
        await writer.close();
    }

    private async cleanup(
        tempExtractionDir: IDirectoryHandle | null,
        stagedZipHandle: IFileHandle | null,
    ): Promise<void> {
        const tempDirectory = await this.directoryProvider.tempDirectory;

        if (tempExtractionDir) {
            try {
                await tempDirectory.removeEntry(tempExtractionDir.name, {
                    recursive: true,
                });
            } catch {
                // best-effort cleanup
            }
        }

        if (stagedZipHandle) {
            try {
                await tempDirectory.removeEntry(stagedZipHandle.name, {
                    recursive: false,
                });
            } catch {
                // best-effort cleanup
            }
        }
    }
}
