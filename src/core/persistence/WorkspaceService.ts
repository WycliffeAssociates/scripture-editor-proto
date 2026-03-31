import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
    ImportProjectOptions,
    ImportProjectResult,
} from "@/core/library/ImportService.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type {
    ResourceLibraryGroup,
    ResourceLibraryItem,
} from "@/core/library/ProjectIndex.ts";
import type { GitRemoteProjectInfo } from "@/core/persistence/gitRemoteModels.ts";
import type {
    RemoteRepoPage,
    RemoteRepoSummary,
} from "@/core/persistence/RemoteRepoProvider.ts";
import type {
    ScriptureWorkspace,
    ScriptureWorkspaceListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";

export type {
    ImportProgressPhase,
    ImportProgressUpdate,
    ImportProjectOptions,
    ImportProjectResult,
    ImportSourceResult,
} from "@/core/library/ImportService.ts";

/**
 * Narrow helpers extracted from the broader projects facade.
 *
 * Route modules and hooks often need only one small slice of the service. These
 * picks make that dependency explicit without forcing every caller through the
 * full interface.
 */
export type OpenWorkspaceService = Pick<WorkspaceService, "openProject">;
export type ReadOnlyOpenWorkspaceService = Pick<
    WorkspaceService,
    "openProjectReadOnly"
>;

export type ReferenceResourceQuery = {
    types?: readonly IndexedLibraryItemType[];
    libraryGroups?: readonly ResourceLibraryGroup[];
};

/**
 * Result used by scripture-only entrypoints that need to distinguish "path was
 * missing" from "item exists but is not editable scripture".
 */
export type OpenEditableWorkspaceResult = {
    project: ScriptureWorkspace | null;
    rejectionReason?: "not-found" | "not-editable";
};

export type ListWritableRemoteReposArgs = {
    page: number;
    pageSize: number;
    topic?: string;
};

export type ListOwnedRemoteReposArgs = {
    page: number;
    pageSize: number;
    topic?: string;
};

export type CloneWritableRemoteProjectArgs = {
    repo: RemoteRepoSummary;
};

/**
 * Editor-oriented facade over editable scripture workspaces and reference items.
 *
 * `LibraryService` is the generic top-level catalog/open seam. `WorkspaceService`
 * is the editor-facing facade for the scripture workspace shell and the
 * reference tools that hang off it.
 */
export interface WorkspaceService {
    listProjects(): Promise<ScriptureWorkspaceListItem[]>;
    listReferenceResources(
        query?: ReferenceResourceQuery,
    ): Promise<ResourceLibraryItem[]>;
    openEditableProject(
        projectRef: string,
    ): Promise<OpenEditableWorkspaceResult>;
    openProject(projectRef: string): Promise<ScriptureWorkspace | null>;
    openProjectReadOnly(projectRef: string): Promise<ScriptureWorkspace | null>;
    openResource(projectRef: string): Promise<LoadedReferenceItem | null>;
    importProject(
        source: ImportSource,
        options?: ImportProjectOptions,
    ): Promise<ImportProjectResult>;
    listWritableRemoteRepos(
        args: ListWritableRemoteReposArgs,
    ): Promise<RemoteRepoPage>;
    listOwnedRemoteRepos(
        args: ListOwnedRemoteReposArgs,
    ): Promise<RemoteRepoPage>;
    createRemoteForProject(projectRef: string): Promise<{
        repo: RemoteRepoSummary;
        remoteInfo: GitRemoteProjectInfo;
    }>;
    attachProjectToRemote(args: {
        projectRef: string;
        repo: Pick<
            RemoteRepoSummary,
            "id" | "owner" | "name" | "htmlUrl" | "defaultBranch"
        >;
    }): Promise<GitRemoteProjectInfo>;
    cloneWritableRemoteProject(
        args: CloneWritableRemoteProjectArgs,
    ): Promise<ImportProjectResult>;
    deleteProject(workspacePath: string): Promise<void>;
    renameDisplayName(
        workspacePath: string,
        displayName: string,
    ): Promise<void>;
    reconcileIndex(): Promise<void>;
}

export type OpenProjectService = OpenWorkspaceService;
export type ReadOnlyOpenProjectService = ReadOnlyOpenWorkspaceService;
export type OpenEditableProjectResult = OpenEditableWorkspaceResult;
export type ProjectsService = WorkspaceService;
