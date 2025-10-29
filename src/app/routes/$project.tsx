import { createFileRoute } from "@tanstack/react-router";
import { parse } from "yaml";
import type { ParsedFile } from "@/app/data/parsedProject";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical";
import { ProjectView } from "@/app/ui/components/views/ProjectView";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible";
import type { IDirectoryProvider } from "@/core/data/persistence/DirectoryProvider";
import type { LintError } from "@/core/data/usfm/lint";
import { parseUSFMfile } from "@/core/domain/usfm/parse";

export const Route = createFileRoute("/$project")({
    component: RouteComponent,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context, params }) => {
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider } = context;
        const { project } = params;
        const { parsedFiles, allInitialLintErrors } =
            await projectParamToParsedFiles(directoryProvider, project);
        return { parsedFiles, allInitialLintErrors };
    },
});

function RouteComponent() {
    const { parsedFiles, allInitialLintErrors } = Route.useLoaderData();
    const { project } = Route.useParams();
    return (
        <ProjectProvider
            currentProjectRoute={project}
            projectFiles={parsedFiles}
            allInitialLintErrors={allInitialLintErrors}
        >
            <ProjectView />
        </ProjectProvider>
    );
}

// todo: abstract off somewhere else and separate a littler better
export async function projectParamToParsedFiles(
    directoryProvider: IDirectoryProvider,
    project: string | undefined,
) {
    console.time("total time");
    console.time("getFileHandle");
    if (!project) return { parsedFiles: [], allInitialLintErrors: [] };
    console.time("getProjectDirAndManifest");
    const thisDir = await directoryProvider.getDirectoryHandle(project);
    const manifestHandle = (await thisDir.getFileHandle(
        "manifest.yaml",
    )) as FileSystemFileHandle;
    const manifestFile = await manifestHandle.getFile();
    const manifestText = await manifestFile.text();
    console.timeEnd("getProjectDirAndManifest");
    const parsedManifest = parse(manifestText);
    const language = parsedManifest?.dublin_core?.language;
    const files = await directoryProvider.getDirectoryHandle(project);
    const entry: Array<{
        path: string;
        name: string;
        file: File;
        text: string;
    }> = [];
    console.time("readUsfmEntries");
    const promises: Array<() => Promise<void>> = [];
    for await (const [name, handle] of files.entries()) {
        if (name.endsWith(".usfm") && handle.kind === "file") {
            promises.push(async () => {
                const h = handle as FileSystemFileHandle;
                const file = await h.getFile();
                const text = await file.text();
                // @ts-expect-error TODO: GENERIC INTERFACE FOR WEB + TAURI
                entry.push({ path: handle.path, name, file, text });
            });
        }
    }
    await Promise.allSettled(promises.map((p) => p()));
    console.timeEnd("readUsfmEntries");
    console.timeEnd("getFileHandle");
    const sorted = sortUsfmFilesByCanonicalOrder(entry);
    console.time("parse");
    // end here would prefer to wrap into a single abstraction
    // Next function call as parsing and going to lexicla state is separate is fine
    const allInitialLintErrors: LintError[] = [];
    const parsed: ParsedFile[] = sorted.map((file, i) => {
        const { usfm, lintErrors } = parseUSFMfile(file.text);
        allInitialLintErrors.push(...lintErrors);
        const bookSlug = getBookSlug(file.name);
        return {
            title: file.name,
            localizedTitle: parsedManifest?.projects?.find(
                (p: any) => p.identifier?.toUpperCase() === bookSlug,
            )?.title,
            bibleIdentifier: bookSlug,
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.name),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
            path: file.path,
            chapters: Object.entries(usfm).map(([chapter, tokens]) => ({
                lexicalState: parsedUsfmTokensToJsonLexicalNode(
                    tokens,
                    language.direction,
                ),
                chapNumber: Number(chapter),
                dirty: false,
            })),
        };
    });
    if (allInitialLintErrors.length > 0) {
        console.log(allInitialLintErrors);
    }
    console.timeEnd("parse");
    console.timeEnd("total time");
    return { parsedFiles: parsed, allInitialLintErrors };
}
