import { Combobox } from "@base-ui/react/combobox";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tooltip } from "@base-ui/react/tooltip";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, ChevronRight, Info } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Settings } from "@/app/data/settings.ts";
import {
    getSyncActionMode,
    type SyncActionMode,
    sortReposByOwnerPriority,
} from "@/app/domain/project/cloudProjectActions.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type { CloudStatusButtonState } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { CloudStatusButton } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import {
    useCloudProjectActions,
    useRemoteSyncAction,
} from "@/app/ui/hooks/useCloudProjectActions.ts";
import { useGiteaApi } from "@/app/ui/hooks/useGiteaApi.ts";
import { useGiteaLogin } from "@/app/ui/hooks/useGiteaLogin.ts";
import { useNetworkStatus } from "@/app/ui/hooks/useNetworkStatus.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/CloudStatusPopover.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_PROJECT_STATUS_SYNCING,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type CloudPopoverProps = {
    buttonState: CloudStatusButtonState;
    buttonLabel: string;
    buttonDescription: string;
    buttonAriaLabel: string;
};

interface LoginState {
    giteaHostBaseUrl: string | null;
    loginUsername: string;
    loginPassword: string;
    loginOtp: string;
    setLoginUsername: (value: string) => void;
    setLoginPassword: (value: string) => void;
    setLoginOtp: (value: string) => void;
    handleConnect: () => Promise<void>;
    isRunningConnect: boolean;
}

interface RepoSelectionState {
    displayedRepos: RemoteRepoSummary[];
    selectedRepo: RemoteRepoSummary | null;
    setSelectedRepo: (repo: RemoteRepoSummary | null) => void;
    gitea: ReturnType<typeof useGiteaApi>;
}

interface NetworkActions {
    isRunningCreate: boolean;
    isRunningAttach: boolean;
    handleCreateRemote: () => void;
    handleAttachRemote: () => void;
    canRunNetworkActions: boolean;
}

interface ConnectedStatusData {
    statusCopy: { title: string; body: string } | null;
    syncActionMode: SyncActionMode;
    handleRunSyncAction: () => void;
    remote: ReturnType<typeof useWorkspaceContext>["remote"];
    localCommitLabel: string;
    remoteCommitLabel: string;
    project: ReturnType<typeof useWorkspaceContext>["project"];
    statusIsReauth: boolean;
}

const unknownTimestampToken = "—";

// Locale-undefined falls back to navigator.language; intentional for now until
// the rest of the app threads i18n.locale through formatters.
const COMMIT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function formatCommitTimestamp(value: string | null | undefined) {
    if (!value) return unknownTimestampToken;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return unknownTimestampToken;
    return COMMIT_TIMESTAMP_FORMATTER.format(parsed);
}

function isReauthState(status: GitRemoteProjectStatus | null) {
    return status?.kind === GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED;
}

function normalizeCloudStatus(args: {
    status: GitRemoteProjectStatus | null;
    isRefreshing: boolean;
}): GitRemoteProjectStatus | null {
    const { status, isRefreshing } = args;
    if (!status) return null;
    if (status.kind !== GIT_REMOTE_PROJECT_STATUS_SYNCING || isRefreshing) {
        return status;
    }
    return {
        ...status,
        kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    };
}

const cloudStatusMessages = {
    connected: {
        title: msg`Project is in sync`,
        body: msg`Local and cloud are aligned.`,
    },
    remoteUpdatesAvailable: {
        title: msg`Updates available`,
        body: msg`You are connected, but there are remote changes for you to sync.`,
    },
    pendingPublish: {
        title: msg`Local changes ahead`,
        body: msg`You currently have work saved locally that is not saved remotely.`,
    },
    needsReview: {
        title: msg`Needs reconciliation`,
        body: msg`Your changes are saved, but they conflict with edits from the remote project. You can continue working and saving locally, but you can't save to the cloud until you review these edits.`,
    },
    reauthRequired: {
        title: msg`Reconnect your account`,
        body: msg`Cloud actions are paused until you sign in to this linked account again.`,
    },
    syncing: {
        title: msg`Syncing`,
        body: msg`Syncing with the cloud...`,
    },
    offline: {
        title: msg`Offline`,
        body: msg`You are currently offline, but your work is still being saved locally.`,
    },
};

