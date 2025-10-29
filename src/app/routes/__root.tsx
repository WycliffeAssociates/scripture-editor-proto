import {createRootRouteWithContext, Outlet, useRouter,} from "@tanstack/react-router";
import {useEffectOnce} from "react-use";
import type {RouterContext} from "@/app/entrypoint";
import { TanStackRouterDevtools} from "@tanstack/react-router-devtools";

const RootLayout = () => {
    const router = useRouter();
    const { settingsManager } = router.options.context;

    // useEffectOnce(() => {
    //     const { lastProjectPath, restoreToLastProjectOnLaunch } = settingsManager.getSettings();
    //     if (restoreToLastProjectOnLaunch && lastProjectPath) {
    //         const projectName = lastProjectPath.split("/")[lastProjectPath.length - 1];
    //         router.navigate({
    //             to: `/$project`,
    //             params: { project: projectName },
    //         });
    //     }
    // });

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
             <TanStackRouterDevtools />
        </>
    );
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: RootLayout,
    loader: async ({ context, route }) => {

        const { directoryProvider, projectRepository } = context;
        const projects = await projectRepository.listProjects()

        return { projects };
    },
});
export const Route = rootRoute;

