import { createFileRoute } from "@tanstack/react-router";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { projectParamToParsedFiles } from "@/app/domain/api/projectToParsed.tsx";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import { generateUsfmFilename } from "@/core/domain/project/scriptureBurritoHelpers.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export const Route = createFileRoute("/$project")({
    component: RouteComponent,
    pendingComponent: () => (
        <div className="h-screen w-screen grid place-items-center">
            Loading...
        </div>
    ),
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
