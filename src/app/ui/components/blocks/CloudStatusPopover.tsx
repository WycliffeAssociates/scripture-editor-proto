import { Combobox } from "@base-ui/react/combobox";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tooltip } from "@base-ui/react/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Info } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { Settings } from "@/app/data/settings.ts";
import type { SyncActionMode } from "@/app/domain/project/cloudProjectActions.ts";
import { getRemoteSyncActionMode } from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import {
  presentSharedProjectStatus,
  sharedProjectLabels,
} from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import {
  CloudActionError,
  CloudDualClocks,
  CloudLogoutButton,
  CloudProjectDetails,
  CloudReviewBanner,
  CloudSignInForm,
  CloudSyncHeader,
  type CloudSyncTone,
} from "@/app/ui/components/blocks/CloudSyncPanels.tsx";
import { AttachResolveStatus } from "@/app/ui/components/blocks/SharedProjectAttach/AttachResolveStatus.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import type { CloudStatusButtonState } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { CloudStatusButton } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
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
  GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
  GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
  GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
  type GitRemoteProjectStatus,
  type GitRemoteProjectStatusKind,
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
  loginError: string | null;
  createAccountUrl: string | null;
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
  actionError: { title: string; message: string } | null;
}

interface ConnectedStatusData {
  statusCopy: { title: string; body: string } | null;
  syncActionMode: SyncActionMode;
  handleRunSyncAction: () => void;
  handleLogout: () => void;
  remote: ReturnType<typeof useWorkspaceContext>["remote"];
  localCommitLabel: string;
  remoteCommitLabel: string;
  project: ReturnType<typeof useWorkspaceContext>["project"];
  statusIsReauth: boolean;
}

const unknownTimestampToken = "—";

// Locale-undefined falls back to navigator.language; intentional for now until
// the rest of the app threads i18n.locale through formatters.
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

/** Absolute timestamp → "3 minutes ago" / "2 hours ago" for the version clocks. */
function formatRelativeTimestamp(value: string | null | undefined): string {
  if (!value) return unknownTimestampToken;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return unknownTimestampToken;
  const diffSec = Math.round((parsed.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE_TIME_FORMATTER.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) {
    return RELATIVE_TIME_FORMATTER.format(diffMin, "minute");
  }
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) {
    return RELATIVE_TIME_FORMATTER.format(diffHr, "hour");
  }
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffHr / 24), "day");
}

/** Which status icon the connected panel shows. */
function toneForStatusKind(
  kind: GitRemoteProjectStatusKind | undefined,
): CloudSyncTone {
  switch (kind) {
    case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
      return "incoming";
    case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
    case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
      return "warn";
    default:
      return "ok";
  }
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
    loginError,
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

  const handleLogout = useCallback(async () => {
    await authSessionProvider.logoutCurrentSession();
    await refreshSessionAndStatus();
  }, [authSessionProvider, refreshSessionAndStatus]);

  const createAccountUrl = giteaHostBaseUrl
    ? `${giteaHostBaseUrl.replace(/\/$/, "")}/user/sign_up`
    : null;

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

  const remoteCommitLabel = formatRelativeTimestamp(
    normalizedStatus?.lastKnownRemoteHeadAuthoredAt,
  );
  const localCommitLabel = formatRelativeTimestamp(
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
      <IconTooltip label={props.buttonAriaLabel}>
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
      </IconTooltip>
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
                handleLogout={handleLogout}
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
                loginError={loginError}
                createAccountUrl={createAccountUrl}
                setLoginUsername={setLoginUsername}
                setLoginPassword={setLoginPassword}
                setLoginOtp={setLoginOtp}
                handleConnect={handleConnect}
                isRunningConnect={isRunningConnect}
                isRunningCreate={cloudActions.isCreating}
                isRunningAttach={cloudActions.isAttaching}
                isRunningSaveOwnCopy={cloudActions.isSavingOwnCopy}
                handleCreateRemote={handleCreateRemote}
                handleAttachRemote={handleAttachRemote}
                handleSaveOwnCopy={handleSaveOwnCopy}
                actionError={cloudActions.actionError}
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
          You are currently offline, but your work is still being saved locally.
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
          Checking the shared project for changes to send or receive. This may
          take a moment. A window will appear to review changes if needed.
        </Trans>
      </p>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} />
      </div>
    </>
  );
}

