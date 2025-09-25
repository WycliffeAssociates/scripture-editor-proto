import {QueryClient} from "@tanstack/react-query";
import {appDataDir, join, resolve, sep} from "@tauri-apps/api/path";

export async function getProjectsDir() {
  const dataDir = await appDataDir();
  const projectsDir = await resolve(await join(dataDir, "projects"));
  const pathSeparator = sep();
  return {
    dirs: {
      projects: projectsDir,
    },
    pathSeparator,
  };
}

export interface RouterContext {
  queryClient: QueryClient;
  dirs: {
    projects: string;
  };
  pathSeparator: string;
}
