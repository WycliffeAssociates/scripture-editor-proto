import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjectImportFacade } from "@/app/domain/api/import.ts";
import { GIT_REMOTE_DEFAULT_TOPIC } from "@/app/domain/project/gitRemoteProjectService.ts";
import { ProjectImportHub } from "@/app/ui/components/blocks/ProjectImportHub/ProjectImportHub.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import {
    hideNotification,
    ShowErrorNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { useGiteaLogin } from "@/app/ui/hooks/useGiteaLogin.ts";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/createRoute.css.ts";
import {
    buildPersistentImportSuccessNotification,
    getProjectParamFromImportedPath,
    resolveImportErrorMessage,
} from "@/app/utils/createRouteHelpers.ts";
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
    const [cloudSessionUsername, setCloudSessionUsername] = useState<
        string | null
    >(null);
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
        requiresMetadataReview = false,
    }: {
        importedProject: ProjectListItem | null | undefined;
        message: string;
        isEditableProject: boolean;
        requiresMetadataReview?: boolean;
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
                        <button
                            type="button"
                            className={styles.notificationLink}
                            onClick={() => {
                                settingsManager?.update?.({
                                    lastProjectPath: importedPath ?? "",
                                });
                                router.navigate({
                                    to: requiresMetadataReview
                                        ? "/$project/metadata"
                                        : "/$project",
                                    params: { project: projectParam },
                                    ...(requiresMetadataReview
                                        ? {
                                              search: {
                                                  issues: "open" as const,
                                              },
                                          }
                                        : {}),
                                });
                            }}
                        >
                            {requiresMetadataReview ? (
                                <Trans>Review metadata</Trans>
                            ) : (
                                <Trans>Open project</Trans>
                            )}
                        </button>
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

    const resetCloudRepoState = useCallback(() => {
        setCloudError(null);
    }, []);

    const disconnectCloudAccount = useCallback(async () => {
        try {
            setIsDisconnectingCloudAccount(true);
            await authSessionProvider.logoutCurrentSession();
            setCloudSessionUsername(null);
            resetCloudRepoState();
            setCloudError(null);
            ShowNotificationInfo({
                notification: {
                    title: t`Cloud account logged out`,
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
    }, [authSessionProvider, resetCloudRepoState, t]);

    const {
        loginUsername,
        loginPassword,
        loginOtp,
        setLoginUsername: onLoginUsernameChange,
        setLoginPassword: onLoginPasswordChange,
        setLoginOtp: onLoginOtpChange,
        isRunningConnect: isConnectingCloudAccount,
        handleConnect: connectCloudAccount,
    } = useGiteaLogin({
        authSessionProvider,
        giteaHostBaseUrl,
        onSuccess: (username) => {
            setCloudSessionUsername(username);
            resetCloudRepoState();
        },
    });

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
                message: importedProject.requiresMetadataReview
                    ? t`Project imported successfully. Metadata needs review before opening it.`
                    : importedProject.isEditableProject === false
                      ? t`Resource imported successfully! It is available in the reference picker.`
                      : t`Cloud project imported successfully!`,
                isEditableProject: importedProject.isEditableProject,
                requiresMetadataReview: importedProject.requiresMetadataReview,
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
                    ? importedProject.requiresMetadataReview
                        ? t`Project downloaded successfully. Metadata needs review before opening it.`
                        : t`Project downloaded successfully!`
                    : t`Resource downloaded successfully! It is available in the reference picker.`,
                isEditableProject: importedProject.isEditableProject,
                requiresMetadataReview: importedProject.requiresMetadataReview,
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
                message: importedProject?.requiresMetadataReview
                    ? t`Project imported successfully. Metadata needs review before opening it.`
                    : importedProject?.isEditableProject === false
                      ? t`Resource imported successfully! It is available in the reference picker.`
                      : t`Directory imported successfully!`,
                isEditableProject: importedProject?.isEditableProject ?? false,
                requiresMetadataReview: importedProject?.requiresMetadataReview,
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
                message: importedProject?.requiresMetadataReview
                    ? t`Project imported successfully. Metadata needs review before opening it.`
                    : importedProject?.isEditableProject === false
                      ? t`Resource imported successfully! It is available in the reference picker.`
                      : t`File imported successfully!`,
                isEditableProject: importedProject?.isEditableProject ?? false,
                requiresMetadataReview: importedProject?.requiresMetadataReview,
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
                      message: importedProject.requiresMetadataReview
                          ? t`Project imported successfully. Metadata needs review before opening it.`
                          : importedProject.isEditableProject === false
                            ? t`Resource imported successfully! It is available in the reference picker.`
                            : t`Directory imported successfully!`,
                      isEditableProject: importedProject.isEditableProject,
                      requiresMetadataReview:
                          importedProject.requiresMetadataReview,
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
                      message: importedProject.requiresMetadataReview
                          ? t`Project imported successfully. Metadata needs review before opening it.`
                          : importedProject.isEditableProject === false
                            ? t`Resource imported successfully! It is available in the reference picker.`
                            : t`File imported successfully!`,
                      isEditableProject: importedProject.isEditableProject,
                      requiresMetadataReview:
                          importedProject.requiresMetadataReview,
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
        <main className={styles.page}>
            <section className={styles.shell}>
                <header className={styles.header}>
                    <div className={styles.titleBlock}>
                        <Link
                            to="/"
                            className={styles.backLink}
                            aria-label={t`Back to projects`}
                        >
                            <ArrowLeft size={16} />
                            <Trans>Projects</Trans>
                        </Link>
                        <h1 className={styles.pageTitle}>
                            <Trans>New Project</Trans>
                        </h1>
                    </div>

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
                </header>

                <ProjectImportHub
                    onDownload={onDownload}
                    isDownloadDisabled={isImporting}
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
                    hostBaseUrl={giteaHostBaseUrl}
                    remoteRepoTopic={GIT_REMOTE_DEFAULT_TOPIC}
                    sessionUsername={cloudSessionUsername}
                    isImporting={isImporting}
                    isConnecting={isConnectingCloudAccount}
                    isDisconnecting={isDisconnectingCloudAccount}
                    loginUsername={loginUsername}
                    loginPassword={loginPassword}
                    loginOtp={loginOtp}
                    error={cloudError}
                    projectsService={projectsService}
                    onLoginUsernameChange={onLoginUsernameChange}
                    onLoginPasswordChange={onLoginPasswordChange}
                    onLoginOtpChange={onLoginOtpChange}
                    onConnect={() => {
                        void connectCloudAccount();
                    }}
                    onDisconnect={() => {
                        void disconnectCloudAccount();
                    }}
                    onCloneRepo={(repo) => {
                        void cloneCloudRepo(repo);
                    }}
                />
            </section>
        </main>
    );
}
