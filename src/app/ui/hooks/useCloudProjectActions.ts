import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import {
    attachRemoteProject,
    type CloudProjectsService,
    createRemoteProject,
    type RemoteSyncTarget,
    runRemoteSyncAction,
    type SyncActionMode,
    saveOwnCopyOnline,
} from "@/app/domain/project/cloudProjectActions.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

export function useCloudProjectActions(args: {
    projectsService: CloudProjectsService;
    loadedProjectPath: string;
    refresh: () => Promise<void>;
}) {
    const { projectsService, loadedProjectPath, refresh } = args;
    const { i18n } = useLingui();
    const [isCreating, setIsCreating] = useState(false);
    const [isAttaching, setIsAttaching] = useState(false);
    const [isSavingOwnCopy, setIsSavingOwnCopy] = useState(false);

    async function create() {
        setIsCreating(true);
        try {
            await createRemoteProject({
                projectsService,
                loadedProjectPath,
                refresh,
                i18n,
            });
        } finally {
            setIsCreating(false);
        }
    }

    async function attach(repo: RemoteRepoSummary | null) {
        if (!repo) return;
        setIsAttaching(true);
        try {
            await attachRemoteProject({
                projectsService,
                loadedProjectPath,
                repo,
                refresh,
                i18n,
            });
        } finally {
            setIsAttaching(false);
        }
    }

    async function saveOwnCopy(repo: { owner: string; name: string } | null) {
        if (!repo) return;
        setIsSavingOwnCopy(true);
        try {
            await saveOwnCopyOnline({
                projectsService,
                loadedProjectPath,
                repo,
                refresh,
                i18n,
            });
        } finally {
            setIsSavingOwnCopy(false);
        }
    }

    return {
        create,
        attach,
        saveOwnCopy,
        isCreating,
        isAttaching,
        isSavingOwnCopy,
    };
}

export function useRemoteSyncAction(args: { remote: RemoteSyncTarget }) {
    const { remote } = args;
    const [isSyncing, setIsSyncing] = useState(false);

    async function run(mode: SyncActionMode) {
        if (mode === "none") return;
        setIsSyncing(true);
        try {
            await runRemoteSyncAction({ remote, mode });
        } finally {
            setIsSyncing(false);
        }
    }

    return { run, isSyncing };
}
