import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Languages, MoonStar, Save, SunMedium } from "lucide-react";
import {
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { GET_LOCALES, type Settings } from "@/app/data/settings.ts";
import {
    type CloudProjectsService,
    sortReposByOwnerPriority,
} from "@/app/domain/project/cloudProjectActions.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ShowErrorNotification } from "@/app/ui/components/primitives/Notifications.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useCloudProjectActions } from "@/app/ui/hooks/useCloudProjectActions.ts";
import { useGiteaApi } from "@/app/ui/hooks/useGiteaApi.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";
import EditorModeToggle from "./EditorModeToggle.tsx";
import FontSizeControl from "./FontSizeControl.tsx";
import * as styles from "./settings.css.ts";
import ZoomControl from "./ZoomControl.tsx";

type SettingsTab = "app-appearance" | "reference-panel" | "advanced";

interface SettingsPanelProps {
    onClose?: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
    const { actions, loadedProject, project, remote } = useWorkspaceContext();
    const { authSessionProvider, projectsService } =
        useRouter().options.context;
    const overlayPortalRef = useRef<HTMLDivElement | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>("app-appearance");
    const [initialSettings] = useState<Settings>(() =>
        structuredClone(project.appSettings),
    );
    const [isReverting, setIsReverting] = useState(false);

