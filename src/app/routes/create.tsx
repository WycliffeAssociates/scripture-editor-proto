import { Trans, useLingui } from "@lingui/react/macro";
import { Anchor, Button, Container, Group, Stack, Title } from "@mantine/core";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjectImportFacade } from "@/app/domain/api/import.ts";
import { GIT_REMOTE_DEFAULT_TOPIC } from "@/app/domain/project/gitRemoteProjectService.ts";
import {
    buildPersistentImportSuccessNotification,
    getProjectParamFromImportedPath,
    resolveImportErrorMessage,
} from "@/app/routes/createRouteHelpers.ts";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { CloudProjectImporter } from "@/app/ui/components/import/CloudProjectImporter.tsx";
import {
    hideNotification,
    ShowErrorNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/createRoute.css.ts";
import type { ImportProgressUpdate } from "@/core/library/ImportService.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Create/import route.
 *
 * This route stays at the app-shell level: it gathers user intent, forwards it to
 * the import facade, and reflects progress/result notifications. Import branching
 * and managed-disk shaping live below this UI layer.
 */
export const Route = createFileRoute("/create")({
    component: CreateProject,
});

export function CreateProject() {
    const { t } = useLingui();
    const router = useRouter();

    const {
        settingsManager,
        importService,
        projectsService,
        authSessionProvider,
        giteaHostBaseUrl,
    } = router.options.context;
    const importController = useMemo(
        () =>
            createProjectImportFacade({
                importService,
                invalidateRouterAndReload: () => router.invalidate(),
            }),
        [importService, router],
    );
    const directoryInputRef = useRef<HTMLInputElement | null>(null);
    const zipInputRef = useRef<HTMLInputElement | null>(null);

    const [currentLanguage, setCurrentLanguage] = useState<string | null>(
        settingsManager.get("appLanguage"),
    );
    const [isImporting, setIsImporting] = useState(false);
    const [isConnectingCloudAccount, setIsConnectingCloudAccount] =
        useState(false);
    const [cloudSessionUsername, setCloudSessionUsername] = useState<
        string | null
    >(null);
    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginOtp, setLoginOtp] = useState("");
    const [cloudRepos, setCloudRepos] = useState<RemoteRepoSummary[]>([]);
    const [cloudNextPage, setCloudNextPage] = useState<number | null>(null);
    const [hasLoadedCloudRepos, setHasLoadedCloudRepos] = useState(false);
    const [isLoadingCloudRepos, setIsLoadingCloudRepos] = useState(false);
    const [isDisconnectingCloudAccount, setIsDisconnectingCloudAccount] =
        useState(false);
    const [cloudError, setCloudError] = useState<string | null>(null);

    useEffect(() => {
        void authSessionProvider
            .getCurrentSession()
            .then((session) => {
                setCloudSessionUsername(session?.username ?? null);
            })
            .catch((error) => {
                console.error("Failed to load cloud session", error);
                setCloudSessionUsername(null);
            });
    }, [authSessionProvider]);

    const showImportGitWarningToast = (warning: string | undefined) => {
        if (!warning) return;
        ShowNotificationInfo({
            notification: {
                title: t`Version history unavailable`,
                message: warning,
                autoClose: false,
                withCloseButton: true,
            },
        });
    };
    const showImportSuccessToast = ({
        importedProject,
        message,
        isEditableProject,
    }: {
        importedProject: ProjectListItem | null | undefined;
        message: string;
        isEditableProject: boolean;
    }) => {
        if (!isEditableProject) {
            ShowNotificationSuccess({
                notification: buildPersistentImportSuccessNotification(
                    t`Success`,
                    message,
                ),
            });
            return;
        }

        const importedPath = importedProject?.projectPath;
        const projectParam = getProjectParamFromImportedPath(importedPath);
        if (!projectParam) return;

        ShowNotificationSuccess({
            notification: {
                ...buildPersistentImportSuccessNotification(
                    t`Success`,
                    message,
                ),
                message: (
                    <>
                        {message}{" "}
                        <Anchor
                            href={`/${projectParam}`}
                            onClick={(event) => {
                                event.preventDefault();
                                settingsManager?.update?.({
                                    lastProjectPath: importedPath ?? "",
                                });
                                router.navigate({
                                    to: "/$project",
                                    params: { project: projectParam },
                                });
                            }}
                        >
                            <Trans>Open project</Trans>
                        </Anchor>
                    </>
                ),
            },
        });
    };

    /**
     * Wrap one import action with the shared progress-notification lifecycle used by
     * every create/import entrypoint on this route.
     */
    const runImportWithProgress = async <T,>(
        initialMessage: string,
        run: (args: {
            onProgress: (update: ImportProgressUpdate) => void;
        }) => Promise<T>,
    ): Promise<T> => {
        const notificationId = showProgressNotification({
            title: t`Import Started`,
            message: initialMessage,
        });

        try {
            return await run({
                onProgress: ({ message }) => {
                    updateProgressNotification(notificationId, {
                        title: t`Import Started`,
                        message,
                    });
                },
            });
        } finally {
            hideNotification(notificationId);
        }
    };

    const loadCloudRepoPage = useCallback(
        async (page: number, append: boolean) => {
            if (!cloudSessionUsername) return;

            setIsLoadingCloudRepos(true);
            setCloudError(null);
            try {
                const result = await projectsService.listWritableRemoteRepos({
                    page,
                    pageSize: 20,
                    topic: GIT_REMOTE_DEFAULT_TOPIC,
                });
                setCloudRepos((previous) =>
                    append ? [...previous, ...result.repos] : result.repos,
                );
                setCloudNextPage(result.nextPage);
                setHasLoadedCloudRepos(true);
            } catch (error) {
                setCloudError(
                    error instanceof Error
                        ? error.message
                        : t`Failed to load cloud projects`,
                );
            } finally {
                setIsLoadingCloudRepos(false);
            }
        },
        [cloudSessionUsername, projectsService, t],
    );

    useEffect(() => {
        if (
            !cloudSessionUsername ||
            hasLoadedCloudRepos ||
            isLoadingCloudRepos
        ) {
            return;
        }
        void loadCloudRepoPage(1, false);
    }, [
        cloudSessionUsername,
        hasLoadedCloudRepos,
        isLoadingCloudRepos,
        loadCloudRepoPage,
    ]);

    const refreshCloudRepos = useCallback(async () => {
        await loadCloudRepoPage(1, false);
    }, [loadCloudRepoPage]);

    const loadMoreCloudRepos = useCallback(async () => {
        if (!cloudNextPage) return;
        await loadCloudRepoPage(cloudNextPage, true);
    }, [cloudNextPage, loadCloudRepoPage]);

    const disconnectCloudAccount = useCallback(async () => {
        try {
            setIsDisconnectingCloudAccount(true);
            const session = await authSessionProvider.getCurrentSession();
            if (session?.tokenId) {
                await authSessionProvider.queueTokenRevocation({
                    hostBaseUrl: session.hostBaseUrl,
                    tokenId: session.tokenId,
                    tokenName: session.tokenName,
                });
            }
            await authSessionProvider.clearSession();
            setCloudSessionUsername(null);
            setCloudRepos([]);
            setCloudNextPage(null);
            setHasLoadedCloudRepos(false);
            setCloudError(null);
            ShowNotificationInfo({
                notification: {
                    title: t`Cloud account disconnected`,
                    message: t`This device no longer has access to your cloud session.`,
                    autoClose: 4000,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    title: t`Could not disconnect cloud account`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Please try again.`,
                },
            });
        } finally {
            setIsDisconnectingCloudAccount(false);
        }
    }, [authSessionProvider, t]);

    const connectCloudAccount = useCallback(async () => {
        if (!giteaHostBaseUrl) {
            ShowErrorNotification({
                notification: {
                    title: t`Cloud login unavailable`,
                    message: t`This build is missing the configured Gitea host.`,
                },
            });
            return;
        }
        if (!loginUsername.trim() || !loginPassword) {
            ShowErrorNotification({
                notification: {
                    title: t`Enter your credentials`,
                    message: t`Username and password are required to connect your cloud account.`,
                },
            });
            return;
        }

        try {
            setIsConnectingCloudAccount(true);
            setCloudError(null);
            const session = await authSessionProvider.loginWithPassword({
                hostBaseUrl: giteaHostBaseUrl,
                username: loginUsername.trim(),
                password: loginPassword,
                otp: loginOtp.trim() || null,
            });
            setCloudSessionUsername(session.username);
            setCloudRepos([]);
            setCloudNextPage(null);
            setHasLoadedCloudRepos(false);
            setLoginPassword("");
            setLoginOtp("");
            ShowNotificationSuccess({
                notification: {
                    title: t`Cloud account connected`,
                    message: t`You can now browse your writable cloud projects.`,
                    autoClose: 4000,
                },
            });
        } catch (error) {
            console.error("Cloud login failed", error);
            const message =
                error instanceof Error
                    ? error.message
                    : t`Could not connect your cloud account.`;
            setCloudError(message);
            ShowErrorNotification({
                notification: {
                    title: t`Cloud login failed`,
                    message,
                },
            });
        } finally {
            setIsConnectingCloudAccount(false);
        }
    }, [
        authSessionProvider,
        giteaHostBaseUrl,
        loginOtp,
        loginPassword,
        loginUsername,
        t,
    ]);

    const cloneCloudRepo = async (repo: RemoteRepoSummary) => {
        try {
            setIsImporting(true);
            const importedProject = await runImportWithProgress(
                t`Importing cloud project...`,
                () => projectsService.cloneWritableRemoteProject({ repo }),
            );
            await router.invalidate();
            showImportSuccessToast({
                importedProject: importedProject.project,
                message:
                    importedProject.isEditableProject === false
                        ? t`Resource imported successfully! It is available in the reference picker.`
                        : t`Cloud project imported successfully!`,
                isEditableProject: importedProject.isEditableProject,
            });
            showImportGitWarningToast(importedProject.warning);
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message: resolveImportErrorMessage({
                        error,
                        fallback: t`Failed to import cloud project`,
                    }),
                    title: t`Import Error`,
                },
            });
        } finally {
            setIsImporting(false);
        }
    };

    const onDownload = async (url: string) => {
        try {
            setIsImporting(true);
            const importedProject = await runImportWithProgress(
                t`Downloading repository...`,
                ({ onProgress }) =>
                    importController.download(url, {
                        onProgress,
                    }),
            );
            showImportSuccessToast({
                importedProject: importedProject.project,
                message: importedProject.isEditableProject
                    ? t`Project downloaded successfully!`
                    : t`Resource downloaded successfully! It is available in the reference picker.`,
                isEditableProject: importedProject.isEditableProject,
            });
            showImportGitWarningToast(importedProject.warning);
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message: resolveImportErrorMessage({
                        error,
                        fallback: t`Failed to download project`,
                    }),
                    title: t`Download Error`,
                },
            });
        } finally {
            setIsImporting(false);
        }
    };

    const onOpenDirectory = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        try {
            setIsImporting(true);
            const importedProject = await runImportWithProgress(
                t`Importing directory...`,
                ({ onProgress }) =>
                    importController.importDirectorySelection(event, {
                        onProgress,
                    }),
            );
            showImportSuccessToast({
                importedProject: importedProject?.project,
                message:
                    importedProject?.isEditableProject === false
                        ? t`Resource imported successfully! It is available in the reference picker.`
                        : t`Directory imported successfully!`,
                isEditableProject: importedProject?.isEditableProject ?? false,
            });
            showImportGitWarningToast(importedProject?.warning);
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message: resolveImportErrorMessage({
                        error,
                        fallback: t`Failed to import directory`,
                    }),
                    title: t`Import Error`,
                },
            });
        } finally {
            setIsImporting(false);
        }
    };

    const onOpenFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setIsImporting(true);
            const importedProject = await runImportWithProgress(
                t`Importing file...`,
                ({ onProgress }) =>
                    importController.importZipSelection(event, {
                        onProgress,
                    }),
            );
            showImportSuccessToast({
                importedProject: importedProject?.project,
                message:
                    importedProject?.isEditableProject === false
                        ? t`Resource imported successfully! It is available in the reference picker.`
                        : t`File imported successfully!`,
                isEditableProject: importedProject?.isEditableProject ?? false,
            });
            showImportGitWarningToast(importedProject?.warning);
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message: resolveImportErrorMessage({
                        error,
                        fallback: t`Failed to import file`,
                    }),
                    title: t`Import Error`,
                },
            });
        } finally {
            setIsImporting(false);
        }
    };

    const onDirectoryAction = importService.pickDirectory
        ? async () => {
              try {
                  setIsImporting(true);
                  const selectedPath = await importController.pickDirectory({
                      title: t`Select folder`,
                  });
                  if (!selectedPath) return;
                  const importedProject = await runImportWithProgress(
                      t`Importing directory...`,
                      ({ onProgress }) =>
                          importController.importNativeDirectoryPath(
                              selectedPath,
                              { onProgress },
                          ),
                  );
                  showImportSuccessToast({
                      importedProject: importedProject.project,
                      message:
                          importedProject.isEditableProject === false
                              ? t`Resource imported successfully! It is available in the reference picker.`
                              : t`Directory imported successfully!`,
                      isEditableProject: importedProject.isEditableProject,
                  });
                  showImportGitWarningToast(importedProject.warning);
              } catch (error) {
                  ShowErrorNotification({
                      notification: {
                          message: resolveImportErrorMessage({
                              error,
                              fallback: t`Failed to import directory`,
                          }),
                          title: t`Import Error`,
                      },
                  });
              } finally {
                  setIsImporting(false);
              }
          }
        : () => directoryInputRef.current?.click();

    const onZipAction = importService.pickZip
        ? async () => {
              try {
                  setIsImporting(true);
                  const selectedPath = await importController.pickZip({
                      title: t`Select ZIP file`,
                  });
                  if (!selectedPath) return;
                  const importedProject = await runImportWithProgress(
                      t`Importing file...`,
                      ({ onProgress }) =>
                          importController.importNativeZipPath(selectedPath, {
                              onProgress,
                          }),
                  );
                  showImportSuccessToast({
                      importedProject: importedProject.project,
                      message:
                          importedProject.isEditableProject === false
                              ? t`Resource imported successfully! It is available in the reference picker.`
                              : t`File imported successfully!`,
                      isEditableProject: importedProject.isEditableProject,
                  });
                  showImportGitWarningToast(importedProject.warning);
              } catch (error) {
                  ShowErrorNotification({
                      notification: {
                          message: resolveImportErrorMessage({
                              error,
                              fallback: t`Failed to import file`,
                          }),
                          title: t`Import Error`,
                      },
                  });
              } finally {
                  setIsImporting(false);
              }
          }
        : () => zipInputRef.current?.click();

    return (
        <Container size="xl" className={styles.pageContainer}>
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start" gap="xl">
                    <Group
                        gap="xl"
                        align="center"
                        className={styles.titleBlock}
                    >
                        <Button
                            component={Link}
                            to="/"
                            variant="subtle"
                            leftSection={<ArrowLeft size={16} />}
                            aria-label={t`Back to projects`}
                            className={styles.backButton}
                        >
                            <Trans>Projects</Trans>
                        </Button>
                        <Title order={1} className={styles.pageTitle}>
                            <Trans>New Project</Trans>
                        </Title>
                    </Group>

                    <div className={styles.localizationBlock}>
                        <LanguageSelector
                            onChange={async (val) => {
                                if (val) {
                                    settingsManager.set("appLanguage", val);
                                    await loadLocale(val);
                                    settingsManager.applySettings?.();
                                    setCurrentLanguage(val);
                                }
                            }}
                            value={currentLanguage}
                        />
                    </div>
                </Group>

                <ProjectCreator
                    onDownload={onDownload}
                    onDirectoryAction={onDirectoryAction}
                    onZipAction={onZipAction}
                    onDirectorySelected={
                        !importService.pickDirectory
                            ? onOpenDirectory
                            : undefined
                    }
                    onZipSelected={
                        !importService.pickZip ? onOpenFile : undefined
                    }
                    directoryInputRef={directoryInputRef}
                    zipInputRef={zipInputRef}
                    isDownloadDisabled={isImporting}
                    isImporting={isImporting}
                />

                <CloudProjectImporter
                    hostBaseUrl={giteaHostBaseUrl}
                    sessionUsername={cloudSessionUsername}
                    repos={cloudRepos}
                    isLoading={isLoadingCloudRepos}
                    isImporting={isImporting}
                    isConnecting={isConnectingCloudAccount}
                    isDisconnecting={isDisconnectingCloudAccount}
                    loginUsername={loginUsername}
                    loginPassword={loginPassword}
                    loginOtp={loginOtp}
                    error={cloudError}
                    hasLoaded={hasLoadedCloudRepos}
                    hasNextPage={Boolean(cloudNextPage)}
                    onLoginUsernameChange={setLoginUsername}
                    onLoginPasswordChange={setLoginPassword}
                    onLoginOtpChange={setLoginOtp}
                    onConnect={() => {
                        void connectCloudAccount();
                    }}
                    onRefresh={() => {
                        void refreshCloudRepos();
                    }}
                    onDisconnect={() => {
                        void disconnectCloudAccount();
                    }}
                    onLoadMore={() => {
                        void loadMoreCloudRepos();
                    }}
                    onCloneRepo={(repo) => {
                        void cloneCloudRepo(repo);
                    }}
                />
            </Stack>
        </Container>
    );
}
