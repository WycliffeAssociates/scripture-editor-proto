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
        debugger
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { projectRepository } = context;
        const { project } = params;
        const result = await projectParamToParsedFiles(
            projectRepository,
            project,
        );

        const { parsedFiles, allInitialLintErrors } = result || {
            parsedFiles: [],
            allInitialLintErrors: [],
        };
        return { projectFiles: parsedFiles, allInitialLintErrors };
    },
});

function RouteComponent() {
    const { projectFiles, allInitialLintErrors } = Route.useLoaderData();
    const { project } = Route.useParams();
    return (
        <ProjectProvider
            currentProjectRoute={project}
            projectFiles={projectFiles}
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
    if (project === "undefined") return;
    if (!project) return;

    const loadedProject = await projectRepository.loadProject(project);
    if (!loadedProject) return;
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

    const parsed: ParsedFile[] = sorted.map((book, i) => {
        const { usfm, lintErrors } = parseUSFMfile(book.text);
        allInitialLintErrors.push(...lintErrors);
        return {
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.name),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
            title: book.name,
            bookCode: getBookSlug(book.name),
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
    console.timeEnd("parse");
    console.timeEnd("total time");
    return { parsedFiles: parsed, allInitialLintErrors };
}
