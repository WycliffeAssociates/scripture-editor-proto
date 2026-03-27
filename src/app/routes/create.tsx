import { Trans, useLingui } from "@lingui/react/macro";
import { Anchor, Button, Container, Group, Stack, Title } from "@mantine/core";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createProjectImportFacade } from "@/app/domain/api/import.ts";
import {
    buildPersistentImportSuccessNotification,
    getProjectParamFromImportedPath,
    resolveImportErrorMessage,
} from "@/app/routes/createRouteHelpers.ts";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
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

function CreateProject() {
    const { t } = useLingui();
    const router = useRouter();

    const { settingsManager, importService } = router.options.context;
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
            </Stack>
        </Container>
    );
}
