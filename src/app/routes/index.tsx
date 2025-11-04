import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import RepoDownload from "@/app/ui/components/import/RepoDownload.tsx";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import { Route as projectRoute } from "./$project";
import JSZip from "jszip";

export const Route = createFileRoute("/")({
    component: Index,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context, params }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider } = context;
        return { directoryProvider: directoryProvider };
    },
});

// ls the app data dir and show as projects
function Index() {

    const {directoryProvider } = Route.useLoaderData();

    async function handleDownload(url: string) {
        console.log("Download", url);

        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const projectsDir: IDirectoryHandle = await directoryProvider.getAppDataDirectory("projects");
        const filename = url.split("/").slice(-1)[0];
        let projectName = filename.split(".")[0];

        const projectDir: IDirectoryHandle = await projectsDir.getDirectoryHandle(projectName, {create: true});

        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(data);

        // Loop through each file in the ZIP
        for (const fileName of Object.keys(loadedZip.files)) {
            const file = loadedZip.files[fileName];

            // Check if it's a directory
            if (!file.dir) {
                try {
                    const content = await file.async('arraybuffer');
                    const handle = await projectDir.getFileHandle(filename);
                    const writer = await handle.createWriter();
                    await writer.write(content);
                    await writer.close();
                } catch (error) {
                    debugger
                    console.error(error);
                }
            } else {
                // Create directory if it's a folder
                try {
                    await projectDir.getDirectoryHandle(filename, {create: true});
                } catch (error) {
                    debugger
                    console.error(error);
                }
            }
        }
    }
    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = useRouter().options.context;
    return (
        <div>
            <h1>Projects</h1>
            <ul className="flex flex-col gap-2">
                {projects?.map((project: Project) => (
                    <Link
                        key={project.projectDir.path}
                        to={projectRoute.id}
                        params={{ project: project.projectDir.name }}
                        onClick={() => {
                            console.log("Clicked on Project", project.id);
                            settingsManager.update({
                                lastProjectPath: project.projectDir.path,
                            });
                        }}
                    >
                        {project.name}
                    </Link>
                ))}
            </ul>

            <br/>
            <h1>Find a Repo</h1>
            <RepoDownload onDownload={handleDownload} isDownloadDisabled={false}>

            </RepoDownload>
        </div>
    );
}
