import { Trans, useLingui } from "@lingui/react/macro";
import {
    createFileRoute,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
    handleDownload,
    handleOpenDirectory,
    handleOpenFile,
} from "@/app/domain/api/import.tsx";
import ProjectCreator from "@/app/ui/components/blocks/ProjectCreator.tsx";
import ProjectRow from "@/app/ui/components/blocks/ProjectRow.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import {
    ShowErrorNotification,
    ShowImportStartedNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import type { ListedProject } from "@/core/persistence/ProjectRepository.ts";
import { loadLocale } from "../ui/i18n/loadLocale.tsx";

export const Route = createFileRoute("/")({
    component: Index,
    pendingComponent: () => (
        <div>
            <Trans>
                <span>Loading...</span>
            </Trans>
        </div>
    ),
    pendingMs: 100,
    loader: async ({ context }) => {
        console.time("total time");
        // start here would prefer to wrap into a single abstraction
        const { directoryProvider } = context;
        return { directoryProvider: directoryProvider };
    },
});

declare module "react" {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        webkitdirectory?: string;
    }
}

// ls the app data dir and show as projects
function Index() {
    const { t } = useLingui();
    const { directoryProvider } = Route.useLoaderData();
    const router = useRouter();
    const invalidateRouterAndReload = () => router.invalidate();

    const { projects } = useLoaderData({ from: "__root__" });

    // Pull context values early so nested components can reference them.
    const { settingsManager, projectRepository, md5Service } =
        useRouter().options.context;
    const [currentLanguage, setCurrentLanguage] = useState<string | null>(
        settingsManager.get("appLanguage"),
    );
    const [isImporting, setIsImporting] = useState(false);
    const projectImporter = new ProjectImporter(
        directoryProvider,
        projectRepository,
        md5Service,
    );

    const groupedIntoLangName = projects.reduce(
        (acc, project) => {
            // Group projects by language and name
            const key = `${project.metadata.language.name}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(project);
            return acc;
        },
        {} as Record<string, ListedProject[]>,
    );

    const onDownload = async (url: string) => {
        try {
            setIsImporting(true);
            ShowImportStartedNotification({
                notification: {
                    message: t`Downloading repository...`,
                    title: t`Download Started`,
                },
            });

            await handleDownload(
                { importer: projectImporter, invalidateRouterAndReload },
                url,
            );
            ShowNotificationSuccess({
                notification: {
                    message: t`Project downloaded successfully!`,
                    title: t`Success`,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Failed to download project`,
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

            await handleOpenDirectory(event, {
                directoryProvider,
                projectImporter,
                invalidateRouterAndReload,
            });
            ShowNotificationSuccess({
                notification: {
                    message: t`Directory imported successfully!`,
                    title: t`Success`,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Failed to import directory`,
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

            await handleOpenFile(event, {
                directoryProvider,
                projectImporter,
                invalidateRouterAndReload,
            });
            ShowNotificationSuccess({
                notification: {
                    message: t`File imported successfully!`,
                    title: t`Success`,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Failed to import file`,
                    title: t`Import Error`,
                },
            });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-2xl font-bold">
                    <Trans>Current Projects</Trans>
                </h1>
                <div className="ml-4">
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
            </div>
            <ul className="flex flex-col gap-3">
                {Object.entries(groupedIntoLangName).map(
                    ([langName, langProjects]) => (
                        <li key={langName}>
                            <h2
                                data-testid={`project-list-${langName.toLowerCase()}`}
                                className="text-xl font-semibold"
                            >
                                {langName}
                            </h2>
                            <ul className="ml-4" data-testid="project-list">
                                {langProjects.map((project) => (
                                    <li key={project.projectDirectoryPath}>
                                        <ProjectRow
                                            project={project}
                                            invalidateRouterAndReload={
                                                invalidateRouterAndReload
                                            }
                                            settingsManager={settingsManager}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ),
                )}
            </ul>

            <div className="mt-8">
                <ProjectCreator
                    onDownload={onDownload}
                    onOpenDirectory={onOpenDirectory}
                    onOpenFile={onOpenFile}
                    isDownloadDisabled={isImporting}
                    isImporting={isImporting}
                />
            </div>
        </div>
    );
}
