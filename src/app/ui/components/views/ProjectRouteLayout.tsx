import { Outlet } from "@tanstack/react-router";

/**
 * Project route layout view — hosts the shared `/$project` dynamic segment and
 * renders whichever child view matched.
 */
export function ProjectRouteLayout() {
  return <Outlet />;
}
