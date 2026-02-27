import { strFromU8, type Unzipped, unzip } from "fflate";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import { loadProjectWithWarmCache } from "@/app/domain/cache/loadProjectWithWarmCache.ts";
import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";
import type { ProjectWarmCacheProvider } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectLoader } from "@/core/domain/project/ProjectLoader.ts";
import { FileWriter } from "@/core/io/DefaultFileWriter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type {
    IProjectRepository,
    Project,
} from "@/core/persistence/ProjectRepository.ts";
import type { CompareMetadataSummary } from "./compareService.ts";

export type CompareSourceLoadResult = {
    parsedFiles: ParsedFile[];
    metadataSummary: CompareMetadataSummary;
    cleanup: () => Promise<void>;
};

type CompareSourceLoaderArgs = {
    projectRepository: IProjectRepository;
    directoryProvider: IDirectoryProvider;
    md5Service: IMd5Service;
    editorMode: EditorModeSetting;
    projectWarmCacheProvider: ProjectWarmCacheProvider;
    projectFingerprintService: ProjectFingerprintService;
};

export class CompareSourceLoader {
    private readonly projectRepository: IProjectRepository;
    private readonly directoryProvider: IDirectoryProvider;
    private readonly md5Service: IMd5Service;
    private readonly editorMode: EditorModeSetting;
    private readonly projectWarmCacheProvider: ProjectWarmCacheProvider;
    private readonly projectFingerprintService: ProjectFingerprintService;

    constructor(args: CompareSourceLoaderArgs) {
        this.projectRepository = args.projectRepository;
        this.directoryProvider = args.directoryProvider;
        this.md5Service = args.md5Service;
        this.editorMode = args.editorMode;
        this.projectWarmCacheProvider = args.projectWarmCacheProvider;
        this.projectFingerprintService = args.projectFingerprintService;
    }

    async loadExistingProject(
        projectId: string,
    ): Promise<CompareSourceLoadResult> {
        const loaded = await this.projectRepository.loadProject(
            projectId,
            this.md5Service,
        );
        if (!loaded) {
            throw new Error("Failed to load selected source project.");
        }
        const parsed = await loadProjectWithWarmCache({
            loadedProject: loaded,
            editorMode: this.editorMode,
            projectWarmCacheProvider: this.projectWarmCacheProvider,
            projectFingerprintService: this.projectFingerprintService,
        });
        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(loaded),
            cleanup: async () => {},
        };
    }

    async loadFromZipFile(file: File): Promise<CompareSourceLoadResult> {
        const tempDirectory = await this.directoryProvider.tempDirectory;
        const tempDirName = `compare-zip-${Date.now()}`;
        const tempRoot = await tempDirectory.getDirectoryHandle(tempDirName, {
            create: true,
        });
        await extractZipToDirectory(file, tempRoot);
        const projectRoot = await resolveProjectRoot(tempRoot);
        const loaded = await this.loadProjectFromDirectory(projectRoot);
        const parsed = await loadedProjectToParsedFiles({
            loadedProject: loaded,
            editorMode: this.editorMode,
        });

        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(loaded),
            cleanup: async () => {
                await tempDirectory.removeEntry(tempDirName, {
                    recursive: true,
                });
            },
        };
    }

    async loadFromDirectoryFiles(
        files: FileList,
    ): Promise<CompareSourceLoadResult> {
        const tempDirectory = await this.directoryProvider.tempDirectory;
        const tempDirName = `compare-dir-${Date.now()}`;
        const tempRoot = await tempDirectory.getDirectoryHandle(tempDirName, {
            create: true,
        });
        await copyDirectorySelectionToTemp(files, tempRoot);
        const projectRoot = await resolveProjectRoot(tempRoot);
        const loaded = await this.loadProjectFromDirectory(projectRoot);
        const parsed = await loadedProjectToParsedFiles({
            loadedProject: loaded,
            editorMode: this.editorMode,
        });
        return {
            parsedFiles: parsed.parsedFiles,
            metadataSummary: toMetadataSummary(loaded),
            cleanup: async () => {
                await tempDirectory.removeEntry(tempDirName, {
                    recursive: true,
                });
            },
        };
    }

    private async loadProjectFromDirectory(
        dirHandle: IDirectoryHandle,
    ): Promise<Project> {
        const loader = new ProjectLoader(this.md5Service);
        const fileWriter = new FileWriter(this.directoryProvider, dirHandle);
        const loaded = await loader.loadProject(dirHandle, fileWriter);
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
        projectId: project.metadata.id,
        languageId: project.metadata.language.id,
        languageDirection: project.metadata.language.direction,
    };
}

async function copyDirectorySelectionToTemp(
    files: FileList,
    tempRoot: IDirectoryHandle,
) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath
            .split("/")
            .slice(1)
            .join("/");
        if (!relativePath) continue;
        const pathParts = relativePath.split("/");
        const fileName = pathParts.pop();
        if (!fileName) continue;
        let currentDir = tempRoot;
        for (const dirPart of pathParts) {
            currentDir = await currentDir.getDirectoryHandle(dirPart, {
                create: true,
            });
        }
        const fileHandle = await currentDir.getFileHandle(fileName, {
            create: true,
        });
        const writer = await fileHandle.createWriter();
        await writer.write(await file.arrayBuffer());
        await writer.close();
    }
}

async function extractZipToDirectory(
    file: File,
    destination: IDirectoryHandle,
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
        let dir = destination;
        for (const part of pathParts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
        }
        if (!entryName) continue;
        if (fileName.endsWith("/")) {
            await dir.getDirectoryHandle(entryName, { create: true });
            continue;
        }
        const fileHandle = await dir.getFileHandle(entryName, { create: true });
        const writer = await fileHandle.createWriter();
        await writer.write(strFromU8(zipEntry));
        await writer.close();
    }
}

async function resolveProjectRoot(
    tempRoot: IDirectoryHandle,
): Promise<IDirectoryHandle> {
    const entries: Array<{ name: string; dir: IDirectoryHandle }> = [];
    for await (const [name, handle] of tempRoot.entries()) {
        if (handle.isDir) {
            entries.push({ name, dir: handle as IDirectoryHandle });
        }
    }
    if (entries.length === 1) {
        return entries[0].dir;
    }
    return tempRoot;
}
