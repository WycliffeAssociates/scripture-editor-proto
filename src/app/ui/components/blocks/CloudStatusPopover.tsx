import { Combobox } from "@base-ui/react/combobox";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tooltip } from "@base-ui/react/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, ChevronRight, Info } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { Settings } from "@/app/data/settings.ts";
import type { SyncActionMode } from "@/app/domain/project/cloudProjectActions.ts";
import { getRemoteSyncActionMode } from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import {
    presentSharedProjectStatus,
    sharedProjectLabels,
} from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import { AttachResolveStatus } from "@/app/ui/components/blocks/SharedProjectAttach/AttachResolveStatus.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type { CloudStatusButtonState } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { CloudStatusButton } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import {
    useCloudProjectActions,
    useRemoteSyncAction,
} from "@/app/ui/hooks/useCloudProjectActions.ts";
import { useGiteaLogin } from "@/app/ui/hooks/useGiteaLogin.ts";
import { useNetworkStatus } from "@/app/ui/hooks/useNetworkStatus.ts";
import {
    type AttachResolveState,
    useSharedProjectPicker,
} from "@/app/ui/hooks/useSharedProjectPicker.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/CloudStatusPopover.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";

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
    /** The shared projects to choose from (yours by default; all when searching). */
    catalogRepos: ConsolidatedRepo[];
    catalogQuery: string;
    setCatalogQuery: (query: string) => void;
    isCatalogLoading: boolean;
    catalogErrorMessage: string | null;
    selectedRepo: ConsolidatedRepo | null;
    onSelectRepo: (repo: ConsolidatedRepo | null) => void;
    resolveState: AttachResolveState;
    /**
     * `owner/repo` when the search box holds a project link under the configured
     * host, else null. Lets the picker bypass the catalog and resolve the repo
     * directly — Git is the source of record, so a freshly-created project is
     * attachable here before it propagates into the catalog.
     */
    linkTargetLabel: string | null;
}