function ConnectedStatus(
  props: ConnectedStatusData & {
    canRunNetworkActions: boolean;
    normalizedStatus: GitRemoteProjectStatus | null;
    sessionUsername: string | null;
  } & LoginState,
) {
  const status = props.normalizedStatus;
  const tone = toneForStatusKind(status?.kind);
  const isNeedsReview = status?.kind === GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW;
  const isReviewAction = props.syncActionMode === "review";

  // Token expired: header + an inline re-login form, nothing else actionable.
  if (props.statusIsReauth) {
    return (
      <>
        <CloudSyncHeader tone="warn" subtitle={props.statusCopy?.body} />
        <CloudSignInForm
          embedded
          hostConfigured={Boolean(props.giteaHostBaseUrl)}
          username={props.loginUsername}
          password={props.loginPassword}
          onUsernameChange={props.setLoginUsername}
          onPasswordChange={props.setLoginPassword}
          onSubmit={() => void props.handleConnect()}
          isSubmitting={props.isRunningConnect}
          errorMessage={props.loginError}
          createAccountUrl={props.createAccountUrl}
        />
      </>
    );
  }

  return (
    <>
      <CloudSyncHeader tone={tone} subtitle={props.statusCopy?.body} />
      {isNeedsReview ? (
        // Surfaced affordance into the review flow. A count would go in
        // the detail once we expose one at popover-render time.
        <CloudReviewBanner
          detail={<Trans>Review changes before sending your work.</Trans>}
          onClick={props.handleRunSyncAction}
        />
      ) : null}
      <CloudDualClocks
        localTime={props.localCommitLabel}
        sharedTime={props.remoteCommitLabel}
        sharedAuthor={status?.latestIncomingAuthorName}
      />
      {isNeedsReview ? null : (
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={
            props.syncActionMode === "none"
              ? () => props.remote.syncNow()
              : () => props.handleRunSyncAction()
          }
          disabled={!props.canRunNetworkActions}
          style={{ width: "100%" }}
        >
          {isReviewAction ? (
            <Trans>Review changes</Trans>
          ) : (
            <Trans>Sync now</Trans>
          )}
        </Button>
      )}
      <CloudProjectDetails repoUrl={props.remote.projectInfo?.repoUrl ?? null}>
        <AutoSyncSettingRows
          settings={props.project.appSettings}
          onChange={(updates) => props.project.updateAppSettings(updates)}
        />
      </CloudProjectDetails>
      <CloudLogoutButton
        onLogout={props.handleLogout}
        username={props.sessionUsername}
      />
    </>
  );
}

