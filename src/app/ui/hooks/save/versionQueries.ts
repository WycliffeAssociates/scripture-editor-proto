import type { QueryClient } from "@tanstack/react-query";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

const VERSION_PREVIEW_CACHE_LIMIT = 8;
const versionPreviewLruByProject = new Map<string, string[]>();

export type VersionPreviewResult = {
    parsedFiles: ScriptureBookState[];
    commitHash: string;
};

export function versionPreviewQueryKey(
    projectPath: string,
    commitHash: string,
) {
    return ["versionPreview", projectPath, commitHash] as const;
}

function versionPreviewQueryOptions(args: {
    projectPath: string;
    commitHash: string;
    loadedProject: Project;
    gitProvider: GitProvider;
    usfmOnionService: IUsfmOnionService;
}) {
    return {
        queryKey: versionPreviewQueryKey(args.projectPath, args.commitHash),
        queryFn: async (): Promise<VersionPreviewResult> => {
            const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
                args.projectPath,
                args.commitHash,
            );
            const parsedFiles = await snapshotToScriptureBookStates({
                loadedProject: args.loadedProject,
                snapshot,
                usfmOnionService: args.usfmOnionService,
            });

            return {
                parsedFiles,
                commitHash: args.commitHash,
            };
        },
        staleTime: 60_000,
    } as const;
}

function rememberVersionPreview(args: {
    queryClient: QueryClient;
    projectPath: string;
    commitHash: string;
}) {
    const next = versionPreviewLruByProject.get(args.projectPath) ?? [];
    const deduped = [
        args.commitHash,
        ...next.filter((hash) => hash !== args.commitHash),
    ];
    versionPreviewLruByProject.set(args.projectPath, deduped);

    for (const evictedHash of deduped.slice(VERSION_PREVIEW_CACHE_LIMIT)) {
        args.queryClient.removeQueries({
            queryKey: versionPreviewQueryKey(args.projectPath, evictedHash),
            exact: true,
        });
    }
    versionPreviewLruByProject.set(
        args.projectPath,
        deduped.slice(0, VERSION_PREVIEW_CACHE_LIMIT),
    );
}

export async function prefetchVersionPreview(args: {
    queryClient: QueryClient;
    projectPath: string;
    commitHash: string;
    loadedProject: Project;
    gitProvider: GitProvider;
    usfmOnionService: IUsfmOnionService;
}) {
    await args.queryClient.prefetchQuery(
        versionPreviewQueryOptions({
            projectPath: args.projectPath,
            commitHash: args.commitHash,
            loadedProject: args.loadedProject,
            gitProvider: args.gitProvider,
            usfmOnionService: args.usfmOnionService,
        }),
    );
    rememberVersionPreview(args);
}

export async function fetchVersionPreview(args: {
    queryClient: QueryClient;
    projectPath: string;
    commitHash: string;
    loadedProject: Project;
    gitProvider: GitProvider;
    usfmOnionService: IUsfmOnionService;
}) {
    const result = await args.queryClient.fetchQuery(
        versionPreviewQueryOptions({
            projectPath: args.projectPath,
            commitHash: args.commitHash,
            loadedProject: args.loadedProject,
            gitProvider: args.gitProvider,
            usfmOnionService: args.usfmOnionService,
        }),
    );
    rememberVersionPreview(args);
    return result;
}
