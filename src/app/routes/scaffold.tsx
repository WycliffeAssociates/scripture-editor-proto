import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import {
    createFileRoute,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useEffectOnce } from "react-use";
import { processFile } from "@/app/domain/api/import.tsx";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";

export const Route = createFileRoute("/scaffold")({
    validateSearch: (
        search: Partial<Record<string, unknown>>,
    ): { url?: string } => {
        return { url: search.url as string | undefined };
    },
    component: RouteComponent,
});

function RouteComponent() {
    const { t } = useLingui();
    const search = Route.useSearch();
    const router = useRouter();
    const invalidateRouterAndReload = useCallback(
        () => router.invalidate(),
        [router],
    );
    const { directoryProvider, projectRepository, md5Service } =
        router.options.context;
    const { projects: initialProjects } = useLoaderData({ from: "__root__" });
    const projectImporter = new ProjectImporter(
        directoryProvider,
        projectRepository,
        md5Service,
    );
    const [url, setUrl] = useState(search.url || "");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [progressMessage, setProgressMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const processScaffold = useCallback(
        async (targetUrl: string) => {
            setError("");
            setSuccessMessage("");
            setProgressMessage(t`Downloading scaffold ZIP...`); // Localize text
            setLoading(true);

            try {
                const response = await fetch(targetUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                setProgressMessage(t`Processing scaffold ZIP...`); // Localize text
                const arrayBuffer = await response.arrayBuffer();
                const scaffoldFile = new File([arrayBuffer], "scaffold.zip", {
                    type: "application/zip",
                });

                await processFile(scaffoldFile, {
                    directoryProvider,
                    projectImporter,
                    invalidateRouterAndReload,
                });
                setSuccessMessage(t`Scaffold process completed successfully!`); // Localize text
                setProgressMessage("");
                ShowNotificationSuccess({
                    notification: {
                        message: t`Scaffold project created successfully! We will now navigate to the project.`,
                        title: t`Success`,
                    },
                });
                const newProjects = await projectRepository.listProjects();
                const newProjectAdded = newProjects.find(
                    (project) =>
                        !initialProjects.find(
                            (p) =>
                                p.projectDirectoryPath ===
                                project.projectDirectoryPath,
                        ),
                );
                if (newProjectAdded) {
                    router.navigate({
                        to: `/$project`,
                        params: {
                            project: newProjectAdded.projectDirectoryPath,
                        },
                        replace: true,
                    });
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : t`An unknown error occurred`, // Localize text
                );
                setProgressMessage("");
                ShowErrorNotification({
                    notification: {
                        message:
                            err instanceof Error
                                ? err.message
                                : t`An unknown error occurred`,
                        title: t`Scaffold Error`,
                    },
                });
            } finally {
                setLoading(false);
            }
        },
        [
            t,
            directoryProvider,
            projectImporter,
            initialProjects,
            router,
            invalidateRouterAndReload,
            projectRepository,
        ],
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await processScaffold(url);
    };

    useEffectOnce(() => {
        if (search.url) {
            setUrl(search.url);
            processScaffold(search.url);
        } else {
            router.navigate({ to: "/" });
        }
    });

    const isLoading = loading;
    const showForm = !search.url || !isLoading;

    return (
        <Stack p="md" w="100%" h="100%">
            <Text size="xl" fw={500} mb="md">
                <Trans>Scaffold from WACS URL</Trans>
            </Text>

            {showForm ? (
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={<Trans>WACS ZIP URL</Trans>}
                            placeholder="https://content.bibletranslationtools.org/WA-Catalog/en_ulb/src/branch/cro-release-v24.07"
                            value={url}
                            onChange={(e) => setUrl(e.currentTarget.value)}
                            disabled={isLoading}
                            size="md"
                        />

                        {error && (
                            <Text c="red" size="sm">
                                {error}
                            </Text>
                        )}

                        <Group justify="right">
                            <Button
                                type="submit"
                                loading={isLoading}
                                disabled={isLoading}
                                size="md"
                            >
                                <Trans>Scaffold Project</Trans>
                            </Button>
                        </Group>
                    </Stack>
                </form>
            ) : (
                <Stack gap="md">
                    {progressMessage && (
                        <Text c="blue" size="sm">
                            {progressMessage}
                        </Text>
                    )}
                    {error && (
                        <Text c="red" size="sm">
                            {error}
                        </Text>
                    )}
                    {successMessage && (
                        <Text c="green" size="sm">
                            {successMessage}
                        </Text>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
