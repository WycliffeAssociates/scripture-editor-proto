import {
    createRootRouteWithContext,
    Outlet,
    redirect,
    useParams,
    useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useEffectOnce } from "react-use";
import type { RouterContext } from "@/app/entrypoint";
import type { IDirectoryProvider } from "@/core/data/persistence/DirectoryProvider";

const RootLayout = () => {
    const router = useRouter();
    const { settingsManager } = router.options.context;

    useEffectOnce(() => {
        const { lastProjectPath, restoreToLastProjectOnLaunch } =
            settingsManager.getSettings();
        if (restoreToLastProjectOnLaunch && lastProjectPath) {
            router.navigate({
                to: `/$project`,
                params: { project: lastProjectPath },
            });
        }
    });
    return (
        <>
            {/* <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{" "}
        <Link to="/projects/create" className="[&.active]:font-bold">
          Create
        </Link>{" "}
        {projectId && (
          <Link
            to="/projects/search/$projectId"
            className="[&.active]:font-bold"
            params={{projectId: projectId}}
          >
            Search
          </Link>
        )}
      </div>
      <hr /> */}
            <div className="">
                <Outlet />
            </div>
            {/* <TanStackRouterDevtools /> */}
        </>
    );
};
const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: RootLayout,
    loader: async ({ context, route }) => {
        const { directoryProvider } = context;
        const projects = await getProjects(directoryProvider);
        return { projects };
    },
});
export const Route = rootRoute;

async function getProjects(directoryProvider: IDirectoryProvider) {
    const appDataDir = await directoryProvider.getUserDataDirectory();
    const projects: { path: string; name: string }[] = [];
    for await (const [name, handle] of appDataDir.entries()) {
        if (handle.kind === "directory") {
            // @ts-ignore todo: fix this
            projects.push({ path: handle.path, name });
        }
    }
    return projects;
}
