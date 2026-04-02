import { i18n } from "@lingui/core";
import { Trans } from "@lingui/react/macro";
import {
    Box,
    Button,
    Center,
    rem,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
    useMantineColorScheme,
} from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { Languages, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { GET_LOCALES } from "@/app/data/settings.ts";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";
import EditorModeToggle from "./EditorModeToggle.tsx";
import FontSizeControl from "./FontSizeControl.tsx";
import styles from "./Settings.module.css";
import ZoomControl from "./ZoomControl.tsx";

/**
 * Settings surface for the active workspace and overall app presentation.
 *
 * These controls sit above the persistence layer: they update saved app settings
 * and immediately apply the visual/runtime side effects the current route needs.
 */
export function SettingsPanel() {
    const { project } = useWorkspaceContext();

    const handleLangChange = async (locale: string | null) => {
        if (!locale) return;
        project.updateAppSettings({ appLanguage: locale });
        // Make sure Lingui messages are activated
        await loadLocale(locale);
    };

    return (
        <Stack gap="lg">
            <DisplayThemeToggle />
            <CloudSyncSettings />
            <EditorModeToggle />
            <ZoomControl />
            <FontSizeControl />
            {/*<FontPicker />*/}
            <LanguageSelector
                value={project.appSettings.appLanguage}
                onChange={handleLangChange}
            />
        </Stack>
    );
}

/**
 * Theme toggle for the current app session and persisted workspace settings.
 */
function DisplayThemeToggle() {
    const { project } = useWorkspaceContext();
    const { setColorScheme } = useMantineColorScheme();

    return (
        <Stack gap="xs">
            <Text size="md" mb="2" fw={500}>
                <Trans>Display</Trans>
            </Text>
            <SegmentedControl
                data-testid={TESTING_IDS.settings.themeToggle}
                radius={"lg"}
                withItemsBorders={false}
                data-value={project.appSettings.colorScheme}
                value={project.appSettings.colorScheme}
                classNames={{
                    root: styles.root,
                    label: styles.label,
                    indicator: styles.indicator,
                }}
                onChange={(value) => {
                    if (value === "light" || value === "dark") {
                        project.updateAppSettings({ colorScheme: value });
                        setColorScheme(value);
                    }
                }}
                data={[
                    {
                        value: "light",
                        label: (
                            <Center
                                style={{ display: "flex", gap: "0.5rem" }}
                                className={
                                    project.appSettings.colorScheme === "light"
                                        ? styles.chosenToggle
                                        : undefined
                                }
                            >
                                <Sun size="1.5rem" />
                                <Box>
                                    <Trans>Light</Trans>
                                </Box>
                            </Center>
                        ),
                    },
                    {
                        value: "dark",
                        label: (
                            <Center
                                style={{ display: "flex", gap: "0.5rem" }}
                                className={
                                    project.appSettings.colorScheme === "dark"
                                        ? styles.chosenToggle
                                        : undefined
                                }
                            >
                                <Moon size="1.5rem" />
                                <Box>
                                    <Trans>Dark</Trans>
                                </Box>
                            </Center>
                        ),
                    },
                ]}
            />
        </Stack>
    );
}

/**
 * Cloud publish/sync policy toggles.
 *
 * These are user-facing policy controls for the linked-project cloud behavior.
 * They do not perform sync themselves; they only decide whether open/save paths
 * should automatically check or publish without an explicit button press.
 */
function CloudSyncSettings() {
    const { currentProjectRoute, project, remote } = useWorkspaceContext();
    const {
        options: {
            context: { authSessionProvider, projectsService },
        },
    } = useRouter();
    const [hasSession, setHasSession] = useState(false);
    const [isCreatingRemote, setIsCreatingRemote] = useState(false);
    const [isLoadingOwnedRepos, setIsLoadingOwnedRepos] = useState(false);
    const [hasLoadedOwnedRepos, setHasLoadedOwnedRepos] = useState(false);
    const [ownedRepos, setOwnedRepos] = useState<RemoteRepoSummary[]>([]);
    const [selectedOwnedRepoId, setSelectedOwnedRepoId] = useState<
        string | null
    >(null);
    const [isAttachingRemote, setIsAttachingRemote] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void authSessionProvider.getCurrentSession().then((session) => {
            if (cancelled) return;
            setHasSession(Boolean(session));
        });
        return () => {
            cancelled = true;
        };
    }, [authSessionProvider]);

    useEffect(() => {
        if (!hasSession || remote.status) {
            setOwnedRepos([]);
            setSelectedOwnedRepoId(null);
            setHasLoadedOwnedRepos(false);
            setIsLoadingOwnedRepos(false);
            return;
        }

        if (hasLoadedOwnedRepos) {
            return;
        }

        void loadOwnedRepos();
    }, [hasLoadedOwnedRepos, hasSession, remote.status]);

    const loadOwnedRepos = async () => {
        setIsLoadingOwnedRepos(true);
        try {
            const page = await projectsService.listOwnedRemoteRepos({
                page: 1,
                pageSize: 100,
            });
            setOwnedRepos(page.repos);
            setSelectedOwnedRepoId((currentSelection) =>
                currentSelection &&
                page.repos.some((repo) => repo.id === currentSelection)
                    ? currentSelection
                    : (page.repos[0]?.id ?? null),
            );
            setHasLoadedOwnedRepos(true);
        } catch (error) {
            console.error("Failed to list owned remote repos", error);
            ShowErrorNotification({
                notification: {
                    title: i18n._("Failed to load cloud projects"),
                    message:
                        error instanceof Error
                            ? error.message
                            : i18n._(
                                  "Owned cloud repositories could not be loaded for attachment.",
                              ),
                },
            });
        } finally {
            setIsLoadingOwnedRepos(false);
        }
    };

    const createRemoteProject = async () => {
        setIsCreatingRemote(true);
        try {
            const result =
                await projectsService.createRemoteForProject(
                    currentProjectRoute,
                );
            ShowNotificationSuccess({
                notification: {
                    title: i18n._("Cloud project created"),
                    message: i18n._(
                        `Created, linked, and published this project to ${result.repo.owner}/${result.repo.name}.`,
                    ),
                },
            });
        } catch (error) {
            console.error("Failed to create remote project", error);
            ShowErrorNotification({
                notification: {
                    title: i18n._("Failed to create cloud project"),
                    message: resolveCreateRemoteErrorMessage({
                        error,
                        suggestedName: currentProjectRoute,
                        fallback: i18n._(
                            "This project could not be linked to a new cloud repository.",
                        ),
                    }),
                },
            });
        } finally {
            setIsCreatingRemote(false);
        }
    };

    const attachExistingRemoteProject = async () => {
        const selectedRepo =
            ownedRepos.find((repo) => repo.id === selectedOwnedRepoId) ?? null;
        if (!selectedRepo) {
            return;
        }

        setIsAttachingRemote(true);
        try {
            await projectsService.attachProjectToRemote({
                projectRef: currentProjectRoute,
                repo: selectedRepo,
            });
            ShowNotificationSuccess({
                notification: {
                    title: i18n._("Cloud project attached"),
                    message: i18n._(
                        `Linked this project to ${selectedRepo.owner}/${selectedRepo.name}. Sync now to review or publish.`,
                    ),
                },
            });
            await remote.syncNow();
        } catch (error) {
            console.error("Failed to attach remote project", error);
            ShowErrorNotification({
                notification: {
                    title: i18n._("Failed to attach cloud project"),
                    message:
                        error instanceof Error
                            ? error.message
                            : i18n._(
                                  "This project could not be linked to the selected cloud repository.",
                              ),
                },
            });
        } finally {
            setIsAttachingRemote(false);
        }
    };

    return (
        <Stack gap="xs">
            <Text size="md" mb="2" fw={500}>
                <Trans>Cloud</Trans>
            </Text>
            {hasSession && !remote.status ? (
                <>
                    <Button
                        data-testid={
                            TESTING_IDS.settings.createRemoteProjectButton
                        }
                        variant="light"
                        onClick={() => {
                            void createRemoteProject();
                        }}
                        loading={isCreatingRemote}
                        disabled={isAttachingRemote}
                    >
                        <Trans>Save as new cloud project</Trans>
                    </Button>
                    <Stack gap="xs">
                        <Select
                            data-testid={
                                TESTING_IDS.settings.attachRemoteProjectSelect
                            }
                            label={<Trans>Attach existing cloud project</Trans>}
                            description={
                                <Trans>
                                    Choose a repository you own with matching
                                    scripture metadata and language.
                                </Trans>
                            }
                            placeholder={
                                isLoadingOwnedRepos
                                    ? i18n._("Loading cloud projects...")
                                    : i18n._("Select a cloud project")
                            }
                            value={selectedOwnedRepoId}
                            onChange={setSelectedOwnedRepoId}
                            disabled={
                                isLoadingOwnedRepos ||
                                isAttachingRemote ||
                                ownedRepos.length === 0
                            }
                            data={ownedRepos.map((repo) => ({
                                value: repo.id,
                                label: `${repo.owner}/${repo.name}`,
                            }))}
                            searchable
                        />
                        <Box style={{ display: "flex", gap: rem(8) }}>
                            <Button
                                variant="default"
                                onClick={() => {
                                    void loadOwnedRepos();
                                }}
                                loading={isLoadingOwnedRepos}
                                disabled={isAttachingRemote}
                            >
                                <Trans>Refresh cloud projects</Trans>
                            </Button>
                            <Button
                                data-testid={
                                    TESTING_IDS.settings
                                        .attachRemoteProjectButton
                                }
                                variant="light"
                                onClick={() => {
                                    void attachExistingRemoteProject();
                                }}
                                loading={isAttachingRemote}
                                disabled={
                                    !selectedOwnedRepoId ||
                                    isLoadingOwnedRepos ||
                                    isCreatingRemote
                                }
                            >
                                <Trans>Attach existing cloud project</Trans>
                            </Button>
                        </Box>
                        {hasLoadedOwnedRepos && ownedRepos.length === 0 ? (
                            <Text size="sm" c="dimmed">
                                <Trans>
                                    No owned cloud repositories are available to
                                    attach yet.
                                </Trans>
                            </Text>
                        ) : null}
                    </Stack>
                </>
            ) : null}
            <Switch
                data-testid={TESTING_IDS.settings.autoSyncOnOpenToggle}
                checked={project.appSettings.autoSyncOnOpen}
                onChange={(event) => {
                    project.updateAppSettings({
                        autoSyncOnOpen: event.currentTarget.checked,
                    });
                }}
                label={<Trans>Auto-sync on open</Trans>}
                description={
                    <Trans>
                        Check for cloud updates automatically when opening a
                        linked project.
                    </Trans>
                }
            />
            <Switch
                data-testid={TESTING_IDS.settings.autoPushOnSaveToggle}
                checked={project.appSettings.autoPushOnSave}
                onChange={(event) => {
                    project.updateAppSettings({
                        autoPushOnSave: event.currentTarget.checked,
                    });
                }}
                label={<Trans>Auto-publish on save</Trans>}
                description={
                    <Trans>
                        Publish local saves to the cloud automatically for
                        linked projects.
                    </Trans>
                }
            />
        </Stack>
    );
}