function cloudStatusCopy(args: {
    status: GitRemoteProjectStatus;
    i18n: I18n;
}): {
    title: string;
    body: string;
} {
    const { status, i18n } = args;
    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return {
                title: i18n._(cloudStatusMessages.connected.title),
                body: i18n._(cloudStatusMessages.connected.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return {
                title: i18n._(cloudStatusMessages.remoteUpdatesAvailable.title),
                body: i18n._(cloudStatusMessages.remoteUpdatesAvailable.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return {
                title: i18n._(cloudStatusMessages.pendingPublish.title),
                body: i18n._(cloudStatusMessages.pendingPublish.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return {
                title: i18n._(cloudStatusMessages.needsReview.title),
                body: i18n._(cloudStatusMessages.needsReview.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return {
                title: i18n._(cloudStatusMessages.reauthRequired.title),
                body: i18n._(cloudStatusMessages.reauthRequired.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return {
                title: i18n._(cloudStatusMessages.syncing.title),
                body: i18n._(cloudStatusMessages.syncing.body),
            };
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return {
                title: i18n._(cloudStatusMessages.offline.title),
                body: i18n._(cloudStatusMessages.offline.body),
            };
    }
}

export function CloudStatusPopover(props: CloudPopoverProps) {
    const { i18n } = useLingui();
    const { remote, project, loadedProject } = useWorkspaceContext();
    const { authSessionProvider, projectsService, giteaHostBaseUrl } =
        useRouter().options.context;
    const { isOnline } = useNetworkStatus();
    const popupContainerRef = useRef<HTMLDivElement | null>(null);
    const [opened, setOpened] = useState(false);
    const [selectedRepo, setSelectedRepo] = useState<RemoteRepoSummary | null>(
        null,
    );

    const sessionQuery = useQuery({
        queryKey: ["giteaSession", "cloudPopover", loadedProject.projectPath],
        queryFn: async () => await authSessionProvider.getCurrentSession(),
    });
    const sessionUsername = sessionQuery.data?.username ?? null;

    const refreshSessionAndStatus = useCallback(async () => {
        await sessionQuery.refetch();
        await remote.syncNow();
    }, [sessionQuery, remote]);

    const cloudActions = useCloudProjectActions({
        projectsService,
        loadedProjectPath: loadedProject.projectPath,
        refresh: refreshSessionAndStatus,
    });
    const syncAction = useRemoteSyncAction({ remote });

    const {
        loginUsername,
        loginPassword,
        loginOtp,
        setLoginUsername,
        setLoginPassword,
        setLoginOtp,
        isRunningConnect,
        handleConnect,
    } = useGiteaLogin({
        authSessionProvider,
        giteaHostBaseUrl,
        onSuccess: () => refreshSessionAndStatus(),
    });

    const gitea = useGiteaApi({
        sessionUsername,
        projectsService: {
            listWritableRemoteRepos: projectsService.listWritableRemoteRepos,
            listOwnedRemoteRepos: projectsService.listOwnedRemoteRepos,
        },
    });

    const displayedRepos = useMemo(() => {
        const sortedRepos = sortReposByOwnerPriority(
            gitea.repos,
            sessionUsername,
        );
        if (!selectedRepo) return sortedRepos;
        if (sortedRepos.some((repo) => repo.id === selectedRepo.id)) {
            return sortedRepos;
        }
        return [selectedRepo, ...sortedRepos];
    }, [gitea.repos, selectedRepo, sessionUsername]);

    const normalizedStatus = normalizeCloudStatus({
        status: remote.status,
        isRefreshing: remote.isRefreshing,
    });

    const syncActionMode = getSyncActionMode(
        normalizedStatus,
        project.appSettings.autoAcceptIncomingWork,
    );
    const statusIsReauth = isReauthState(normalizedStatus);
    const canRunNetworkActions =
        isOnline &&
        !remote.isRefreshing &&
        !syncAction.isSyncing &&
        !cloudActions.isCreating &&
        !cloudActions.isAttaching &&
        !isRunningConnect;

    function handleRunSyncAction() {
        if (!canRunNetworkActions) return;
        syncAction.run(syncActionMode);
    }

    function handleCreateRemote() {
        if (!canRunNetworkActions) return;
        cloudActions.create();
    }

    function handleAttachRemote() {
        if (!canRunNetworkActions) return;
        cloudActions.attach(selectedRepo);
    }

    const remoteCommitLabel = formatCommitTimestamp(
        normalizedStatus?.lastKnownRemoteHeadAuthoredAt,
    );
    const localCommitLabel = formatCommitTimestamp(
        normalizedStatus?.lastKnownLocalHeadAuthoredAt,
    );

    const statusCopy = normalizedStatus
        ? cloudStatusCopy({
              status: normalizedStatus,
              i18n,
          })
        : null;

    return (
        <BasePopover.Root open={opened} onOpenChange={setOpened}>
            <BasePopover.Trigger
                render={
                    <CloudStatusButton
                        state={props.buttonState}
                        tooltipLabel={props.buttonLabel}
                        tooltipDescription={props.buttonDescription}
                        ariaLabel={props.buttonAriaLabel}
                    />
                }
            />
            <BasePopover.Portal>
                <BasePopover.Positioner
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    style={{ zIndex: zLayer.popoverPositioner }}
                >
                    <BasePopover.Popup className={styles.popover}>
                        <div ref={popupContainerRef} className={styles.section}>
                            <CloudStatusContent
                                isOnline={isOnline}
                                isSyncingAction={syncAction.isSyncing}
                                normalizedStatus={normalizedStatus}
                                statusCopy={statusCopy}
                                syncActionMode={syncActionMode}
                                canRunNetworkActions={canRunNetworkActions}
                                handleRunSyncAction={handleRunSyncAction}
                                remote={remote}
                                localCommitLabel={localCommitLabel}
                                remoteCommitLabel={remoteCommitLabel}
                                project={project}
                                statusIsReauth={statusIsReauth}
                                sessionUsername={sessionUsername}
                                giteaHostBaseUrl={giteaHostBaseUrl}
                                loginUsername={loginUsername}
                                loginPassword={loginPassword}
                                loginOtp={loginOtp}
                                setLoginUsername={setLoginUsername}
                                setLoginPassword={setLoginPassword}
                                setLoginOtp={setLoginOtp}
                                handleConnect={handleConnect}
                                isRunningConnect={isRunningConnect}
                                isRunningCreate={cloudActions.isCreating}
                                isRunningAttach={cloudActions.isAttaching}
                                handleCreateRemote={handleCreateRemote}
                                handleAttachRemote={handleAttachRemote}
                                displayedRepos={displayedRepos}
                                selectedRepo={selectedRepo}
                                setSelectedRepo={setSelectedRepo}
                                gitea={gitea}
                                popupContainerRef={popupContainerRef}
                            />
                        </div>
                    </BasePopover.Popup>
                </BasePopover.Positioner>
            </BasePopover.Portal>
        </BasePopover.Root>
    );
}

type CloudStatusProps = {
    isOnline: boolean;
    isSyncingAction: boolean;
    normalizedStatus: GitRemoteProjectStatus | null;
    sessionUsername: string | null;
    popupContainerRef: React.RefObject<HTMLDivElement | null>;
} & ConnectedStatusData &
    NetworkActions &
    LoginState &
    RepoSelectionState;

function CloudStatusContent(props: CloudStatusProps) {
    if (!props.isOnline) {
        return <OfflineState />;
    }

    if (props.isSyncingAction) {
        return <SyncingState />;
    }

    if (props.normalizedStatus) {
        return <ConnectedStatus {...props} />;
    }

    return <NotUploadedState {...props} />;
}

function OfflineState() {
    return (
        <>
            <h3 className={styles.heading}>
                <Trans>Offline</Trans>
            </h3>
            <p className={styles.body}>
                <Trans>
                    You are currently offline, but your work is still being
                    saved locally.
                </Trans>
            </p>
        </>
    );
}

function SyncingState() {
    return (
        <>
            <h3 className={styles.heading}>
                <Trans>Syncing</Trans>
            </h3>
            <p className={styles.body}>
                <Trans>
                    Syncing with the cloud. This may take a moment. A window
                    will appear to review changes if needed.
                </Trans>
            </p>
            <div className={styles.progressTrack}>
                <div className={styles.progressBar} />
            </div>
        </>
    );
}

function ConnectedStatus(
    props: ConnectedStatusData & { canRunNetworkActions: boolean } & LoginState,
) {
    const { t } = useLingui();
    return (
        <>
            <h3 className={styles.heading}>{props.statusCopy?.title}</h3>
            <p className={styles.body}>{props.statusCopy?.body}</p>
            <div className={styles.actionsRow}>
                {props.syncActionMode !== "none" ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => props.handleRunSyncAction()}
                        disabled={!props.canRunNetworkActions}
                    >
                        {props.syncActionMode === "review" ? (
                            <Trans>Review changes</Trans>
                        ) : (
                            <Trans>Sync now</Trans>
                        )}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => props.remote.syncNow()}
                        disabled={!props.canRunNetworkActions}
                    >
                        <Trans>Refresh status</Trans>
                    </Button>
                )}
            </div>
            <div className={styles.statusMeta}>
                <span className={styles.statusMetaLabel}>
                    <Trans>Remote</Trans>
                </span>
                <span>
                    {props.remote.projectInfo?.repoUrl ?? t`Not connected`}
                </span>
                <span className={styles.statusMetaLabel}>
                    <Trans>Last local commit</Trans>
                </span>
                <span className={styles.statusMetaTimestamp}>
                    {props.localCommitLabel}
                </span>
                <span className={styles.statusMetaLabel}>
                    <Trans>Last remote commit</Trans>
                </span>
                <span className={styles.statusMetaTimestamp}>
                    {props.remoteCommitLabel}
                </span>
            </div>
            <AutoSyncSettings
                settings={props.project.appSettings}
                onChange={(updates) => props.project.updateAppSettings(updates)}
            />
            {props.statusIsReauth ? (
                <LoginForm
                    hostBaseUrl={props.giteaHostBaseUrl}
                    loginUsername={props.loginUsername}
                    loginPassword={props.loginPassword}
                    loginOtp={props.loginOtp}
                    setLoginUsername={props.setLoginUsername}
                    setLoginPassword={props.setLoginPassword}
                    setLoginOtp={props.setLoginOtp}
                    onConnect={props.handleConnect}
                    isRunningConnect={props.isRunningConnect}
                />
            ) : null}
        </>
    );
}

function NotUploadedState(
    props: {
        sessionUsername: string | null;
        popupContainerRef: React.RefObject<HTMLDivElement | null>;
    } & NetworkActions &
        LoginState &
        RepoSelectionState,
) {
    return (
        <>
            <h3 className={styles.heading}>
                <Trans>Your Project Isn't Uploaded</Trans>
            </h3>
            <p className={styles.body}>
                <Trans>
                    You are currently not saving work to the cloud, but your
                    project is still being saved locally. Uploading keeps your
                    work safe if something happens to your device and lets
                    others collaborate with you.
                </Trans>
            </p>
            {props.sessionUsername ? (
                <SignedInState
                    isRunningCreate={props.isRunningCreate}
                    isRunningAttach={props.isRunningAttach}
                    handleCreateRemote={props.handleCreateRemote}
                    handleAttachRemote={props.handleAttachRemote}
                    displayedRepos={props.displayedRepos}
                    selectedRepo={props.selectedRepo}
                    setSelectedRepo={props.setSelectedRepo}
                    gitea={props.gitea}
                    canRunNetworkActions={props.canRunNetworkActions}
                    sessionUsername={props.sessionUsername}
                    popupContainerRef={props.popupContainerRef}
                />
            ) : (
                <LoginForm
                    hostBaseUrl={props.giteaHostBaseUrl}
                    loginUsername={props.loginUsername}
                    loginPassword={props.loginPassword}
                    loginOtp={props.loginOtp}
                    setLoginUsername={props.setLoginUsername}
                    setLoginPassword={props.setLoginPassword}
                    setLoginOtp={props.setLoginOtp}
                    onConnect={props.handleConnect}
                    isRunningConnect={props.isRunningConnect}
                />
            )}
        </>
    );
}

function SignedInState(
    props: NetworkActions &
        RepoSelectionState & {
            sessionUsername: string | null;
            popupContainerRef: React.RefObject<HTMLDivElement | null>;
        },
) {
    const { t } = useLingui();
    return (
        <>
            <p className={styles.signedIn}>
                <Trans>Signed in as {props.sessionUsername}.</Trans>
            </p>
            <div className={styles.actionsRow}>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => props.handleCreateRemote()}
                    disabled={!props.canRunNetworkActions}
                >
                    {props.isRunningCreate ? (
                        <Trans>Creating...</Trans>
                    ) : (
                        <Trans>Save as new cloud project</Trans>
                    )}
                </Button>
            </div>
            <div className={styles.fieldGroup}>
                <span className={styles.label}>
                    <Trans>Attach existing cloud project</Trans>
                </span>
                <Combobox.Root<RemoteRepoSummary>
                    items={props.displayedRepos}
                    value={props.selectedRepo}
                    inputValue={props.gitea.query}
                    onInputValueChange={props.gitea.setQuery}
                    onValueChange={(value) =>
                        props.setSelectedRepo(value ?? null)
                    }
                    itemToStringLabel={(item) => item.fullName}
                    itemToStringValue={(item) => item.fullName}
                >
                    <Combobox.Trigger
                        className={styles.comboboxTrigger}
                        aria-label={t`Select cloud project`}
                    >
                        <span className={styles.comboboxValue}>
                            {props.selectedRepo?.fullName ??
                                t`Select cloud project`}
                        </span>
                        <span
                            className={styles.comboboxChevron}
                            aria-hidden="true"
                        >
                            ⌄
                        </span>
                    </Combobox.Trigger>
                    <Combobox.Portal container={props.popupContainerRef}>
                        <Combobox.Positioner sideOffset={8} align="start">
                            <Combobox.Popup className={styles.comboboxPopup}>
                                <div className={styles.comboboxHeader}>
                                    <Combobox.Input
                                        className={styles.comboboxInput}
                                        aria-label={t`Search cloud projects`}
                                        placeholder={t`Search cloud projects`}
                                        autoFocus
                                    />
                                </div>
                                <ScrollArea.Root
                                    className={styles.comboboxScrollArea}
                                >
                                    <ScrollArea.Viewport
                                        className={
                                            styles.comboboxScrollViewport
                                        }
                                    >
                                        <Combobox.List
                                            className={styles.comboboxList}
                                        >
                                            {props.displayedRepos.map(
                                                (repo) => (
                                                    <Combobox.Item
                                                        key={repo.id}
                                                        value={repo}
                                                        className={
                                                            styles.comboboxItem
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.comboboxItemIndicator
                                                            }
                                                            aria-hidden="true"
                                                        >
                                                            {props.selectedRepo
                                                                ?.id ===
                                                            repo.id ? (
                                                                <Check
                                                                    size={14}
                                                                />
                                                            ) : null}
                                                        </span>
                                                        <span>
                                                            {repo.fullName}
                                                        </span>
                                                    </Combobox.Item>
                                                ),
                                            )}
                                        </Combobox.List>
                                        <Combobox.Empty
                                            className={styles.comboboxEmpty}
                                        >
                                            <Trans>
                                                No cloud projects found.
                                            </Trans>
                                        </Combobox.Empty>
                                    </ScrollArea.Viewport>
                                    <ScrollArea.Scrollbar orientation="vertical">
                                        <ScrollArea.Thumb />
                                    </ScrollArea.Scrollbar>
                                </ScrollArea.Root>
                            </Combobox.Popup>
                        </Combobox.Positioner>
                    </Combobox.Portal>
                </Combobox.Root>
            </div>
            <div className={styles.inlineGrid}>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => props.gitea.refresh()}
                    disabled={!props.canRunNetworkActions}
                >
                    {props.gitea.isLoading ? (
                        <Trans>Refreshing...</Trans>
                    ) : (
                        <Trans>Refresh</Trans>
                    )}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => props.handleAttachRemote()}
                    disabled={
                        !props.canRunNetworkActions || !props.selectedRepo
                    }
                >
                    {props.isRunningAttach ? (
                        <Trans>Attaching...</Trans>
                    ) : (
                        <Trans>Attach</Trans>
                    )}
                </Button>
            </div>
            {props.gitea.hasAdditionalReposAvailable ? (
                <p className={styles.helper}>
                    <Trans>
                        Showing {props.gitea.visiblePageSize} projects to start.
                        Search to find additional repositories.
                    </Trans>
                </p>
            ) : null}
        </>
    );
}

function LoginForm(args: {
    hostBaseUrl: string | null;
    loginUsername: string;
    loginPassword: string;
    loginOtp: string;
    setLoginUsername: (value: string) => void;
    setLoginPassword: (value: string) => void;
    setLoginOtp: (value: string) => void;
    onConnect: () => Promise<void>;
    isRunningConnect: boolean;
}) {
    return (
        <div className={styles.section}>
            <p className={styles.body}>
                {args.hostBaseUrl ? (
                    <Trans>
                        Connect to {args.hostBaseUrl} to browse remote projects.
                    </Trans>
                ) : (
                    <Trans>
                        Cloud login is not configured for this build yet.
                    </Trans>
                )}
            </p>
            {args.hostBaseUrl ? (
                <>
                    <label className={styles.fieldGroup}>
                        <span className={styles.label}>
                            <Trans>Username</Trans>
                        </span>
                        <input
                            type="text"
                            value={args.loginUsername}
                            onChange={(event) =>
                                args.setLoginUsername(event.currentTarget.value)
                            }
                            className={styles.input}
                        />
                    </label>
                    <label className={styles.fieldGroup}>
                        <span className={styles.label}>
                            <Trans>Password</Trans>
                        </span>
                        <input
                            type="password"
                            value={args.loginPassword}
                            onChange={(event) =>
                                args.setLoginPassword(event.currentTarget.value)
                            }
                            className={styles.input}
                        />
                    </label>
                    <label className={styles.fieldGroup}>
                        <span className={styles.label}>
                            <Trans>One-time code</Trans>
                        </span>
                        <input
                            type="text"
                            value={args.loginOtp}
                            onChange={(event) =>
                                args.setLoginOtp(event.currentTarget.value)
                            }
                            className={styles.input}
                        />
                    </label>
                    <div className={styles.actionsRow}>
                        <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() => args.onConnect()}
                            disabled={args.isRunningConnect}
                        >
                            {args.isRunningConnect ? (
                                <Trans>Connecting...</Trans>
                            ) : (
                                <Trans>Connect account</Trans>
                            )}
                        </Button>
                    </div>
                </>
            ) : null}
        </div>
    );
}

type SettingsBooleanKey = {
    [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

type AutoSyncRow = {
    key: SettingsBooleanKey;
    title: string;
    description: string;
};

function AutoSyncSettings(props: {
    settings: Settings;
    onChange: (updates: Partial<Settings>) => void;
}) {
    const { t } = useLingui();
    const [expanded, setExpanded] = useState(false);

    const rows: AutoSyncRow[] = [
        {
            key: "autoSyncOnOpen",
            title: t`Auto Sync on Open`,
            description: t`Check for cloud updates automatically when opening a linked project.`,
        },
        {
            key: "autoPushOnSave",
            title: t`Auto Publish on Save`,
            description: t`Publish local saves automatically for linked cloud projects.`,
        },
        {
            key: "autoAcceptOwnWorkOnSave",
            title: t`Auto Accept My Work on Save`,
            description: t`Skip review for your own local edits and commit them directly when you save.`,
        },
        {
            key: "autoAcceptIncomingWork",
            title: t`Auto Accept Incoming Work`,
            description: t`Accept incoming cloud changes automatically unless the same verse already has unresolved local edits.`,
        },
    ];

    return (
        <div>
            <button
                type="button"
                className={styles.settingsDisclosureButton}
                aria-expanded={expanded}
                onClick={() => setExpanded((prev) => !prev)}
            >
                <span
                    className={`${styles.settingsDisclosureChevron} ${
                        expanded ? styles.settingsDisclosureChevronOpen : ""
                    }`}
                    aria-hidden="true"
                >
                    <ChevronRight size={12} />
                </span>
                <Trans>Auto-sync settings</Trans>
            </button>
            {expanded ? (
                <div className={styles.settingsList}>
                    {rows.map((row) => (
                        <div key={row.key} className={styles.settingRow}>
                            <span className={styles.settingRowLabelGroup}>
                                <span className={styles.settingRowTitle}>
                                    {row.title}
                                </span>
                                <Tooltip.Root>
                                    <Tooltip.Trigger
                                        render={
                                            <button
                                                type="button"
                                                className={
                                                    styles.infoIconButton
                                                }
                                                aria-label={row.description}
                                            >
                                                <Info
                                                    size={14}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        }
                                    />
                                    <Tooltip.Portal>
                                        <Tooltip.Positioner
                                            side="top"
                                            align="center"
                                            sideOffset={6}
                                            style={{
                                                zIndex: zLayer.cloudTooltipPositioner,
                                            }}
                                        >
                                            <Tooltip.Popup
                                                className={styles.tooltipPopup}
                                            >
                                                {row.description}
                                            </Tooltip.Popup>
                                        </Tooltip.Positioner>
                                    </Tooltip.Portal>
                                </Tooltip.Root>
                            </span>
                            <Switch
                                checked={props.settings[row.key]}
                                onCheckedChange={(checked) =>
                                    props.onChange({ [row.key]: checked })
                                }
                            />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