function NotUploadedState(
  props: {
    sessionUsername: string | null;
    popupContainerRef: React.RefObject<HTMLDivElement | null>;
    handleLogout: () => void;
  } & NetworkActions &
    LoginState &
    RepoSelectionState,
) {
  // Signed out → the sign-in form is the whole panel (it owns its header).
  // Signed in → the project-sync framed picker.
  return props.sessionUsername ? (
    <SignedInState
      isRunningCreate={props.isRunningCreate}
      isRunningAttach={props.isRunningAttach}
      isRunningSaveOwnCopy={props.isRunningSaveOwnCopy}
      handleCreateRemote={props.handleCreateRemote}
      handleAttachRemote={props.handleAttachRemote}
      handleSaveOwnCopy={props.handleSaveOwnCopy}
      handleLogout={props.handleLogout}
      actionError={props.actionError}
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
    <CloudSignInForm
      hostConfigured={Boolean(props.giteaHostBaseUrl)}
      username={props.loginUsername}
      password={props.loginPassword}
      onUsernameChange={props.setLoginUsername}
      onPasswordChange={props.setLoginPassword}
      onSubmit={() => void props.handleConnect()}
      isSubmitting={props.isRunningConnect}
      errorMessage={props.loginError}
      createAccountUrl={props.createAccountUrl}
    />
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
      handleLogout: () => void;
    },
) {
  const { t } = useLingui();
  const selectedKey = props.selectedRepo
    ? catalogRepoKey(props.selectedRepo)
    : null;
  return (
    <>
      <CloudSyncHeader
        tone="neutral"
        subtitle={
          <Trans>
            Your project is saved on this device. Save it online to back it up
            and collaborate with others.
          </Trans>
        }
      />
      {/* Section 2: connect to a shared project — label + dropdown + the
			    resolve verdict, grouped tightly; the popover gap separates it
			    from the header above and the actions below. */}
      <div className={styles.section}>
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
              <span className={styles.comboboxChevron} aria-hidden="true">
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
                  <ScrollArea.Root className={styles.comboboxScrollArea}>
                    <ScrollArea.Viewport
                      className={styles.comboboxScrollViewport}
                    >
                      <Combobox.List className={styles.comboboxList}>
                        {props.catalogRepos.map((repo) => (
                          <Combobox.Item
                            key={catalogRepoKey(repo)}
                            value={repo}
                            className={styles.comboboxItem}
                          >
                            <span
                              className={styles.comboboxItemIndicator}
                              aria-hidden="true"
                            >
                              {selectedKey === catalogRepoKey(repo) ? (
                                <Check size={14} />
                              ) : null}
                            </span>
                            <span>
                              {catalogRepoLabel(repo)}
                              <span className={styles.comboboxItemOwner}>
                                {" "}
                                · {repo.username}
                              </span>
                            </span>
                          </Combobox.Item>
                        ))}
                      </Combobox.List>
                      <Combobox.Empty className={styles.comboboxEmpty}>
                        {/* Link-mode status + action live in
                                                the footer below, not here. */}
                        {props.linkTargetLabel ? null : props.isCatalogLoading ? (
                          <Trans>Loading your projects…</Trans>
                        ) : props.catalogErrorMessage ? (
                          props.catalogErrorMessage
                        ) : (
                          <Trans>No shared projects found.</Trans>
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
                        canRunActions={props.canRunNetworkActions}
                        isAttaching={props.isRunningAttach}
                        isSavingOwnCopy={props.isRunningSaveOwnCopy}
                        onConnect={props.handleAttachRemote}
                        onSaveOwnCopy={props.handleSaveOwnCopy}
                      />
                    </div>
                  ) : null}
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
        </div>
        {props.linkTargetLabel ? null : (
          <AttachResolveStatus
            resolveState={props.resolveState}
            targetLabel={
              props.selectedRepo ? catalogRepoKey(props.selectedRepo) : null
            }
            canRunActions={props.canRunNetworkActions}
            isAttaching={props.isRunningAttach}
            isSavingOwnCopy={props.isRunningSaveOwnCopy}
            onConnect={props.handleAttachRemote}
            onSaveOwnCopy={props.handleSaveOwnCopy}
          />
        )}
      </div>
      {/* Section 3: actions. The contextual Connect lives in the resolve
			    verdict above; this is the always-available "make a new one" path. */}
      <div className={styles.section}>
        {props.actionError ? (
          <CloudActionError
            title={props.actionError.title}
            message={props.actionError.message}
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => props.handleCreateRemote()}
          disabled={!props.canRunNetworkActions}
          style={{ width: "100%" }}
        >
          {props.isRunningCreate ? (
            <Trans>Creating...</Trans>
          ) : (
            <Trans>Save as a new shared project</Trans>
          )}
        </Button>
      </div>
      <CloudLogoutButton
        onLogout={props.handleLogout}
        username={props.sessionUsername}
      />
    </>
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

/**
 * The four send & receive toggle rows. Renders just the rows (no disclosure) —
 * the surrounding "Send & receive settings" label + container come from
 * CloudProjectDetails, which hosts this as its bottom subsection.
 */
function AutoSyncSettingRows(props: {
  settings: Settings;
  onChange: (updates: Partial<Settings>) => void;
}) {
  const { i18n } = useLingui();

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
      title: i18n._(sharedProjectLabels.autoAcceptOwnTitle),
      description: i18n._(sharedProjectLabels.autoAcceptOwnDescription),
    },
    {
      key: "autoAcceptIncomingWork",
      title: i18n._(sharedProjectLabels.autoAcceptIncomingTitle),
      description: i18n._(sharedProjectLabels.autoAcceptIncomingDescription),
    },
  ];

  return (
    <div className={styles.settingsList}>
      {rows.map((row) => (
        <div key={row.key} className={styles.settingRow}>
          <span className={styles.settingRowLabelGroup}>
            <span className={styles.settingRowTitle}>{row.title}</span>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <button
                    type="button"
                    className={styles.infoIconButton}
                    aria-label={row.description}
                  >
                    <Info size={14} aria-hidden="true" />
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
                  <Tooltip.Popup className={styles.tooltipPopup}>
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
  );
}
