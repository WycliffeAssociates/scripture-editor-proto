import { createFileRoute } from "@tanstack/react-router";
import { parse } from "yaml";
import { ParsedFile } from "@/app/data/parsedProject";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/serialize";
import { ProjectView } from "@/app/ui/components/views/ProjectView";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse";
import { IDirectoryProvider } from "@/core/persistence/DirectoryProvider";
import { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export const Route = createFileRoute("/$project")({
    component: RouteComponent,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context, params }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider, projectRepository } = context;
        const { project } = params;
        const { parsedFiles, allInitialLintErrors } =
            await projectParamToParsedFiles(projectRepository, project);
        return { projectFiles: parsedFiles };
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
    projectRepository: IProjectRepository,
    project: string | undefined,
) {
    if (project === "undefined") return [];
    if (!project) return [];

    const loadedProject = await projectRepository.loadProject(project);
    const language = loadedProject.metadata.language;
    const entries: Array<{
        code: string;
        text: string;
        name: string;
    }> = [];

    for (const bookName of Object.keys(canonicalBookMap)) {
        const bookContent = loadedProject?.getBook(bookName);
        if (entries && bookContent) {
            const text = await bookContent;
            entries.push({
                code: bookName,
                name: bookName,
                text: text,
            });
        }
    }
    const sorted = sortUsfmFilesByCanonicalOrder(entries);
    // end here would prefer to wrap into a single abstraction
    // Next function call as parsing and going to lexicla state is separate is fine
    const parsed: ParsedFile[] = sorted.map((book, i) => {
        const parsed = parseUSFMfile(book.text);
        return {
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.name),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
            title: book.name,
            bookCode: getBookSlug(book.name),
            chapters: Object.entries(parsed).map(([chapter, tokens]) => ({
                lexicalState: parsedUsfmTokensToJsonLexicalNode(
                    tokens,
                    language.direction,
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
