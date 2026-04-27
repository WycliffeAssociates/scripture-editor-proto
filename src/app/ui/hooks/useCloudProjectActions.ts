import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import {
    attachRemoteProject,
    type CloudProjectsService,
    createRemoteProject,
    type RemoteSyncTarget,
    runRemoteSyncAction,
    type SyncActionMode,
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

    return { create, attach, isCreating, isAttaching };
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
