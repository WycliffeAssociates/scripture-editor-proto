import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "@/app/entrypoint.tsx";

const RootLayout = () => {
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
    <div className="">
      <Outlet />
    </div>
  );
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  loader: async ({ context }) => {
    const { projectRepository } = context;
    const projects = await projectRepository.listProjects();
    // const sanityCheck = await db.select().from(dbSchema.sanity);

    // console.log("Sanity check:", sanityCheck);
    return { projects };
  },
});
export const Route = rootRoute;