    async function applySettings(nextSettings: Settings) {
        const currentSettings = project.appSettings;

        try {
            if (nextSettings.appLanguage !== currentSettings.appLanguage) {
                await loadLocale(nextSettings.appLanguage);
            }

            if (nextSettings.colorScheme !== currentSettings.colorScheme) {
                actions.setColorScheme?.(nextSettings.colorScheme);
            }

            if (nextSettings.editorMode !== currentSettings.editorMode) {
                actions.setEditorMode?.(nextSettings.editorMode);
            }

            project.updateAppSettings({
                fontSize: nextSettings.fontSize,
                zoom: nextSettings.zoom,
                appLanguage: nextSettings.appLanguage,
                appDirection: nextSettings.appDirection,
                autoSyncOnOpen: nextSettings.autoSyncOnOpen,
                autoPushOnSave: nextSettings.autoPushOnSave,
                autoAcceptOwnWorkOnSave: nextSettings.autoAcceptOwnWorkOnSave,
                autoAcceptIncomingWork: nextSettings.autoAcceptIncomingWork,
                diffViewModeDefault: nextSettings.diffViewModeDefault,
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    title: i18n._("Failed to save settings"),
                    message:
                        error instanceof Error
                            ? error.message
                            : i18n._("Settings could not be applied."),
                },
            });
        }
    }

    async function handleCloseWithoutSaving() {
        setIsReverting(true);

        try {
            await applySettings(initialSettings);
            onClose?.();
        } finally {
            setIsReverting(false);
        }
    }

    async function handleSettingsChange(updates: Partial<Settings>) {
        await applySettings({
            ...project.appSettings,
            ...updates,
        });
    }

    return (
        <div className={styles.panel} ref={overlayPortalRef}>
            <div className={styles.shell}>
                <div className={styles.headerOuter}>
                    <div className={styles.contentInner}>
                        <div className={styles.header}>
                            <div className={styles.title}>
                                <Trans>Settings</Trans>
                            </div>
                        </div>
                    </div>
                </div>

                <BaseTabs.Root
                    value={activeTab}
                    onValueChange={(value) =>
                        setActiveTab(value as SettingsTab)
                    }
                    className={styles.tabsRoot}
                >
                    <div className={styles.tabsListOuter}>
                        <div className={styles.contentInner}>
                            <BaseTabs.List className={styles.tabsList}>
                                <BaseTabs.Tab
                                    value="app-appearance"
                                    className={styles.tabsTrigger}
                                >
                                    <Trans>App Appearance</Trans>
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="reference-panel"
                                    className={styles.tabsTrigger}
                                >
                                    <Trans>Reference Panel</Trans>
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="advanced"
                                    className={styles.tabsTrigger}
                                >
                                    <Trans>Advanced</Trans>
                                </BaseTabs.Tab>
                            </BaseTabs.List>
                        </div>
                    </div>

                    <BaseTabs.Panel
                        value="app-appearance"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <AppAppearanceTab
                                settings={project.appSettings}
                                applyUpdates={handleSettingsChange}
                                portalContainer={overlayPortalRef}
                            />
                        </div>
                    </BaseTabs.Panel>

                    <BaseTabs.Panel
                        value="reference-panel"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <ReferencePanelTab />
                        </div>
                    </BaseTabs.Panel>

                    <BaseTabs.Panel
                        value="advanced"
                        className={styles.tabsPanel}
                    >
                        <div className={styles.tabsPanelInner}>
                            <AdvancedTab
                                loadedProjectPath={loadedProject.projectPath}
                                isCloudLinked={remote.status !== null}
                                syncRemoteStatus={remote.syncNow}
                                authSessionProvider={authSessionProvider}
                                projectsService={projectsService}
                                settings={project.appSettings}
                                applyUpdates={handleSettingsChange}
                                portalContainer={overlayPortalRef}
                            />
                        </div>
                    </BaseTabs.Panel>
                </BaseTabs.Root>

                <div className={styles.footer}>
                    <div className={styles.footerInner}>
                        <Button
                            type="button"
                            variant="primary"
                            size="md"
                            className={styles.footerButton}
                            leftIcon={<Save size={16} />}
                            onClick={onClose}
                        >
                            <Trans>Save and Close</Trans>
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            className={styles.footerButton}
                            onClick={() => {
                                void handleCloseWithoutSaving();
                            }}
                            disabled={isReverting}
                        >
                            <Trans>Close without Saving</Trans>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LanguageSelector({
    value,
    onChange,
    portalContainer,
}: {
    value: string | null;
    onChange: (locale: string | null) => Promise<void> | void;
    portalContainer?: RefObject<HTMLElement | null>;
}) {
    const localeItems = Object.entries(GET_LOCALES()).map(
        ([locale, metadata]) => ({
            value: locale,
            label: i18n._(metadata.nativeName),
        }),
    );

    return (
        <SelectPrimitive
            items={localeItems}
            value={value ?? undefined}
            onValueChange={onChange}
            icon={<Languages size={18} />}
            className={styles.selectControl}
            portalContainer={portalContainer}
            placeholder={t`Select language`}
        />
    );
}

function AppAppearanceTab({
    settings,
    applyUpdates,
    portalContainer,
}: {
    settings: Settings;
    applyUpdates: (updates: Partial<Settings>) => Promise<void>;
    portalContainer: RefObject<HTMLElement | null>;
}) {
    const localeItems = Object.entries(GET_LOCALES()).map(
        ([value, locale]) => ({
            value,
            label: i18n._(locale.nativeName),
        }),
    );

    return (
        <div className={styles.section}>
            <SettingRow
                title={t`Interface Language`}
                description={t`Choose the display language for Zephyr.`}
                control={
                    <div data-testid={TESTING_IDS.settings.languageSelector}>
                        <SelectPrimitive
                            items={localeItems}
                            value={settings.appLanguage}
                            onValueChange={(value) => {
                                if (!value) {
                                    return;
                                }

                                const locale = GET_LOCALES()[value];
                                void applyUpdates({
                                    appLanguage:
                                        value as Settings["appLanguage"],
                                    appDirection: locale.direction,
                                });
                            }}
                            icon={<Languages size={18} />}
                            className={styles.selectControl}
                            portalContainer={portalContainer}
                            placeholder={t`Select language`}
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Display Mode`}
                description={t`Choose the theme used throughout the application.`}
                control={
                    <div data-testid={TESTING_IDS.settings.themeToggle}>
                        <ToggleGroup
                            value={settings.colorScheme}
                            onValueChange={(value) => {
                                if (value === "light" || value === "dark") {
                                    void applyUpdates({ colorScheme: value });
                                }
                            }}
                            items={[
                                {
                                    value: "light",
                                    label: t`Light`,
                                    icon: <SunMedium size={16} />,
                                },
                                {
                                    value: "dark",
                                    label: t`Dark`,
                                    icon: <MoonStar size={16} />,
                                },
                            ]}
                            className={styles.toggleGroup}
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Editor Mode`}
                description={t`Select which editing mode you want to use.`}
                control={
                    <EditorModeToggle
                        value={settings.editorMode}
                        onValueChange={(value) =>
                            void applyUpdates({ editorMode: value })
                        }
                        portalContainer={portalContainer}
                    />
                }
            />

            <SettingRow
                title={t`Text Size`}
                description={t`Adjust the reading size used for editor text.`}
                control={
                    <FontSizeControl
                        value={settings.fontSize}
                        onValueChange={(value) =>
                            void applyUpdates({ fontSize: value })
                        }
                    />
                }
            />

            {settings.canSetZoom ? (
                <SettingRow
                    title={t`Zoom`}
                    description={t`Adjust the overall application zoom when supported.`}
                    control={
                        <ZoomControl
                            value={settings.zoom}
                            canSetZoom={settings.canSetZoom}
                            onValueChange={(value) =>
                                void applyUpdates({ zoom: value })
                            }
                        />
                    }
                />
            ) : null}
        </div>
    );
}

function ReferencePanelTab() {
    return (
        <div className={styles.placeholder}>
            <div className={styles.rowTitle}>
                <Trans>Reference panel settings</Trans>
            </div>
            <div className={styles.rowDescription}>
                <Trans>
                    This tab shell is in place. The remaining reference-specific
                    persisted settings still need to be defined before we wire
                    real controls into it.
                </Trans>
            </div>
        </div>
    );
}

function AdvancedTab({
    loadedProjectPath,
    isCloudLinked,
    syncRemoteStatus,
    authSessionProvider,
    projectsService,
    settings,
    applyUpdates,
    portalContainer,
}: {
    loadedProjectPath: string;
    isCloudLinked: boolean;
    syncRemoteStatus: () => Promise<void>;
    authSessionProvider: Pick<AuthSessionProvider, "getCurrentSession">;
    projectsService: CloudProjectsService & {
        listWritableRemoteRepos: (args: {
            page: number;
            pageSize: number;
            topic?: string;
            searchQuery?: string;
        }) => Promise<{
            repos: RemoteRepoSummary[];
            nextPage: number | null;
            rawResultCount: number;
        }>;
        listOwnedRemoteRepos: (args: {
            page: number;
            pageSize: number;
            topic?: string;
            searchQuery?: string;
        }) => Promise<{
            repos: RemoteRepoSummary[];
            nextPage: number | null;
            rawResultCount: number;
        }>;
    };
    settings: Settings;
    applyUpdates: (updates: Partial<Settings>) => Promise<void>;
    portalContainer: RefObject<HTMLElement | null>;
}) {
    const sessionQuery = useQuery({
        queryKey: ["giteaSession", "settings"],
        queryFn: async () => await authSessionProvider.getCurrentSession(),
    });
    const cloudSessionUsername = sessionQuery.data?.username ?? null;
    const gitea = useGiteaApi({
        sessionUsername: cloudSessionUsername,
        projectsService,
    });
    const [selectedRepo, setSelectedRepo] = useState<RemoteRepoSummary | null>(
        null,
    );
    const cloudActions = useCloudProjectActions({
        projectsService,
        loadedProjectPath,
        refresh: syncRemoteStatus,
    });
    const displayedRepos = useMemo(
        () => sortReposByOwnerPriority(gitea.repos, cloudSessionUsername),
        [gitea.repos, cloudSessionUsername],
    );

    useEffect(() => {
        if (!gitea.error) return;
        ShowErrorNotification({
            notification: {
                title: t`Failed to load cloud projects`,
                message: gitea.error,
            },
        });
    }, [gitea.error]);

    return (
        <div className={styles.section}>
            <DiffViewModeRow
                value={settings.diffViewModeDefault}
                onChange={(value) =>
                    applyUpdates({ diffViewModeDefault: value })
                }
            />
            <EnabledDisabledRow
                title={t`Auto Sync on Open`}
                description={t`Check for cloud updates automatically when opening a linked project.`}
                checked={settings.autoSyncOnOpen}
                testId={TESTING_IDS.settings.autoSyncOnOpenToggle}
                onChange={(checked) =>
                    applyUpdates({ autoSyncOnOpen: checked })
                }
            />
            <EnabledDisabledRow
                title={t`Auto Publish on Save`}
                description={t`Publish local saves automatically for linked cloud projects.`}
                checked={settings.autoPushOnSave}
                testId={TESTING_IDS.settings.autoPushOnSaveToggle}
                onChange={(checked) =>
                    applyUpdates({ autoPushOnSave: checked })
                }
            />
            <EnabledDisabledRow
                title={t`Auto Accept My Work on Save`}
                description={t`Skip review for your own local edits and commit them directly when you save.`}
                checked={settings.autoAcceptOwnWorkOnSave}
                testId={TESTING_IDS.settings.autoAcceptOwnWorkOnSaveToggle}
                onChange={(checked) =>
                    applyUpdates({ autoAcceptOwnWorkOnSave: checked })
                }
            />
            <EnabledDisabledRow
                title={t`Auto Accept Incoming Work`}
                description={t`Accept incoming cloud changes automatically unless the same verse already has unresolved local edits.`}
                checked={settings.autoAcceptIncomingWork}
                testId={TESTING_IDS.settings.autoAcceptIncomingWorkToggle}
                onChange={(checked) =>
                    applyUpdates({ autoAcceptIncomingWork: checked })
                }
            />

            {!isCloudLinked ? (
                <>
                    <CreateCloudProjectRow
                        cloudSessionUsername={cloudSessionUsername}
                        isCreating={cloudActions.isCreating}
                        onCreate={() => cloudActions.create()}
                    />
                    <AttachCloudProjectRow
                        cloudSessionUsername={cloudSessionUsername}
                        gitea={gitea}
                        displayedRepos={displayedRepos}
                        selectedRepo={selectedRepo}
                        onSelectRepo={setSelectedRepo}
                        portalContainer={portalContainer}
                        isAttaching={cloudActions.isAttaching}
                        onAttach={() => cloudActions.attach(selectedRepo)}
                    />
                </>
            ) : null}

            <BuildInfoFooter />
        </div>
    );
}

function DiffViewModeRow(props: {
    value: Settings["diffViewModeDefault"];
    onChange: (value: Settings["diffViewModeDefault"]) => void;
}) {
    const handleChange = (value: string | null) => {
        if (value === "list" || value === "chapter") {
            props.onChange(value);
        }
    };
    return (
        <SettingRow
            title={t`Default review view`}
            description={t`Choose how change review opens by default.`}
            control={
                <div className={styles.fieldControl}>
                    <ToggleGroup
                        value={props.value}
                        onValueChange={handleChange}
                        items={[
                            { value: "list", label: t`By verse` },
                            { value: "chapter", label: t`By chapter` },
                        ]}
                        className={styles.toggleGroup}
                    />
                </div>
            }
        />
    );
}

function EnabledDisabledRow(props: {
    title: string;
    description: string;
    checked: boolean;
    testId?: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <SettingRow
            title={props.title}
            description={props.description}
            control={
                <div
                    className={styles.rowControlEnd}
                    data-testid={props.testId}
                >
                    <Switch
                        checked={props.checked}
                        onCheckedChange={(checked) => props.onChange(checked)}
                        label={
                            <span className={styles.switchLabel}>
                                <span className={styles.switchLabelTitle}>
                                    {props.checked ? t`Enabled` : t`Disabled`}
                                </span>
                            </span>
                        }
                    />
                </div>
            }
        />
    );
}

function CreateCloudProjectRow(props: {
    cloudSessionUsername: string | null;
    isCreating: boolean;
    onCreate: () => void;
}) {
    return (
        <SettingRow
            title={t`Create cloud project`}
            description={t`Create and link a new cloud repository from this local project.`}
            control={
                <div className={styles.rowControlEnd}>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid={
                            TESTING_IDS.settings.createRemoteProjectButton
                        }
                        disabled={
                            !props.cloudSessionUsername || props.isCreating
                        }
                        onClick={props.onCreate}
                    >
                        {props.isCreating
                            ? t`Creating...`
                            : t`Save as new cloud project`}
                    </Button>
                </div>
            }
        />
    );
}

function AttachCloudProjectRow(props: {
    cloudSessionUsername: string | null;
    gitea: ReturnType<typeof useGiteaApi>;
    displayedRepos: RemoteRepoSummary[];
    selectedRepo: RemoteRepoSummary | null;
    onSelectRepo: (repo: RemoteRepoSummary | null) => void;
    portalContainer: RefObject<HTMLElement | null>;
    isAttaching: boolean;
    onAttach: () => void;
}) {
    return (
        <SettingRow
            title={t`Attach existing cloud project`}
            description={t`Link this local project to any cloud repository you can edit.`}
            control={
                <div className={styles.fieldControl}>
                    <CloudProjectCombobox
                        gitea={props.gitea}
                        displayedRepos={props.displayedRepos}
                        selectedRepo={props.selectedRepo}
                        onSelectRepo={props.onSelectRepo}
                        portalContainer={props.portalContainer}
                    />
                    {props.gitea.hasAdditionalReposAvailable ? (
                        <div className={styles.cloudProjectComboboxMeta}>
                            {t`Showing ${props.gitea.visiblePageSize} projects to start. Search to find additional repositories.`}
                        </div>
                    ) : null}
                    <CloudAttachActions
                        cloudSessionUsername={props.cloudSessionUsername}
                        gitea={props.gitea}
                        selectedRepo={props.selectedRepo}
                        isAttaching={props.isAttaching}
                        onAttach={props.onAttach}
                    />
                </div>
            }
        />
    );
}

function CloudProjectCombobox(props: {
    gitea: ReturnType<typeof useGiteaApi>;
    displayedRepos: RemoteRepoSummary[];
    selectedRepo: RemoteRepoSummary | null;
    onSelectRepo: (repo: RemoteRepoSummary | null) => void;
    portalContainer: RefObject<HTMLElement | null>;
}) {
    return (
        <div data-testid={TESTING_IDS.settings.attachRemoteProjectSelect}>
            <Combobox.Root<RemoteRepoSummary>
                items={props.displayedRepos}
                value={props.selectedRepo}
                inputValue={props.gitea.query}
                onInputValueChange={props.gitea.setQuery}
                onValueChange={(value) => props.onSelectRepo(value ?? null)}
                itemToStringLabel={(item) => item.fullName}
                itemToStringValue={(item) => item.fullName}
            >
                <Combobox.Trigger
                    className={styles.cloudProjectComboboxTrigger}
                    aria-label={t`Select cloud project`}
                >
                    <span className={styles.cloudProjectComboboxValue}>
                        {props.selectedRepo?.fullName ??
                            t`Select cloud project`}
                    </span>
                    <span
                        className={styles.cloudProjectComboboxChevron}
                        aria-hidden="true"
                    >
                        ⌄
                    </span>
                </Combobox.Trigger>
                <Combobox.Portal container={props.portalContainer}>
                    <Combobox.Positioner sideOffset={8} align="start">
                        <Combobox.Popup
                            className={styles.cloudProjectComboboxPopup}
                        >
                            <div className={styles.cloudProjectComboboxHeader}>
                                <Combobox.Input
                                    className={styles.cloudProjectComboboxInput}
                                    aria-label={t`Search cloud projects`}
                                    placeholder={t`Search cloud projects`}
                                    autoFocus
                                />
                            </div>
                            <ScrollArea.Root
                                className={
                                    styles.cloudProjectComboboxScrollArea
                                }
                            >
                                <ScrollArea.Viewport
                                    className={
                                        styles.cloudProjectComboboxScrollViewport
                                    }
                                >
                                    <Combobox.List
                                        className={
                                            styles.cloudProjectComboboxList
                                        }
                                    >
                                        {props.displayedRepos.map((repo) => (
                                            <Combobox.Item
                                                key={repo.id}
                                                value={repo}
                                                className={
                                                    styles.cloudProjectComboboxItem
                                                }
                                            >
                                                <span
                                                    className={
                                                        styles.cloudProjectComboboxItemIndicator
                                                    }
                                                    aria-hidden="true"
                                                >
                                                    {props.selectedRepo
                                                        ?.fullName ===
                                                    repo.fullName ? (
                                                        <Check size={14} />
                                                    ) : null}
                                                </span>
                                                <span>{repo.fullName}</span>
                                            </Combobox.Item>
                                        ))}
                                    </Combobox.List>
                                    <Combobox.Empty
                                        className={
                                            styles.cloudProjectComboboxEmpty
                                        }
                                    >
                                        {t`No cloud projects found.`}
                                    </Combobox.Empty>
                                </ScrollArea.Viewport>
                                <ScrollArea.Scrollbar orientation="vertical">
                                    <ScrollArea.Thumb />
                                </ScrollArea.Scrollbar>
                            </ScrollArea.Root>
                            {props.gitea.hasAdditionalReposAvailable ? (
                                <div
                                    className={
                                        styles.cloudProjectComboboxFooter
                                    }
                                >
                                    {t`Showing initial ${props.gitea.visiblePageSize}. Search to find more.`}
                                </div>
                            ) : null}
                        </Combobox.Popup>
                    </Combobox.Positioner>
                </Combobox.Portal>
            </Combobox.Root>
        </div>
    );
}

function CloudAttachActions(props: {
    cloudSessionUsername: string | null;
    gitea: ReturnType<typeof useGiteaApi>;
    selectedRepo: RemoteRepoSummary | null;
    isAttaching: boolean;
    onAttach: () => void;
}) {
    const attachDisabled =
        !props.cloudSessionUsername || !props.selectedRepo || props.isAttaching;
    return (
        <div className={styles.cloudAttachActions}>
            <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={props.gitea.isLoading}
                onClick={() => void props.gitea.refresh()}
            >
                {props.gitea.isLoading ? t`Refreshing...` : t`Refresh`}
            </Button>
            <Button
                type="button"
                size="sm"
                variant="primary"
                data-testid={TESTING_IDS.settings.attachRemoteProjectButton}
                disabled={attachDisabled}
                onClick={props.onAttach}
            >
                {props.isAttaching ? t`Attaching...` : t`Attach`}
            </Button>
        </div>
    );
}

function BuildInfoFooter() {
    const versionLabel = import.meta.env.DEV
        ? "local"
        : import.meta.env.VITE_VERSION_TAG || "";
    const showSha = !import.meta.env.DEV && import.meta.env.VITE_GITHUB_SHA;
    return (
        <div className={styles.buildInfo}>
            <div className={styles.buildInfoRow}>
                <span className={styles.buildInfoLabel}>
                    <Trans>Version</Trans>:
                </span>
                <span className={styles.buildInfoValue}>{versionLabel}</span>
            </div>
            {showSha ? (
                <div className={styles.buildInfoRow}>
                    <span className={styles.buildInfoLabel}>
                        <Trans>SHA</Trans>:
                    </span>
                    <span className={styles.buildInfoValue}>
                        {import.meta.env.VITE_GITHUB_SHA}
                    </span>
                </div>
            ) : null}
        </div>
    );
}

function SettingRow({
    title,
    description,
    control,
}: {
    title: string;
    description: string;
    control: ReactNode;
}) {
    return (
        <div className={styles.sectionRow}>
            <div className={styles.rowText}>
                <div className={styles.rowTitle}>{title}</div>
                <div className={styles.rowDescription}>{description}</div>
            </div>
            <div className={styles.rowControl}>{control}</div>
        </div>
    );
}
