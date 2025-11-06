import { createFileRoute } from "@tanstack/react-router";
import type { ParsedFile } from "@/app/data/parsedProject";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical";

import { ProjectView } from "@/app/ui/components/views/ProjectView";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible";
import type { LintError } from "@/core/data/usfm/lint";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export const Route = createFileRoute("/$project")({
    component: RouteComponent,
    pendingComponent: () => <div>Loading...</div>,
    pendingMs: 100,
    loader: async ({ context, params }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { projectRepository } = context;
        const { project } = params;
        const result = await projectParamToParsedFiles(
            projectRepository,
            project,
        );
        const { parsedFiles, allInitialLintErrors, loadedProject } = result || {
            parsedFiles: [],
            allInitialLintErrors: [],
            loadedProject: null,
        };
        return {
            projectFiles: parsedFiles,
            allInitialLintErrors,
            loadedProject,
        };
    },
});

function RouteComponent() {
    const { projectFiles, allInitialLintErrors, loadedProject } =
        Route.useLoaderData();
    const { project } = Route.useParams();
    if (!loadedProject) return <div>Project not found</div>;
    return (
        <ProjectProvider
            currentProjectRoute={project}
            projectFiles={projectFiles}
            allInitialLintErrors={allInitialLintErrors}
            loadedProject={loadedProject}
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
    if (project === "undefined") return;
    if (!project) return;
    const loadedProject = await projectRepository.loadProject(project);
    if (!loadedProject) return;
    console.time("total load time");
    const language = loadedProject.metadata.language;
    const entries: Array<{
        code: string;
        text: string;
        name: string;
    }> = [];

    for (const bookName of Object.keys(canonicalBookMap)) {
        const bookContent = loadedProject.getBook(bookName);
        if (entries && bookContent) {
            const text = await bookContent;
            if (!text) continue;
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
    const allInitialLintErrors: LintError[] = [];

    console.time("parseAll");
    const parsed: ParsedFile[] = sorted.map((book, i) => {
        // console.time(`${book.name} parse`);
        const { usfm, lintErrors } = parseUSFMfile(book.text);
        allInitialLintErrors.push(...lintErrors);
        // console.timeEnd(`${book.name} parse`);
        return {
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.name),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
            title: book.name,
            bookCode: getBookSlug(book.name),
            chapters: Object.entries(usfm).map(([chapter, tokens]) => {
                const initialState = parsedUsfmTokensToJsonLexicalNode(
                    tokens,
                    language.direction,
                );
                return {
                    lexicalState: initialState,
                    loadedLexicalState: initialState,
                    chapNumber: Number(chapter),
                    dirty: false,
                };
            }),
        };
    });
    console.timeEnd("parseAll");
    console.timeEnd("total load time");
    return { parsedFiles: parsed, allInitialLintErrors, loadedProject };
}
