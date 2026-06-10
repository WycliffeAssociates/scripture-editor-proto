import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectInfo } from "@/core/persistence/gitRemoteModels.ts";
import { writeGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import type {
    RemoteRepoProjectMetadata,
    RemoteRepoProvider,
    RemoteRepoSummary,
} from "@/core/persistence/RemoteRepoProvider.ts";
import { REMOTE_REPO_CREATED_DEFAULT_BRANCH } from "@/core/persistence/RemoteRepoProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Project-level cloud-link orchestration.
 *
 * This service turns the authenticated repo catalog into durable app-local
 * linkage records for editable scripture projects. It keeps git transport out
 * of the flow so later clone/publish work can compose this seam rather than
 * re-implement repo discovery or naming rules.
 */
export const GIT_REMOTE_DEFAULT_TOPIC = "consolidated" as const;
const GIT_REMOTE_DEFAULT_VISIBILITY = "public" as const;

export class GitRemoteProjectService {
    constructor(
        private readonly fileSystem: FileSystem,
        private readonly storageRoots: StorageRoots,
        private readonly authSessionProvider: AuthSessionProvider,
        private readonly remoteRepoProvider: RemoteRepoProvider,
    ) {}

    async listWritableRepos(args: {
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
    }) {
        const session = await this.requireSession();
        return this.remoteRepoProvider.listWritableRepos({
            hostBaseUrl: session.hostBaseUrl,
            username: session.username,
            token: session.token,
            page: args.page,
            pageSize: args.pageSize,
            // In this ecosystem, write-eligibility is carried by the
            // `consolidated` topic, so the writable listing is gated on it.
            topic: args.topic ?? GIT_REMOTE_DEFAULT_TOPIC,
            searchQuery: args.searchQuery,
            signal: args.signal,
        });
    }

    async listOwnedRepos(args: {
        page: number;
        pageSize: number;
        topic?: string;
        searchQuery?: string;
        signal?: AbortSignal;
    }) {
        const session = await this.requireSession();
        return this.remoteRepoProvider.listOwnedRepos({
            hostBaseUrl: session.hostBaseUrl,
            username: session.username,
            token: session.token,
            page: args.page,
            pageSize: args.pageSize,
            topic: args.topic ?? GIT_REMOTE_DEFAULT_TOPIC,
            searchQuery: args.searchQuery,
            signal: args.signal,
        });
    }

    async getRepo(args: { owner: string; name: string; signal?: AbortSignal }) {
        const session = await this.requireSession();
        return this.remoteRepoProvider.getRepo({
            hostBaseUrl: session.hostBaseUrl,
            username: session.username,
            token: session.token,
            owner: args.owner,
            name: args.name,
            signal: args.signal,
        });
    }

    async forkRepo(args: {
        owner: string;
        name: string;
        signal?: AbortSignal;
    }) {
        const session = await this.requireSession();
        return this.remoteRepoProvider.forkRepo({
            hostBaseUrl: session.hostBaseUrl,
            username: session.username,
            token: session.token,
            owner: args.owner,
            name: args.name,
            // Forks must carry the write-eligibility marker, same as created
            // remotes (see createRemoteForProject).
            topics: [GIT_REMOTE_DEFAULT_TOPIC],
            signal: args.signal,
        });
    }

    async createRemoteForProject(
        project: Pick<
            Project,
            "projectPath" | "displayName" | "projectId" | "language"
        >,
    ) {
        const session = await this.requireSession();
        const repo = await this.remoteRepoProvider.createRepo({
            hostBaseUrl: session.hostBaseUrl,
            username: session.username,
            token: session.token,
            request: {
                name: buildRemoteRepoNameForProject(project),
                visibility: GIT_REMOTE_DEFAULT_VISIBILITY,
                topics: [GIT_REMOTE_DEFAULT_TOPIC],
                defaultBranch: REMOTE_REPO_CREATED_DEFAULT_BRANCH,
            },
        });

        const remoteInfo = buildGitRemoteProjectInfo({
            projectPath: project.projectPath,
            hostBaseUrl: session.hostBaseUrl,
            repo,
        });
        await this.persistRemoteInfo(remoteInfo);
        return { repo, remoteInfo };
    }

    async attachProjectToRemote(args: {
        project: Pick<Project, "projectPath" | "displayName" | "language">;
        repo: Pick<
            RemoteRepoSummary,
            "id" | "owner" | "name" | "htmlUrl" | "defaultBranch"
        >;
    }) {
        const session = await this.requireSession();
        const remoteMetadata =
            await this.remoteRepoProvider.inspectProjectMetadata({
                hostBaseUrl: session.hostBaseUrl,
                token: session.token,
                repoOwner: args.repo.owner,
                repoName: args.repo.name,
                ref: args.repo.defaultBranch,
            });
        assertRemoteRepoMatchesProject({
            project: args.project,
            repo: args.repo,
            remoteMetadata,
        });
        const remoteInfo = buildGitRemoteProjectInfo({
            projectPath: args.project.projectPath,
            hostBaseUrl: session.hostBaseUrl,
            repo: args.repo,
        });
        await this.persistRemoteInfo(remoteInfo);
        return remoteInfo;
    }

    async cloneRemoteRepoToManagedPath(args: {
        projectPath: string;
        repo: Pick<
            RemoteRepoSummary,
            "id" | "owner" | "name" | "htmlUrl" | "cloneUrl" | "defaultBranch"
        >;
        gitProvider: Pick<GitProvider, "cloneRemoteRepo">;
    }) {
        const session = await this.requireSession();
        const cloneResult = await args.gitProvider.cloneRemoteRepo({
            projectPath: args.projectPath,
            remoteUrl: args.repo.cloneUrl,
            branch: args.repo.defaultBranch,
            auth: {
                username: session.username,
                token: session.token,
            },
        });

        const remoteInfo = buildGitRemoteProjectInfo({
            projectPath: args.projectPath,
            hostBaseUrl: session.hostBaseUrl,
            repo: args.repo,
        });
        return {
            projectPath: args.projectPath,
            remoteInfo,
            head: cloneResult.head,
        };
    }

    async persistRemoteInfo(info: GitRemoteProjectInfo) {
        await this.writeRemoteInfo(info);
    }

    private async requireSession() {
        const session = await this.authSessionProvider.getCurrentSession();
        if (!session) {
            throw new Error(
                "Remote project operations require an active session",
            );
        }
        return session;
    }

    private async writeRemoteInfo(info: GitRemoteProjectInfo) {
        await writeGitRemoteProjectInfo({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
            info,
        });
    }
}

export function buildRemoteRepoNameForProject(
    project: Pick<Project, "displayName" | "projectId" | "language">,
): string {
    const languageCode = normalizeRepoSegment(project.language.code);
    const projectSlug = normalizeRepoSegment(
        project.projectId ?? project.displayName,
    );
    return `${languageCode}-${projectSlug}`;
}

export function buildGitRemoteProjectInfo(args: {
    projectPath: string;
    hostBaseUrl: string;
    repo: {
        id: string;
        owner: string;
        name: string;
        htmlUrl: string;
        defaultBranch?: string;
    };
}): GitRemoteProjectInfo {
    return {
        schemaVersion: 1,
        projectPath: args.projectPath,
        hostBaseUrl: args.hostBaseUrl,
        repoId: args.repo.id,
        repoOwner: args.repo.owner,
        repoName: args.repo.name,
        repoUrl: args.repo.htmlUrl,
        trackedBranch:
            args.repo.defaultBranch || REMOTE_REPO_CREATED_DEFAULT_BRANCH,
    };
}

function normalizeRepoSegment(value: string): string {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");

    return normalized || "project";
}

function assertRemoteRepoMatchesProject(args: {
    project: Pick<Project, "displayName" | "language">;
    repo: Pick<RemoteRepoSummary, "owner" | "name" | "defaultBranch">;
    remoteMetadata: RemoteRepoProjectMetadata | null;
}) {
    if (!args.remoteMetadata) {
        throw new Error(
            `This cloud repository is missing metadata.json or manifest.yaml on ${args.repo.defaultBranch}.`,
        );
    }

    if (!args.remoteMetadata.isScriptureTextTranslation) {
        throw new Error(
            "Only scripture text-translation cloud projects can be attached right now.",
        );
    }

    const localLanguage = normalizeMetadataTag(args.project.language.code);
    const remoteLanguage = normalizeMetadataTag(
        args.remoteMetadata.languageTag,
    );
    if (!remoteLanguage) {
        throw new Error(
            `This cloud repository does not declare a language tag in ${args.remoteMetadata.metadataPath}.`,
        );
    }
    if (localLanguage !== remoteLanguage) {
        throw new Error(
            `This cloud repository is ${remoteLanguage}, but ${args.project.displayName} is ${localLanguage}.`,
        );
    }
}

function normalizeMetadataTag(value?: string | null): string {
    return value?.trim().toLowerCase() ?? "";
}
