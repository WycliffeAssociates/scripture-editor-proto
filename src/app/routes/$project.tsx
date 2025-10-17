import {createFileRoute, useLoaderData} from "@tanstack/react-router";
import {parse} from "yaml";
import {ParsedFile} from "@/app/data/parsedProject";
import {parsedUsfmTokensToJsonLexicalNode} from "@/app/domain/editor/serialization/serialize";
import {ProjectView} from "@/app/ui/components/views/ProjectView";
import {ProjectProvider} from "@/app/ui/contexts/WorkspaceContext";
import {
  getBookSlug,
  sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible";
import {IDirectoryProvider} from "@/core/data/persistence/DirectoryProvider";
import {parseUSFMfile} from "@/core/domain/usfm/parse";

export const Route = createFileRoute("/$project")({
  component: RouteComponent,
  pendingComponent: () => <div>Loading...</div>,
  pendingMs: 100,
  loader: async ({context, params}) => {
    console.time("total time");
    // start here would prefer to wrap into a single abstraction
    const {directoryProvider} = context;
    const {project} = params;
    const parsedFiles = await projectParamToParsedFiles(
      directoryProvider,
      project
    );
    return {projectFiles: parsedFiles};
  },
});

function RouteComponent() {
  const {projectFiles} = Route.useLoaderData();
  const {project} = Route.useParams();
  return (
    <ProjectProvider currentProjectRoute={project} projectFiles={projectFiles}>
      <ProjectView />
    </ProjectProvider>
  );
}

// todo: abstract off somewhere else and separate a littler better
export async function projectParamToParsedFiles(
  directoryProvider: IDirectoryProvider,
  project: string | undefined
) {
  console.time("getFileHandle");
  if (!project) return [];
  const thisDir = await directoryProvider.getDirectoryHandle(project);
  const manifestHandle = (await thisDir.getFileHandle(
    "manifest.yaml"
  )) as FileSystemFileHandle;
  const manifestFile = await manifestHandle.getFile();
  const manifestText = await manifestFile.text();
  const parsedManifest = parse(manifestText);
  const language = parsedManifest?.dublin_core?.language;
  const files = await directoryProvider.getDirectoryHandle(project);
  const entry: Array<{
    path: string;
    name: string;
    file: File;
    text: string;
  }> = [];
  for await (const [name, handle] of files.entries()) {
    if (name.endsWith(".usfm") && handle.kind === "file") {
      const h = handle as FileSystemFileHandle;
      const file = await h.getFile();
      const text = await file.text();
      // @ts-ignore TODO: GENERIC INTERFACE FOR WEB + TAURI
      entry.push({path: handle.path, name, file, text});
    }
  }
  console.timeEnd("getFileHandle");
  const sorted = sortUsfmFilesByCanonicalOrder(entry);
  console.time("parse");
  // end here would prefer to wrap into a single abstraction
  // Next function call as parsing and going to lexicla state is separate is fine
  const parsed: ParsedFile[] = sorted.map((file, i) => {
    const parsed = parseUSFMfile(file.text);
    const bookSlug = getBookSlug(file.name);
    return {
      title: file.name,
      localizedTitle: parsedManifest?.projects?.find(
        (p: any) => p.identifier?.toUpperCase() === bookSlug
      )?.title,
      bibleIdentifier: bookSlug,
      nextBookId:
        i === sorted.length - 1 ? null : getBookSlug(sorted[i + 1]?.name),
      prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
      path: file.path,
      chapters: Object.entries(parsed).map(([chapter, tokens]) => ({
        lexicalState: parsedUsfmTokensToJsonLexicalNode(
          tokens,
          language.direction
        ),
        chapNumber: Number(chapter),
        dirty: false,
      })),
    };
  });
  console.timeEnd("parse");
  console.timeEnd("total time");
  return parsed;
}
