import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import RepoDownload from "@/app/ui/components/import/RepoDownload.tsx";
import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { Route as projectRoute } from "./$project";

export const Route = createFileRoute("/")({
    component: Index,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider } = context;
        return { directoryProvider: directoryProvider };
    },
});

declare module "react" {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        webkitdirectory?: string;
    }
}

// ls the app data dir and show as projects
function Index() {
    const { directoryProvider } = Route.useLoaderData();
    const router = useRouter();
    const invalidateRouterAndReload = () => router.invalidate();

    async function handleDownload(url: string): Promise<void> {
        const importer = new WacsRepoImporter(directoryProvider);
        const didImport = await importer.import(url);
        if (didImport) {
            invalidateRouterAndReload();
        }
    }

    async function handleOpenDirectory(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        console.log("Opening directory...");
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log("No directory selected.");
            return;
        }

        const tempDirectory = await directoryProvider.tempDirectory;
        const tempDirName = `dir-import-${Date.now()}`;
        const tempProjectDir = await tempDirectory.getDirectoryHandle(
            tempDirName,
            { create: true },
        );

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
                    currentDirHandle =
                        await currentDirHandle.getDirectoryHandle(dirPart, {
                            create: true,
                        });
                }
            }

            if (fileName) {
                const fileHandle = await currentDirHandle.getFileHandle(
                    fileName,
                    { create: true },
                );
                const writer = await fileHandle.createWriter();
                await writer.write(await file.arrayBuffer());
                await writer.close();
            }
        }

        const importer = new ProjectDirectoryImporter(directoryProvider);
        await importer.importDirectory(tempProjectDir);
        // Clean up the temporary directory after import
        await tempDirectory.removeEntry(tempDirName, { recursive: true });
        invalidateRouterAndReload();
    }

    async function handleOpenFile(event: React.ChangeEvent<HTMLInputElement>) {
        console.log("Opening file...");
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log("No file selected.");
            return;
        }
        const file = files[0];
        console.log(
            `[handleOpenFile] Selected file name: ${file.name}, size: ${file.size} bytes`,
        );

        const tempDirectory = await directoryProvider.tempDirectory;
        const tempFileName = `${Date.now()}-${file.name}`;
        const tempFileHandle = await tempDirectory.getFileHandle(tempFileName, {
            create: true,
        });

        const content = await file.arrayBuffer();
        console.log(
            `[handleOpenFile] Read ArrayBuffer content size: ${content.byteLength} bytes`,
        );

        const writer = await tempFileHandle.createWriter();
        await writer.write(content);
        await writer.close();
        console.log(
            `[handleOpenFile] Content written to temporary file: ${tempFileHandle.name}`,
        );

        const importer = new ProjectFileImporter(directoryProvider);
        await importer.importFile(tempFileHandle);
        console.log("Selected ZIP File Handle:", tempFileHandle);

        // Clean up the temporary file after import
        await tempDirectory.removeEntry(tempFileName, { recursive: false });
        invalidateRouterAndReload();
    }

    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = useRouter().options.context;
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-3">Current Projects</h1>
            <ul className="flex flex-col gap-3">
                {projects?.map((project: Project) => (
                    <Link
                        key={project.projectDir.path}
                        to={projectRoute.id}
                        params={{ project: project.projectDir.name }}
                        onClick={() => {
                            console.log("Clicked on Project", project.id);
                            settingsManager.update({
                                lastProjectPath: project.projectDir.name,
                            });
                        }}
                    >
                        {project.name}
                    </Link>
                ))}
            </ul>

            <h1 className="text-2xl font-bold mb-3 mt-8">
                Create a new project
            </h1>
            <div className="flex">
                <div
                    className="max-w-2xl w-full
"
                >
                    <h2 className="text-xl font-bold mb-2">
                        Search for a scripture repo
                    </h2>
                    <div className="w-full">
                        <RepoDownload
                            onDownload={handleDownload}
                            isDownloadDisabled={false}
                        />
                    </div>
                </div>
                <div className="ml-44 flex flex-col gap-8">
                    <div className="flex items-center gap-2 flex-col items-start">
                        <label htmlFor="file-picker"> Upload a folder</label>
                        {/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
                        <input
                            className="p-2 border border-gray-300 rounded"
                            type="file"
                            id="file-picker"
                            name="fileList"
                            webkitdirectory="true"
                            multiple
                            onChange={handleOpenDirectory}
                        />
                    </div>
                    <div className="flex items-center gap-2 flex-col items-start">
                        <label htmlFor="file-input">
                            Or Select File (ZIP):{" "}
                        </label>
                        {/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
                        <input
                            className="p-2 border border-gray-300 rounded"
                            id="file-input"
                            type="file"
                            accept=".zip"
                            onChange={handleOpenFile}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