/**
 * Language picker used inside the settings panel.
 *
 * The parent owns the current value and persistence behavior; this component is
 * just the localized selector UI plus the async locale activation handoff.
 */
export function LanguageSelector({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (locale: string | null) => Promise<void> | void;
}) {
    // No longer use workspace/project context here. Parent should pass `value` and `onChange`.
    // const { i18n } = useLingui(); // Hook to access Lingui's i18n object

    // internal handler: if parent provided an onChange, call it; otherwise just activate the locale
    const internalHandleLanguageChange = async (locale: string | null) => {
        if (!locale) return;

        await onChange(locale);
    };

    // always use the internal handler which knows how to call parent onChange if provided
    const handleLanguageChange = internalHandleLanguageChange;

    const data = Object.entries(GET_LOCALES()).map(([key, value]) => ({
        value: key,
        label: value.nativeName,
        direction: value.direction,
    }));
    return (
        <Stack gap="xs">
            <Text
                data-testid={TESTING_IDS.settings.languageSelectorLabel}
                size="md"
                mb="2"
                fw={500}
            >
                <Trans>Interface Localization</Trans>
            </Text>
            <Select
                data-testid={TESTING_IDS.settings.languageSelector}
                radius={"lg"}
                styles={{
                    root: {
                        border: "none",
                    },
                    input: {
                        paddingBlock: "var(--mantine-spacing-lg)",
                    },
                }}
                leftSection={
                    <Languages style={{ width: rem(20), height: rem(20) }} />
                }
                leftSectionPointerEvents="none"
                classNames={{
                    root: styles.root,
                    input: styles.input,
                    dropdown: styles.dropdown,
                }}
                value={value ?? null} // prefer passed value; no project-context fallback
                onChange={handleLanguageChange}
                data={data.map((item) => ({
                    value: item.value,
                    // msg defined even if default form lingui
                    label: i18n._(item.label),
                    direction: item.direction,
                }))}
            />
        </Stack>
    );
}

function resolveCreateRemoteErrorMessage(args: {
    error: unknown;
    suggestedName: string;
    fallback: string;
}): string {
    if (isDuplicateRemoteRepoNameError(args.error)) {
        return `A cloud project named "${args.suggestedName}" already exists in your account. Attach the existing cloud project instead.`;
    }

    return args.error instanceof Error ? args.error.message : args.fallback;
}

function isDuplicateRemoteRepoNameError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /repository with the same name already exists/i.test(message);
}
