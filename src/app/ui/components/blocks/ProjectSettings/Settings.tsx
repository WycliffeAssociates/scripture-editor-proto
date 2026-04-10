import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Languages, MoonStar, Save, SunMedium } from "lucide-react";
import {
    type ReactNode,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { GET_LOCALES, type Settings } from "@/app/data/settings.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
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
                            <div className={styles.title}>{t`Settings`}</div>
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
                                    {t`App Appearance`}
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="reference-panel"
                                    className={styles.tabsTrigger}
                                >
                                    {t`Reference Panel`}
                                </BaseTabs.Tab>
                                <BaseTabs.Tab
                                    value="advanced"
                                    className={styles.tabsTrigger}
                                >
                                    {t`Advanced`}
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
                            {t`Save and Close`}
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
                            {t`Close without Saving`}
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
                description={t`Choose the display language for Dovetail.`}
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
            <div className={styles.rowTitle}>{t`Reference panel settings`}</div>
            <div className={styles.rowDescription}>
                {t`This tab shell is in place. The remaining reference-specific persisted settings still need to be defined before we wire real controls into it.`}
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
    projectsService: {
        createRemoteForProject: (projectRef: string) => Promise<unknown>;
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
        attachProjectToRemote: (args: {
            projectRef: string;
            repo: Pick<
                RemoteRepoSummary,
                | "id"
                | "owner"
                | "name"
                | "htmlUrl"
                | "cloneUrl"
                | "defaultBranch"
            >;
        }) => Promise<unknown>;
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
    const [selectedRepoName, setSelectedRepoName] = useState<string | null>(
        null,
    );
    const [isCreatingRemoteProject, setIsCreatingRemoteProject] =
        useState(false);
    const [isAttachingRemoteProject, setIsAttachingRemoteProject] =
        useState(false);

    const selectedRepo =
        gitea.repos.find((repo) => repo.fullName === selectedRepoName) ?? null;

    useEffect(() => {
        if (!gitea.error) return;
        ShowErrorNotification({
            notification: {
                title: t`Failed to load cloud projects`,
                message: gitea.error,
            },
        });
    }, [gitea.error]);

    useEffect(() => {
        setSelectedRepoName((current) => {
            if (
                current &&
                gitea.repos.some((repo) => repo.fullName === current)
            ) {
                return current;
            }
            return gitea.repos[0]?.fullName ?? null;
        });
    }, [gitea.repos]);

    const handleCreateRemote = async () => {
        setIsCreatingRemoteProject(true);
        try {
            await projectsService.createRemoteForProject(loadedProjectPath);
            await syncRemoteStatus();
            ShowNotificationSuccess({
                notification: {
                    title: t`Cloud project created`,
                    message: t`This project is now linked and published to cloud.`,
                },
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : t`Please try again.`;
            const duplicateNameMatch =
                /same name already exists/i.test(message) ||
                /already exists/i.test(message);
            ShowErrorNotification({
                notification: {
                    title: t`Failed to create remote project`,
                    message: duplicateNameMatch
                        ? t`A cloud project with this name already exists in your account. Attach the existing cloud project instead.`
                        : message,
                },
            });
        } finally {
            setIsCreatingRemoteProject(false);
        }
    };

    const handleAttachRemote = async () => {
        if (!selectedRepo) return;
        setIsAttachingRemoteProject(true);
        try {
            await projectsService.attachProjectToRemote({
                projectRef: loadedProjectPath,
                repo: {
                    id: selectedRepo.id,
                    owner: selectedRepo.owner,
                    name: selectedRepo.name,
                    htmlUrl: selectedRepo.htmlUrl,
                    cloneUrl: selectedRepo.cloneUrl,
                    defaultBranch: selectedRepo.defaultBranch,
                },
            });
            await syncRemoteStatus();
            ShowNotificationSuccess({
                notification: {
                    title: t`Cloud project attached`,
                    message: t`This project is now linked to the selected cloud repository.`,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    title: t`Failed to attach cloud project`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Please try again.`,
                },
            });
        } finally {
            setIsAttachingRemoteProject(false);
        }
    };

    return (
        <div className={styles.section}>
            <SettingRow
                title={t`Default review view`}
                description={t`Choose how change review opens by default.`}
                control={
                    <div className={styles.fieldControl}>
                        <ToggleGroup
                            value={settings.diffViewModeDefault}
                            onValueChange={(value) => {
                                if (value === "list" || value === "chapter") {
                                    void applyUpdates({
                                        diffViewModeDefault:
                                            value as Settings["diffViewModeDefault"],
                                    });
                                }
                            }}
                            items={[
                                { value: "list", label: t`By verse` },
                                { value: "chapter", label: t`By chapter` },
                            ]}
                            className={styles.toggleGroup}
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Auto Sync on Open`}
                description={t`Check for cloud updates automatically when opening a linked project.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={TESTING_IDS.settings.autoSyncOnOpenToggle}
                    >
                        <Switch
                            checked={settings.autoSyncOnOpen}
                            onCheckedChange={(checked) =>
                                void applyUpdates({ autoSyncOnOpen: checked })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoSyncOnOpen
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Auto Publish on Save`}
                description={t`Publish local saves automatically for linked cloud projects.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={TESTING_IDS.settings.autoPushOnSaveToggle}
                    >
                        <Switch
                            checked={settings.autoPushOnSave}
                            onCheckedChange={(checked) =>
                                void applyUpdates({ autoPushOnSave: checked })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoPushOnSave
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Auto Accept My Work on Save`}
                description={t`Skip review for your own local edits and commit them directly when you save.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={
                            TESTING_IDS.settings.autoAcceptOwnWorkOnSaveToggle
                        }
                    >
                        <Switch
                            checked={settings.autoAcceptOwnWorkOnSave}
                            onCheckedChange={(checked) =>
                                void applyUpdates({
                                    autoAcceptOwnWorkOnSave: checked,
                                })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoAcceptOwnWorkOnSave
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />

            <SettingRow
                title={t`Auto Accept Incoming Work`}
                description={t`Accept incoming cloud changes automatically unless the same verse already has unresolved local edits.`}
                control={
                    <div
                        className={styles.rowControlEnd}
                        data-testid={
                            TESTING_IDS.settings.autoAcceptIncomingWorkToggle
                        }
                    >
                        <Switch
                            checked={settings.autoAcceptIncomingWork}
                            onCheckedChange={(checked) =>
                                void applyUpdates({
                                    autoAcceptIncomingWork: checked,
                                })
                            }
                            label={
                                <span className={styles.switchLabel}>
                                    <span className={styles.switchLabelTitle}>
                                        {settings.autoAcceptIncomingWork
                                            ? t`Enabled`
                                            : t`Disabled`}
                                    </span>
                                </span>
                            }
                        />
                    </div>
                }
            />

            {!isCloudLinked ? (
                <>
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
                                        TESTING_IDS.settings
                                            .createRemoteProjectButton
                                    }
                                    disabled={
                                        !cloudSessionUsername ||
                                        isCreatingRemoteProject
                                    }
                                    onClick={() => void handleCreateRemote()}
                                >
                                    {isCreatingRemoteProject
                                        ? t`Creating...`
                                        : t`Save as new cloud project`}
                                </Button>
                            </div>
                        }
                    />

                    <SettingRow
                        title={t`Attach existing cloud project`}
                        description={t`Link this local project to any cloud repository you can edit.`}
                        control={
                            <div className={styles.fieldControl}>
                                <div
                                    data-testid={
                                        TESTING_IDS.settings
                                            .attachRemoteProjectSelect
                                    }
                                >
                                    <Combobox.Root<RemoteRepoSummary>
                                        items={gitea.repos}
                                        value={selectedRepo}
                                        inputValue={gitea.query}
                                        onInputValueChange={gitea.setQuery}
                                        onValueChange={(value) =>
                                            setSelectedRepoName(
                                                value?.fullName ?? null,
                                            )
                                        }
                                        itemToStringLabel={(item) =>
                                            item.fullName
                                        }
                                        itemToStringValue={(item) =>
                                            item.fullName
                                        }
                                    >
                                        <Combobox.Trigger
                                            className={styles.selectControl}
                                            aria-label={t`Select cloud project`}
                                        >
                                            <span
                                                className={
                                                    styles.cloudProjectComboboxValue
                                                }
                                            >
                                                {selectedRepo?.fullName ??
                                                    t`Select cloud project`}
                                            </span>
                                            <span
                                                className={
                                                    styles.cloudProjectComboboxChevron
                                                }
                                                aria-hidden="true"
                                            >
                                                ⌄
                                            </span>
                                        </Combobox.Trigger>

                                        <Combobox.Portal
                                            container={portalContainer}
                                        >
                                            <Combobox.Positioner
                                                sideOffset={8}
                                                align="start"
                                            >
                                                <Combobox.Popup
                                                    className={
                                                        styles.cloudProjectComboboxPopup
                                                    }
                                                >
                                                    <div
                                                        className={
                                                            styles.cloudProjectComboboxHeader
                                                        }
                                                    >
                                                        <Combobox.Input
                                                            className={
                                                                styles.cloudProjectComboboxInput
                                                            }
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
                                                                {gitea.repos.map(
                                                                    (repo) => (
                                                                        <Combobox.Item
                                                                            key={
                                                                                repo.id
                                                                            }
                                                                            value={
                                                                                repo
                                                                            }
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
                                                                                {selectedRepoName ===
                                                                                repo.fullName ? (
                                                                                    <Check
                                                                                        size={
                                                                                            14
                                                                                        }
                                                                                    />
                                                                                ) : null}
                                                                            </span>
                                                                            <span>
                                                                                {
                                                                                    repo.fullName
                                                                                }
                                                                            </span>
                                                                        </Combobox.Item>
                                                                    ),
                                                                )}
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
                                                </Combobox.Popup>
                                            </Combobox.Positioner>
                                        </Combobox.Portal>
                                    </Combobox.Root>
                                </div>
                                <div className={styles.cloudAttachActions}>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={gitea.isLoading}
                                        onClick={() => void gitea.refresh()}
                                    >
                                        {gitea.isLoading
                                            ? t`Refreshing...`
                                            : t`Refresh`}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="primary"
                                        data-testid={
                                            TESTING_IDS.settings
                                                .attachRemoteProjectButton
                                        }
                                        disabled={
                                            !cloudSessionUsername ||
                                            !selectedRepo ||
                                            isAttachingRemoteProject
                                        }
                                        onClick={() =>
                                            void handleAttachRemote()
                                        }
                                    >
                                        {isAttachingRemoteProject
                                            ? t`Attaching...`
                                            : t`Attach`}
                                    </Button>
                                </div>
                            </div>
                        }
                    />
                </>
            ) : null}

            <div className={styles.buildInfo}>
                <div className={styles.buildInfoRow}>
                    <span className={styles.buildInfoLabel}>{t`Version`}:</span>
                    <span className={styles.buildInfoValue}>
                        {import.meta.env.DEV
                            ? "local"
                            : import.meta.env.VITE_VERSION_TAG || ""}
                    </span>
                </div>
                {!import.meta.env.DEV && import.meta.env.VITE_GITHUB_SHA && (
                    <div className={styles.buildInfoRow}>
                        <span className={styles.buildInfoLabel}>{t`SHA`}:</span>
                        <span className={styles.buildInfoValue}>
                            {import.meta.env.VITE_GITHUB_SHA}
                        </span>
                    </div>
                )}
            </div>
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
