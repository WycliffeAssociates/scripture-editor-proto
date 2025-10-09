import {
  createRootRouteWithContext,
  Outlet,
  useParams,
} from "@tanstack/react-router";
import {Toaster} from "sonner";
import type {RouterContext} from "@/app/entrypoint";

const RootLayout = () => {
  const params = useParams({
    strict: false,
  });
  const projectId = params.projectId ?? null;

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
      <Toaster />
      {/* <TanStackRouterDevtools /> */}
    </>
  );
};
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
export const Route = rootRoute;