interface NetworkActions {
    isRunningCreate: boolean;
    isRunningAttach: boolean;
    isRunningSaveOwnCopy: boolean;
    handleCreateRemote: () => void;
    handleAttachRemote: () => void;
    handleSaveOwnCopy: () => void;
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

export function CloudStatusPopover(props: CloudPopoverProps) {
    const { t, i18n } = useLingui();
    const { remote, project, loadedProject } = useWorkspaceContext();
    const { authSessionProvider, projectsService, giteaHostBaseUrl } =
        useRouter().options.context;
    const { isOnline } = useNetworkStatus();
    const popupContainerRef = useRef<HTMLDivElement | null>(null);
    const [opened, setOpened] = useState(false);

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

    // Catalog browse + paste-a-link resolve, shared with the settings picker.
    const picker = useSharedProjectPicker({
        projectsService,
        giteaHostBaseUrl,
        sessionUsername,
        currentLanguageCode: loadedProject.language.code,
    });

    const normalizedStatus = remote.status;

    const syncActionMode = getRemoteSyncActionMode(
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
        !cloudActions.isSavingOwnCopy &&
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
        if (picker.resolveState !== "writable" || !picker.resolvedRepo) return;
        cloudActions.attach(picker.resolvedRepo);
    }

    function handleSaveOwnCopy() {
        if (!canRunNetworkActions) return;
        if (picker.resolveState !== "not-writable" || !picker.resolvedRepo) {
            return;
        }
        cloudActions.saveOwnCopy(picker.resolvedRepo);
    }

    const remoteCommitLabel = formatCommitTimestamp(
        normalizedStatus?.lastKnownRemoteHeadAuthoredAt,
    );
    const localCommitLabel = formatCommitTimestamp(
        normalizedStatus?.lastKnownLocalHeadAuthoredAt,
    );

    const statusPresentation = normalizedStatus
        ? presentSharedProjectStatus({
              status: normalizedStatus,
              isRefreshing: false,
              i18n,
          })
        : null;
    const statusCopy = statusPresentation
        ? {
              title: statusPresentation.headline,
              body: statusPresentation.detail,
          }
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
                                isRunningSaveOwnCopy={
                                    cloudActions.isSavingOwnCopy
                                }
                                handleCreateRemote={handleCreateRemote}
                                handleAttachRemote={handleAttachRemote}
                                handleSaveOwnCopy={handleSaveOwnCopy}
                                catalogRepos={picker.catalogRepos}
                                catalogQuery={picker.catalogQuery}
                                setCatalogQuery={picker.setCatalogQuery}
                                isCatalogLoading={picker.isCatalogLoading}
                                catalogErrorMessage={
                                    picker.isCatalogError
                                        ? (picker.catalogErrorMessage ??
                                          t`Couldn't load your projects`)
                                        : null
                                }
                                selectedRepo={picker.selectedRepo}
                                onSelectRepo={picker.setSelectedRepo}
                                resolveState={picker.resolveState}
                                linkTargetLabel={picker.linkTargetLabel}
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
                <Trans>Checking…</Trans>
            </h3>
            <p className={styles.body}>
                <Trans>
                    Checking the shared project for changes to send or receive.
                    This may take a moment. A window will appear to review
                    changes if needed.
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
                    <Trans>Shared project link</Trans>
                </span>
                <span>
                    {props.remote.projectInfo?.repoUrl ?? t`Not connected`}
                </span>
                <span className={styles.statusMetaLabel}>
                    <Trans>Last saved here</Trans>
                </span>
                <span className={styles.statusMetaTimestamp}>
                    {props.localCommitLabel}
                </span>
                <span className={styles.statusMetaLabel}>
                    <Trans>Last update in the shared project</Trans>
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
                    isRunningSaveOwnCopy={props.isRunningSaveOwnCopy}
                    handleCreateRemote={props.handleCreateRemote}
                    handleAttachRemote={props.handleAttachRemote}
                    handleSaveOwnCopy={props.handleSaveOwnCopy}
                    catalogRepos={props.catalogRepos}
                    catalogQuery={props.catalogQuery}
                    setCatalogQuery={props.setCatalogQuery}
                    isCatalogLoading={props.isCatalogLoading}
                    catalogErrorMessage={props.catalogErrorMessage}
                    selectedRepo={props.selectedRepo}
                    onSelectRepo={props.onSelectRepo}
                    resolveState={props.resolveState}
                    linkTargetLabel={props.linkTargetLabel}
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

function catalogRepoLabel(repo: ConsolidatedRepo) {
    return repo.title?.trim() ? repo.title : repo.repo_name;
}

function catalogRepoKey(repo: ConsolidatedRepo) {
    return `${repo.username}/${repo.repo_name}`;
}

function SignedInState(
    props: NetworkActions &
        RepoSelectionState & {
            sessionUsername: string | null;
            popupContainerRef: React.RefObject<HTMLDivElement | null>;
        },
) {
    const { t } = useLingui();
    const selectedKey = props.selectedRepo
        ? catalogRepoKey(props.selectedRepo)
        : null;
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
                        <Trans>Save as a new shared project</Trans>
                    )}
                </Button>
            </div>
            <div className={styles.fieldGroup}>
                <span className={styles.label}>
                    <Trans>Connect to a shared project</Trans>
                </span>
                <Combobox.Root<ConsolidatedRepo>
                    items={props.catalogRepos}
                    value={props.selectedRepo}
                    inputValue={props.catalogQuery}
                    onInputValueChange={props.setCatalogQuery}
                    onValueChange={(value) => props.onSelectRepo(value ?? null)}
                    itemToStringLabel={catalogRepoLabel}
                    itemToStringValue={catalogRepoKey}
                >
                    <Combobox.Trigger
                        className={styles.comboboxTrigger}
                        aria-label={t`Select a shared project`}
                    >
                        <span className={styles.comboboxValue}>
                            {props.selectedRepo
                                ? catalogRepoLabel(props.selectedRepo)
                                : t`Select a shared project`}
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
                                        aria-label={t`Search projects or paste a project link`}
                                        placeholder={t`Search or paste a project link`}
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
                                            {props.catalogRepos.map((repo) => (
                                                <Combobox.Item
                                                    key={catalogRepoKey(repo)}
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
                                                        {selectedKey ===
                                                        catalogRepoKey(repo) ? (
                                                            <Check size={14} />
                                                        ) : null}
                                                    </span>
                                                    <span>
                                                        {catalogRepoLabel(repo)}
                                                        <span
                                                            className={
                                                                styles.comboboxItemOwner
                                                            }
                                                        >
                                                            {" "}
                                                            · {repo.username}
                                                        </span>
                                                    </span>
                                                </Combobox.Item>
                                            ))}
                                        </Combobox.List>
                                        <Combobox.Empty
                                            className={styles.comboboxEmpty}
                                        >
                                            {/* Link-mode status + action live in
                                                the footer below, not here. */}
                                            {props.linkTargetLabel ? null : props.isCatalogLoading ? (
                                                <Trans>
                                                    Loading your projects…
                                                </Trans>
                                            ) : props.catalogErrorMessage ? (
                                                props.catalogErrorMessage
                                            ) : (
                                                <Trans>
                                                    No shared projects found.
                                                </Trans>
                                            )}
                                        </Combobox.Empty>
                                    </ScrollArea.Viewport>
                                    <ScrollArea.Scrollbar orientation="vertical">
                                        <ScrollArea.Thumb />
                                    </ScrollArea.Scrollbar>
                                </ScrollArea.Root>
                                {props.linkTargetLabel ? (
                                    <div className={styles.comboboxLinkFooter}>
                                        <AttachResolveStatus
                                            resolveState={props.resolveState}
                                            targetLabel={props.linkTargetLabel}
                                            canRunActions={
                                                props.canRunNetworkActions
                                            }
                                            isAttaching={props.isRunningAttach}
                                            isSavingOwnCopy={
                                                props.isRunningSaveOwnCopy
                                            }
                                            onConnect={props.handleAttachRemote}
                                            onSaveOwnCopy={
                                                props.handleSaveOwnCopy
                                            }
                                        />
                                    </div>
                                ) : null}
                            </Combobox.Popup>
                        </Combobox.Positioner>
                    </Combobox.Portal>
                </Combobox.Root>
                {props.linkTargetLabel ? null : (
                    <AttachResolveStatus
                        resolveState={props.resolveState}
                        targetLabel={
                            props.selectedRepo
                                ? catalogRepoKey(props.selectedRepo)
                                : null
                        }
                        canRunActions={props.canRunNetworkActions}
                        isAttaching={props.isRunningAttach}
                        isSavingOwnCopy={props.isRunningSaveOwnCopy}
                        onConnect={props.handleAttachRemote}
                        onSaveOwnCopy={props.handleSaveOwnCopy}
                    />
                )}
            </div>
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
    const { t, i18n } = useLingui();
    const [expanded, setExpanded] = useState(false);

    const rows: AutoSyncRow[] = [
        {
            key: "autoSyncOnOpen",
            title: i18n._(sharedProjectLabels.autoReceiveTitle),
            description: i18n._(sharedProjectLabels.autoReceiveDescription),
        },
        {
            key: "autoPushOnSave",
            title: i18n._(sharedProjectLabels.autoSendTitle),
            description: i18n._(sharedProjectLabels.autoSendDescription),
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
                <Trans>Send & receive settings</Trans>
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
