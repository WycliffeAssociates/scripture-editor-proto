import { Trans } from "@lingui/react/macro";
import { Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import {
    createFileRoute,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import ProjectRow from "@/app/ui/components/blocks/ProjectRow.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
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
});

declare module "react" {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        webkitdirectory?: string;
    }
}

// ls the app data dir and show as projects
function Index() {
    const router = useRouter();
    const invalidateRouterAndReload = () => router.invalidate();

    const { projects } = useLoaderData({ from: "__root__" });
    // Pull context values early so nested components can reference them.
    const { settingsManager } = useRouter().options.context;
    const [currentLanguage, setCurrentLanguage] = useState<string | null>(
        settingsManager.get("appLanguage"),
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

    return (
        <Container size="lg" p="xl">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start" gap="md">
                    <div>
                        <Title order={1}>
                            <Trans>Projects</Trans>
                        </Title>
                        <Text c="dimmed">
                            <Trans>
                                Open an existing project, or create a new one.
                            </Trans>
                        </Text>
                    </div>

                    <Group gap="md">
                        <Button
                            onClick={() => router.navigate({ to: "/create" })}
                            data-testid={
                                TESTING_IDS.onboarding.newProjectButton
                            }
                        >
                            <Trans>New Project</Trans>
                        </Button>

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
                    </Group>
                </Group>

                {projects.length === 0 ? (
                    <Stack gap="sm" maw={560}>
                        <Title order={2}>
                            <Trans>No projects yet</Trans>
                        </Title>
                        <Text c="dimmed">
                            <Trans>
                                Create a project by searching for a repository,
                                uploading a folder, or selecting a ZIP file.
                            </Trans>
                        </Text>
                        <Button
                            onClick={() => router.navigate({ to: "/create" })}
                            w="max-content"
                        >
                            <Trans>Create your first project</Trans>
                        </Button>
                    </Stack>
                ) : (
                    <Stack gap="lg">
                        {Object.entries(groupedIntoLangName).map(
                            ([langName, langProjects]) => (
                                <Stack gap="xs" key={langName}>
                                    <Title
                                        order={3}
                                        data-testid={TEST_ID_GENERATORS.projectListGroup(
                                            langName,
                                        )}
                                    >
                                        {langName}
                                    </Title>

                                    <Stack
                                        gap="xs"
                                        data-testid={TESTING_IDS.project.list}
                                    >
                                        {langProjects.map((project) => (
                                            <ProjectRow
                                                key={
                                                    project.projectDirectoryPath
                                                }
                                                project={project}
                                                invalidateRouterAndReload={
                                                    invalidateRouterAndReload
                                                }
                                                settingsManager={
                                                    settingsManager
                                                }
                                            />
                                        ))}
                                    </Stack>
                                </Stack>
                            ),
                        )}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
