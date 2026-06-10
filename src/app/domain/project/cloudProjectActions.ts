import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RemoteSyncActionMode } from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import {
    showErrorNotification,
    showNotificationSuccess,
} from "@/app/ui/components/primitives/notifications.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

const messages = {
    createSuccessTitle: msg`Shared project created`,
    createSuccessBody: msg`Your project is now saved as a shared project.`,
    createFailureTitle: msg`Couldn't create the shared project`,
    createDuplicateName: msg`You already have a shared project with this name. Connect to it instead.`,
    attachSuccessTitle: msg`Connected to shared project`,
    attachSuccessBody: msg`Your project is now connected to the shared project you chose.`,
    attachFailureTitle: msg`Couldn't connect to the shared project`,
    saveOwnCopySuccessTitle: msg`Your own copy is saved online`,
    saveOwnCopySuccessBody: msg`We made your own online copy and connected this project to it.`,
    saveOwnCopyFailureTitle: msg`Couldn't save your own copy online`,
    fallbackError: msg`Please try again.`,
};

export type CloudProjectsService = {
    createRemoteForProject: (projectRef: string) => Promise<unknown>;
    attachProjectToRemote: (args: {
        projectRef: string;
        repo: Pick<
            RemoteRepoSummary,
            "id" | "owner" | "name" | "htmlUrl" | "cloneUrl" | "defaultBranch"
        >;
    }) => Promise<unknown>;
    forkRemoteRepo: (args: {
        owner: string;
        name: string;
        signal?: AbortSignal;
    }) => Promise<RemoteRepoSummary>;
};

export type RemoteSyncTarget = {
    syncNow: () => Promise<void>;
    reviewIncoming: () => Promise<void>;
};

export type SyncActionMode = RemoteSyncActionMode;

function errorMessage(error: unknown, i18n: I18n): string {
    if (error instanceof Error) return error.message;
    return i18n._(messages.fallbackError);
}

export async function createRemoteProject(args: {
    projectsService: Pick<CloudProjectsService, "createRemoteForProject">;
    loadedProjectPath: string;
    refresh: () => Promise<void>;
    i18n: I18n;
}): Promise<{ ok: true } | { ok: false }> {
    const { projectsService, loadedProjectPath, refresh, i18n } = args;
    try {
        await projectsService.createRemoteForProject(loadedProjectPath);
        await refresh();
        showNotificationSuccess({
            notification: {
                title: i18n._(messages.createSuccessTitle),
                message: i18n._(messages.createSuccessBody),
            },
        });
        return { ok: true };
    } catch (error) {
        const message = errorMessage(error, i18n);
        const isDuplicateName = /already exists/i.test(message);
        showErrorNotification({
            notification: {
                title: i18n._(messages.createFailureTitle),
                message: isDuplicateName
                    ? i18n._(messages.createDuplicateName)
                    : message,
            },
        });
        return { ok: false };
    }
}

export async function attachRemoteProject(args: {
    projectsService: Pick<CloudProjectsService, "attachProjectToRemote">;
    loadedProjectPath: string;
    repo: RemoteRepoSummary;
    refresh: () => Promise<void>;
    i18n: I18n;
}): Promise<{ ok: true } | { ok: false }> {
    const { projectsService, loadedProjectPath, repo, refresh, i18n } = args;
    try {
        await projectsService.attachProjectToRemote({
            projectRef: loadedProjectPath,
            repo: {
                id: repo.id,
                owner: repo.owner,
                name: repo.name,
                htmlUrl: repo.htmlUrl,
                cloneUrl: repo.cloneUrl,
                defaultBranch: repo.defaultBranch,
            },
        });
        await refresh();
        showNotificationSuccess({
            notification: {
                title: i18n._(messages.attachSuccessTitle),
                message: i18n._(messages.attachSuccessBody),
            },
        });
        return { ok: true };
    } catch (error) {
        showErrorNotification({
            notification: {
                title: i18n._(messages.attachFailureTitle),
                message: errorMessage(error, i18n),
            },
        });
        return { ok: false };
    }
}

/**
 * Resolve a "I can't write to this shared project" dead-end: fork it into the
 * user's own account (preserving provenance + the shared git base), tag the
 * fork `consolidated`, then connect the local project to the fork. Because the
 * fork shares history with the upstream the user derived from, the connection
 * and later sync work cleanly — unlike creating a brand-new orphan remote.
 */
export async function saveOwnCopyOnline(args: {
    projectsService: Pick<
        CloudProjectsService,
        "forkRemoteRepo" | "attachProjectToRemote"
    >;
    loadedProjectPath: string;
    repo: Pick<RemoteRepoSummary, "owner" | "name">;
    refresh: () => Promise<void>;
    i18n: I18n;
}): Promise<{ ok: true } | { ok: false }> {
    const { projectsService, loadedProjectPath, repo, refresh, i18n } = args;
    try {
        const fork = await projectsService.forkRemoteRepo({
            owner: repo.owner,
            name: repo.name,
        });
        await projectsService.attachProjectToRemote({
            projectRef: loadedProjectPath,
            repo: {
                id: fork.id,
                owner: fork.owner,
                name: fork.name,
                htmlUrl: fork.htmlUrl,
                cloneUrl: fork.cloneUrl,
                defaultBranch: fork.defaultBranch,
            },
        });
        await refresh();
        showNotificationSuccess({
            notification: {
                title: i18n._(messages.saveOwnCopySuccessTitle),
                message: i18n._(messages.saveOwnCopySuccessBody),
            },
        });
        return { ok: true };
    } catch (error) {
        showErrorNotification({
            notification: {
                title: i18n._(messages.saveOwnCopyFailureTitle),
                message: errorMessage(error, i18n),
            },
        });
        return { ok: false };
    }
}

export async function runRemoteSyncAction(args: {
    remote: RemoteSyncTarget;
    mode: SyncActionMode;
}): Promise<void> {
    const { remote, mode } = args;
    if (mode === "none") return;
    if (mode === "review") {
        await remote.reviewIncoming();
        return;
    }
    await remote.syncNow();
}

export function sortReposByOwnerPriority(
    repos: RemoteRepoSummary[],
    username: string | null,
): RemoteRepoSummary[] {
    const normalized = username?.toLowerCase() ?? "";
    if (!normalized) return repos;
    return repos.toSorted((a, b) => {
        const aMine = a.owner.toLowerCase() === normalized;
        const bMine = b.owner.toLowerCase() === normalized;
        if (aMine !== bMine) return aMine ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
    });
}
