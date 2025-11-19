import {
  createFileRoute,
  Link,
  useLoaderData,
  useRouter,
} from "@tanstack/react-router";
import {
  handleDownload,
  handleOpenDirectory,
  handleOpenFile,
} from "@/app/domain/api/import.tsx";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";
import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { Route as projectRoute } from "./$project.tsx";

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

  const { projects } = useLoaderData({ from: "__root__" });
  const { settingsManager } = useRouter().options.context;

  const onDownload = (url: string) => {
    handleDownload({ directoryProvider, invalidateRouterAndReload }, url);
  };
  const onOpenDirectory = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleOpenDirectory(event, {
      directoryProvider,
      invalidateRouterAndReload,
    });
  };
  const onOpenFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleOpenFile(event, { directoryProvider, invalidateRouterAndReload });
  };
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

      <div className="mt-8">
        <ProjectCreator
          onDownload={onDownload}
          onOpenDirectory={onOpenDirectory}
          onOpenFile={onOpenFile}
          isDownloadDisabled={false}
        />
      </div>
    </div>
  );
}
