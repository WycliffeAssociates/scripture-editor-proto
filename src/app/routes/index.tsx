import {createFileRoute, Link, useLoaderData, useRouter,} from "@tanstack/react-router";
import {Route as projectRoute} from "./$project";
import {useEffectOnce} from "react-use";
import {TauriDirectoryProvider} from "@/tauri/persistence/TauriDirectoryProvider.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {ResourceContainerProjectLoader} from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import {FileWriter} from "@/core/io/DefaultFileWriter.ts";
// import { Route as ProjectRoute } from '@/app/routes/projects/$projectId.edit';

export const Route = createFileRoute("/")({
    component: Index,
});

// ls the app data dir and show as projects
function Index() {

    (async () => {
        const directoryProvider = await TauriDirectoryProvider.create("tauri_app_test");
        const appDataDir: IDirectoryHandle = await directoryProvider.getAppDataDirectory()
        const appDataDirAbsPath = await appDataDir.getAbsolutePath()
        const projectDir: IDirectoryHandle = await directoryProvider.getAppDataDirectory("project");
        const projectDirAbsPath = await projectDir.getAbsolutePath();
        const projectFile = await projectDir.getFileHandle("../03-LEV.usfm", {create: true});
        const writer = await projectFile.createWriter()
        await writer.write("writing some text to the file");
        await writer.write("should be overwriting text to the file");
        await writer.close()
        const file = await projectFile.getFile();
        const text = await file.text()
        const projectFileAbsPath = await projectFile.getAbsolutePath();

        console.log("App data directory path: ", appDataDir.path);
        console.log("App data directory absolute path: ", appDataDirAbsPath);
        console.log("Project directory path: ", projectDir.path);
        console.log("Project directory path: ", projectDirAbsPath);
        console.log("Project file path: ", projectFileAbsPath);
        console.log("Wrote to the file, text is: ", text);

        const enUlbDir = await projectDir.getDirectoryHandle("en_ulb")
        const loader = new ResourceContainerProjectLoader();
        const project = await loader.loadProject(enUlbDir, new FileWriter(directoryProvider, appDataDir))
        const gen = await project?.getBook("gen")
        console.log(gen);
        await project?.addBook("gen", "title", "hello world");
        const updated = await project?.getBook("gen");
        console.log("ayyy ----------");
        console.log(updated);

        debugger
        console.log("done");

    })();

    const {projects} = useLoaderData({from: "__root__"});
    const {settingsManager} = useRouter().options.context;
    return (
        <div>
            <h1>Projects</h1>
            <ul>
                {projects?.map((project) => (
                    <Link
                        key={project.path}
                        to={projectRoute.id}
                        params={{project: project.path}}
                        onClick={() => {
                            settingsManager.update({
                                lastProjectPath: project.path,
                            });
                        }}
                    >
                        {project.name}
                    </Link>
                ))}
            </ul>
        </div>
    );
}
