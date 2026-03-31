import { GitRemoteProjectService } from "@/app/domain/project/gitRemoteProjectService.ts";
import { attachTranslationNotesRemoteSync } from "@/app/reference/translationNotesRemoteSync.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import {
    type ImportSource,
    ProjectImporter,
} from "@/core/domain/project/import/ProjectImporter.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { createRemoteSourceMetadata } from "@/core/domain/project/referenceItemLoading.ts";
import {
    SCRIPTURE_BURRITO_METADATA_FILENAME,
    ScriptureBurritoProjectLoader,
} from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import {
    createImportProgressUpdate,
    ImportProgressPhase,
    type ImportProgressUpdate,
} from "@/core/library/ImportService.ts";
import { isUsfmScriptureItem } from "@/core/library/LibraryItem.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type {
    ProjectIndex,
    ResourceLibraryItem,
} from "@/core/library/ProjectIndex.ts";
import { packTranslationNotesDirectory } from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import { ItemLoader } from "@/core/loading/ItemLoader.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import { ensureProjectGitReady } from "@/core/persistence/ensureProjectGitReady.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectInfo } from "@/core/persistence/gitRemoteModels.ts";
import {
    deleteGitRemoteProjectInfo,
    deleteGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import {
    basenameStoragePath,
    joinStoragePath,
} from "@/core/persistence/pathUtils.ts";
import type {
    RemoteRepoPage,
    RemoteRepoProvider,
    RemoteRepoSummary,
} from "@/core/persistence/RemoteRepoProvider.ts";
import type {
    Project as FacadeProject,
    ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type {
    CloneWritableRemoteProjectArgs,
    ImportProjectOptions,
    ImportProjectResult,
    ListOwnedRemoteReposArgs,
    ListWritableRemoteReposArgs,
    OpenEditableProjectResult,
    ProjectsService,
    ReferenceResourceQuery,
} from "@/core/persistence/WorkspaceService.ts";

/**
 * App orchestration layer over managed scripture workspaces and library items.
 *
 * Import writes managed disk shape, `ItemLoader` turns managed paths into typed
 * nouns, and this service coordinates the application concerns around that flow:
 * opening items, importing, indexing, reconcile-on-startup, and wiring remote TN
 * update behavior back into the catalog.
 */
export type DefaultProjectsServiceDeps = {
    fileSystem: FileSystem;
    roots: StorageRoots;
    projectIndex: ProjectIndex;
    md5Service: IMd5Service;
    gitProvider: GitProvider;
    remote?: {
        authSessionProvider: AuthSessionProvider;
        remoteRepoProvider: RemoteRepoProvider;
    };
};

export class DefaultProjectsService implements ProjectsService {
    protected readonly fileSystem: FileSystem;
    protected readonly roots: StorageRoots;
    protected readonly projectIndex: ProjectIndex;
    protected readonly projectImporter: ProjectImporter;
    protected readonly gitProvider: GitProvider;
    protected readonly itemLoader: ItemLoader;
    protected readonly resourceContainerLoader: ResourceContainerProjectLoader;
    protected readonly scriptureBurritoLoader: ScriptureBurritoProjectLoader;
    private readonly gitRemoteProjectService: GitRemoteProjectService | null;

    constructor({
        fileSystem,
        roots,
        projectIndex,
        md5Service,
        gitProvider,
        remote,
    }: DefaultProjectsServiceDeps) {
        this.fileSystem = fileSystem;
        this.roots = roots;
        this.projectIndex = projectIndex;
        this.projectImporter = new ProjectImporter(fileSystem, roots);
        this.gitProvider = gitProvider;
        this.itemLoader = new ItemLoader(md5Service);
        this.resourceContainerLoader = new ResourceContainerProjectLoader();
        this.scriptureBurritoLoader = new ScriptureBurritoProjectLoader(
            md5Service,
        );
        this.gitRemoteProjectService = remote
            ? new GitRemoteProjectService(
                  fileSystem,
                  roots,
                  remote.authSessionProvider,
                  remote.remoteRepoProvider,
              )
            : null;
    }

    protected isAbsoluteProjectPath(projectRef: string): boolean {
        return /^([A-Za-z]:[\\/]|\/)/u.test(projectRef);
    }

    private toProjectListItem(project: FacadeProject): ProjectListItem {
        return {
            folderName: project.folderName,
            projectPath: project.projectPath,
            displayName: project.displayName,
            projectId: project.projectId,
            languageCode: project.language.code,
            languageName: project.language.name,
            projectType: project.projectType,
        };
    }

    protected resolveProjectPath(projectRef: string): string {
        return this.isAbsoluteProjectPath(projectRef)
            ? projectRef
            : joinStoragePath(this.roots.projectsRoot, projectRef);
    }

    protected async resolveProjectDisplayName(
        projectPath: string,
    ): Promise<string> {
        const indexed = await this.projectIndex.getProjectByPath(projectPath);
        return indexed?.displayName ?? basenameStoragePath(projectPath);
    }

    private async reportImportProgress(
        options: ImportProjectOptions | undefined,
        update: ImportProgressUpdate,
    ): Promise<void> {
        await options?.onProgress?.(update);
    }

    /**
     * Reopen a managed path as the lower-level reference/document noun.
     *
     * `ItemLoader` is the main path to typed nouns. This helper exists for the
     * smaller set of flows that still need document-list browsing or TN remote
     * update plumbing before they cross back into typed items.
     */
    protected async reopenManagedResource(args: {
        managedPath: string;
        displayName: string;
    }): Promise<LoadedReferenceItem | null> {
        const metadataPath = `${args.managedPath}/${SCRIPTURE_BURRITO_METADATA_FILENAME}`;
        const manifestPath = `${args.managedPath}/manifest.yaml`;

        if (await this.fileSystem.exists(metadataPath)) {
            const resource = await this.scriptureBurritoLoader.openResource({
                fs: this.fileSystem,
                projectRootPath: args.managedPath,
                folderName: basenameStoragePath(args.managedPath),
                displayName: args.displayName,
            });
            if (resource) return resource;
        }

        if (await this.fileSystem.exists(manifestPath)) {
            return this.resourceContainerLoader.openResource({
                fs: this.fileSystem,
                projectRootPath: args.managedPath,
                folderName: basenameStoragePath(args.managedPath),
                displayName: args.displayName,
            });
        }

        return null;
    }

    private toResourceListItem(resource: LoadedReferenceItem): ProjectListItem {
        return {
            folderName: resource.folderName,
            projectPath: resource.managedPath,
            displayName: resource.displayName,
            projectId: resource.projectId,
            languageCode: resource.descriptor.language.code,
            languageName: resource.descriptor.language.name,
            projectType: resource.projectType,
        };
    }

    private async loadProject(
        projectRef: string,
    ): Promise<FacadeProject | null> {
        try {
            const projectPath = this.resolveProjectPath(projectRef);
            if (!(await this.fileSystem.exists(projectPath))) {
                return null;
            }

            const item = await this.itemLoader.openItem({
                fs: this.fileSystem,
                managedPath: projectPath,
                displayName: await this.resolveProjectDisplayName(projectPath),
            });
            return item && isUsfmScriptureItem(item) ? item : null;
        } catch (error) {
            console.error(`Error loading project ${projectRef}:`, error);
            return null;
        }
    }

    private async loadResource(
        projectRef: string,
    ): Promise<LoadedReferenceItem | null> {
        try {
            const projectPath = this.resolveProjectPath(projectRef);
            if (!(await this.fileSystem.exists(projectPath))) {
                return null;
            }

            const indexed =
                await this.projectIndex.getLibraryItemByPath(projectPath);
            console.debug(
                `[DefaultProjectsService] Opening reference resource via resource path for ${projectPath}.`,
            );
            const resource = await this.reopenManagedResource({
                managedPath: projectPath,
                displayName:
                    indexed?.displayName ?? basenameStoragePath(projectPath),
            });
            return resource
                ? attachTranslationNotesRemoteSync(resource, {
                      fileSystem: this.fileSystem,
                      projectImporter: this.projectImporter,
                      reopenResource: ({ managedPath, displayName }) =>
                          this.reopenManagedResource({
                              managedPath,
                              displayName,
                          }),
                      itemLoader: this.itemLoader,
                      projectIndex: this.projectIndex,
                  })
                : null;
        } catch (error) {
            console.error(`Error loading resource ${projectRef}:`, error);
            return null;
        }
    }

    private matchesReferenceQuery(
        item: ResourceLibraryItem,
        query?: ReferenceResourceQuery,
    ): boolean {
        if (query?.types && !query.types.includes(item.type)) {
            return false;
        }
        if (
            query?.libraryGroups &&
            !query.libraryGroups.includes(item.libraryGroup)
        ) {
            return false;
        }

        return true;
    }

    async openProject(projectRef: string): Promise<FacadeProject | null> {
        return (await this.openEditableProject(projectRef)).project;
    }

    async openEditableProject(
        projectRef: string,
    ): Promise<OpenEditableProjectResult> {
        try {
            const projectPath = this.resolveProjectPath(projectRef);
            if (!(await this.fileSystem.exists(projectPath))) {
                return { project: null, rejectionReason: "not-found" };
            }

            const displayName =
                await this.resolveProjectDisplayName(projectPath);
            const item = await this.itemLoader.openItem({
                fs: this.fileSystem,
                managedPath: projectPath,
                displayName,
            });
            if (item && isUsfmScriptureItem(item)) {
                return { project: item };
            }

            return {
                project: null,
                rejectionReason: item ? "not-editable" : "not-found",
            };
        } catch (error) {
            console.error(
                `Error opening editable project ${projectRef}:`,
                error,
            );
            return { project: null, rejectionReason: "not-found" };
        }
    }

    async openProjectReadOnly(
        projectRef: string,
    ): Promise<FacadeProject | null> {
        return this.loadProject(projectRef);
    }

    async openResource(
        projectRef: string,
    ): Promise<LoadedReferenceItem | null> {
        return this.loadResource(projectRef);
    }

    async importProject(
        source: ImportSource,
        options?: ImportProjectOptions,
    ): Promise<ImportProjectResult> {
        await this.reportImportProgress(
            options,
            createImportProgressUpdate(
                ImportProgressPhase.SELECT_SOURCE,
                "Selecting import source...",
            ),
        );

        try {
            const importedPath = await this.projectImporter.import(
                source,
                async (update) => {
                    await this.reportImportProgress(options, update);
                },
            );
            const projectId = importedPath.split("/").filter(Boolean).at(-1);
            if (!projectId) {
                throw new Error("Imported project path could not be resolved");
            }

            await this.reportImportProgress(
                options,
                createImportProgressUpdate(
                    ImportProgressPhase.INSPECT_RESOURCE,
                    "Inspecting imported resource...",
                ),
            );
            const loadedProject = await this.openProject(importedPath);
            if (!loadedProject) {
                let loadedResource = await this.openResource(importedPath);
                if (!loadedResource) {
                    throw new Error(
                        `Imported project could not be loaded: ${projectId}`,
                    );
                }

                if (loadedResource.descriptor.type === "translationNotes") {
                    await this.reportImportProgress(
                        options,
                        createImportProgressUpdate(
                            ImportProgressPhase.RESHAPE_RESOURCE,
                            "Packing translation notes into per-book JSON...",
                        ),
                    );

                    try {
                        await packTranslationNotesDirectory({
                            fs: this.fileSystem,
                            resourcePath: importedPath,
                            remoteSource:
                                source.type === "fromGitRepo"
                                    ? createRemoteSourceMetadata({
                                          identifier: source.url,
                                      })
                                    : undefined,
                            onProgress: async (update) =>
                                this.reportImportProgress(options, update),
                        });
                    } catch (error) {
                        try {
                            await this.fileSystem.remove(importedPath, {
                                recursive: true,
                            });
                        } catch {
                            // best-effort cleanup
                        }
                        throw error;
                    }

                    loadedResource = await this.openResource(importedPath);
                    if (!loadedResource) {
                        throw new Error(
                            `Packed translation notes resource could not be reloaded: ${projectId}`,
                        );
                    }
                }

                await this.reportImportProgress(
                    options,
                    createImportProgressUpdate(
                        ImportProgressPhase.INDEX_RESOURCE,
                        "Indexing imported resource...",
                    ),
                );
                const loadedItem = await this.itemLoader.openItem({
                    fs: this.fileSystem,
                    managedPath: importedPath,
                    displayName: loadedResource.displayName,
                });
                if (!loadedItem) {
                    throw new Error(
                        `Imported resource could not be reopened as a typed item: ${projectId}`,
                    );
                }
                await this.projectIndex.indexItem(loadedItem);
                const indexedResource =
                    (await this.projectIndex.getLibraryItemByPath(
                        importedPath,
                    )) ?? this.toResourceListItem(loadedResource);

                await this.reportImportProgress(
                    options,
                    createImportProgressUpdate(
                        ImportProgressPhase.COMPLETE,
                        "Import completed.",
                        {
                            itemType: loadedResource.descriptor.type,
                        },
                    ),
                );

                return {
                    project: indexedResource,
                    gitReady: false,
                    isEditableProject: false,
                };
            }

            await this.reportImportProgress(
                options,
                createImportProgressUpdate(
                    ImportProgressPhase.INDEX_RESOURCE,
                    "Indexing imported project...",
                ),
            );
            await this.projectIndex.indexItem(loadedProject);
            const indexedProject =
                (await this.projectIndex.getProjectByPath(importedPath)) ??
                this.toProjectListItem(loadedProject);

            try {
                await this.reportImportProgress(
                    options,
                    createImportProgressUpdate(
                        ImportProgressPhase.RESHAPE_RESOURCE,
                        "Preparing version history...",
                    ),
                );
                await ensureProjectGitReady({
                    fileSystem: this.fileSystem,
                    gitProvider: this.gitProvider,
                    loadedProject,
                });

                await this.reportImportProgress(
                    options,
                    createImportProgressUpdate(
                        ImportProgressPhase.COMPLETE,
                        "Import completed.",
                    ),
                );

                return {
                    project: indexedProject,
                    gitReady: true,
                    isEditableProject: true,
                };
            } catch (error) {
                const warningBase =
                    "Project imported successfully, but version history could not be initialized.";
                const warning =
                    error instanceof Error && error.message.trim().length > 0
                        ? `${warningBase} ${error.message.trim()}`
                        : warningBase;
                console.error(
                    `Git readiness failed after importing project ${importedPath}:`,
                    error,
                );
                await this.reportImportProgress(
                    options,
                    createImportProgressUpdate(
                        ImportProgressPhase.FAILED,
                        warning,
                    ),
                );
                return {
                    project: indexedProject,
                    gitReady: false,
                    isEditableProject: true,
                    warning,
                };
            }
        } catch (error) {
            const message =
                error instanceof Error && error.message.trim().length > 0
                    ? error.message.trim()
                    : "Import failed.";
            await this.reportImportProgress(
                options,
                createImportProgressUpdate(ImportProgressPhase.FAILED, message),
            );
            throw error;
        }
    }

    async listWritableRemoteRepos(
        args: ListWritableRemoteReposArgs,
    ): Promise<RemoteRepoPage> {
        return this.requireGitRemoteProjectService().listWritableRepos(args);
    }

    async listOwnedRemoteRepos(
        args: ListOwnedRemoteReposArgs,
    ): Promise<RemoteRepoPage> {
        return this.requireGitRemoteProjectService().listOwnedRepos(args);
    }

    async createRemoteForProject(projectRef: string): Promise<{
        repo: RemoteRepoSummary;
        remoteInfo: GitRemoteProjectInfo;
    }> {
        const { project, rejectionReason } =
            await this.openEditableProject(projectRef);
        if (!project) {
            throw new Error(
                rejectionReason === "not-editable"
                    ? "Remote linking only supports editable scripture projects"
                    : "Project not found",
            );
        }
        return this.requireGitRemoteProjectService().createRemoteForProject(
            project,
        );
    }

    async attachProjectToRemote(args: {
        projectRef: string;
        repo: Pick<
            RemoteRepoSummary,
            "id" | "owner" | "name" | "htmlUrl" | "defaultBranch"
        >;
    }): Promise<GitRemoteProjectInfo> {
        const { project, rejectionReason } = await this.openEditableProject(
            args.projectRef,
        );
        if (!project) {
            throw new Error(
                rejectionReason === "not-editable"
                    ? "Remote linking only supports editable scripture projects"
                    : "Project not found",
            );
        }
        return this.requireGitRemoteProjectService().attachProjectToRemote({
            projectPath: project.projectPath,
            repo: args.repo,
        });
    }

    async cloneWritableRemoteProject(
        args: CloneWritableRemoteProjectArgs,
    ): Promise<ImportProjectResult> {
        const remoteService = this.requireGitRemoteProjectService();
        const projectPath = await this.allocateCloneProjectPath(args.repo.name);

        try {
            await remoteService.cloneRemoteRepoToManagedPath({
                projectPath,
                repo: args.repo,
                gitProvider: this.gitProvider,
            });

            return await this.importProject({
                type: "fromPreparedDir",
                directoryPath: projectPath,
            });
        } catch (error) {
            await this.cleanupFailedClonedProject(projectPath);
            throw error;
        }
    }

    async listProjects(): Promise<ProjectListItem[]> {
        return this.projectIndex.listProjects();
    }

    async listReferenceResources(
        query?: ReferenceResourceQuery,
    ): Promise<ResourceLibraryItem[]> {
        const indexedItems = await this.projectIndex.listLibraryItems();
        const filteredItems = indexedItems.filter((item) =>
            this.matchesReferenceQuery(item, query),
        );
        console.debug(
            `[DefaultProjectsService] Listed ${filteredItems.length} reference resources using the resource-library path.`,
        );
        return filteredItems;
    }

    async reconcileIndex(): Promise<void> {
        const indexedItems = await this.projectIndex.listLibraryItems();
        for (const item of indexedItems) {
            if (await this.fileSystem.exists(item.projectPath)) {
                continue;
            }
            await this.projectIndex.deleteProject(item.projectPath);
        }

        if (!(await this.fileSystem.exists(this.roots.projectsRoot))) {
            return;
        }

        const projectEntries = await this.fileSystem.list(
            this.roots.projectsRoot,
        );
        for (const entry of projectEntries) {
            if (entry.kind !== "directory") {
                continue;
            }

            const loadedItem = await this.itemLoader.openItem({
                fs: this.fileSystem,
                managedPath: entry.path,
                displayName: await this.resolveProjectDisplayName(entry.path),
            });
            if (loadedItem) {
                await this.projectIndex.indexItem(loadedItem);
            }
        }
    }

    async deleteProject(
        projectPath: string,
        options: { recursive: boolean } = { recursive: true },
    ): Promise<void> {
        await this.fileSystem.remove(projectPath, options);
        await this.projectIndex.deleteProject(projectPath);
    }

    async renameDisplayName(
        projectPath: string,
        displayName: string,
    ): Promise<void> {
        await this.projectIndex.renameDisplayName(projectPath, displayName);
    }

    private requireGitRemoteProjectService(): GitRemoteProjectService {
        if (!this.gitRemoteProjectService) {
            throw new Error("Remote project operations are not configured");
        }
        return this.gitRemoteProjectService;
    }

    private async allocateCloneProjectPath(repoName: string): Promise<string> {
        const basePath = joinStoragePath(this.roots.projectsRoot, repoName);
        if (!(await this.fileSystem.exists(basePath))) {
            return basePath;
        }

        let suffix = 2;
        while (true) {
            const candidate = joinStoragePath(
                this.roots.projectsRoot,
                `${repoName}-${suffix}`,
            );
            if (!(await this.fileSystem.exists(candidate))) {
                return candidate;
            }
            suffix += 1;
        }
    }

    private async cleanupFailedClonedProject(
        projectPath: string,
    ): Promise<void> {
        if (await this.fileSystem.exists(projectPath)) {
            await this.fileSystem.remove(projectPath, { recursive: true });
        }
        await deleteGitRemoteProjectInfo({
            fileSystem: this.fileSystem,
            storageRoots: this.roots,
            projectPath,
        });
        await deleteGitRemoteProjectStatus({
            fileSystem: this.fileSystem,
            storageRoots: this.roots,
            projectPath,
        });
    }
}
