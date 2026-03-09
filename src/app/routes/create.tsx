import { Trans, useLingui } from "@lingui/react/macro";
import { Anchor, Button, Container, Group, Stack, Title } from "@mantine/core";
import type { NotificationData } from "@mantine/notifications";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import {
    handleDownload,
    handleOpenDirectory,
    handleOpenFile,
} from "@/app/domain/api/import.tsx";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import {
    ShowErrorNotification,
    ShowImportStartedNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/createRoute.css.ts";
import { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";

export const Route = createFileRoute("/create")({
    component: CreateProject,
});

export function getProjectParamFromImportedPath(
    importedPath: string | null | undefined,
): string | null {
    if (!importedPath) return null;
    const projectParam = importedPath.split("/").filter(Boolean).at(-1);
    return projectParam || null;
}

export function buildPersistentImportSuccessNotification(
    title: string,
    message: string,
): NotificationData {
    return {
        title,
        message,
        autoClose: false,
        withCloseButton: true,
    };
}

function getImportErrorDebugDetails(error: unknown): string[] {
    if (error instanceof Error) {
        const details: string[] = [];
        if (error.name && error.name !== "Error") {
            details.push(`name=${error.name}`);
        }
        const maybeCode = (error as { code?: unknown }).code;
        if (typeof maybeCode === "string" && maybeCode.trim().length > 0) {
            details.push(`code=${maybeCode}`);
        }
        const message = error.message?.trim();
        if (message) {
            details.push(`message=${message}`);
        }
        return details;
    }

    if (typeof error === "string" && error.trim().length > 0) {
        return [`message=${error.trim()}`];
    }
    return [];
}

export function resolveImportErrorMessage(args: {
    error: unknown;
    fallback: string;
}): string {
    if (args.error instanceof Error) {
        const trimmed = args.error.message.trim();
        if (trimmed && trimmed !== args.fallback) {
            return `${args.fallback}. ${trimmed}`;
        }
    }

    const debugDetails = getImportErrorDebugDetails(args.error);
    if (debugDetails.length > 0) {
        return `${args.fallback}. Debug: ${debugDetails.join(", ")}`;
    }
    return args.fallback;
}

function CreateProject() {
    const { t } = useLingui();
    const router = useRouter();
    const invalidateRouterAndReload = () => router.invalidate();

    const {
        settingsManager,
        directoryProvider,
        projectRepository,
        md5Service,
        gitProvider,
    } = router.options.context;

    const [currentLanguage, setCurrentLanguage] = useState<string | null>(
        settingsManager.get("appLanguage"),
    );
    const [isImporting, setIsImporting] = useState(false);
    const projectImporter = new ProjectImporter(directoryProvider);

    const showImportSuccessToast = ({
        importedPath,
        message,
    }: {
        importedPath: string | null | undefined;
        message: string;
    }) => {
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

    const onDownload = async (url: string) => {
        try {
            setIsImporting(true);
            ShowImportStartedNotification({
                notification: {
                    message: t`Downloading repository...`,
                    title: t`Download Started`,
                },
            });

            const importedPath = await handleDownload(
                {
                    importer: projectImporter,
                    projectRepository,
                    md5Service,
                    gitProvider,
                    invalidateRouterAndReload,
                },
                url,
            );
            showImportSuccessToast({
                importedPath,
                message: t`Project downloaded successfully!`,
            });
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
            ShowImportStartedNotification({
                notification: {
                    message: t`Importing directory...`,
                    title: t`Import Started`,
                },
            });

            const importedPath = await handleOpenDirectory(event, {
                directoryProvider,
                projectImporter,
                projectRepository,
                md5Service,
                gitProvider,
                invalidateRouterAndReload,
            });
            showImportSuccessToast({
                importedPath,
                message: t`Directory imported successfully!`,
            });
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
            ShowImportStartedNotification({
                notification: {
                    message: t`Importing file...`,
                    title: t`Import Started`,
                },
            });

            const importedPath = await handleOpenFile(event, {
                directoryProvider,
                projectImporter,
                projectRepository,
                md5Service,
                gitProvider,
                invalidateRouterAndReload,
            });
            showImportSuccessToast({
                importedPath,
                message: t`File imported successfully!`,
            });
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
                    onOpenDirectory={onOpenDirectory}
                    onOpenFile={onOpenFile}
                    isDownloadDisabled={isImporting}
                    isImporting={isImporting}
                />
            </Stack>
        </Container>
    );
}
