import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RemoteSyncActionMode } from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import {
    showErrorNotification,
    showNotificationSuccess,
} from "@/app/ui/components/primitives/notifications.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

const messages = {
    createSuccessTitle: msg`Cloud project created`,
    createSuccessBody: msg`This project is now linked and published to cloud.`,
    createFailureTitle: msg`Failed to create remote project`,
    createDuplicateName: msg`A cloud project with this name already exists in your account. Attach the existing cloud project instead.`,
    attachSuccessTitle: msg`Cloud project attached`,
    attachSuccessBody: msg`This project is now linked to the selected cloud repository.`,
    attachFailureTitle: msg`Failed to attach cloud project`,
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
