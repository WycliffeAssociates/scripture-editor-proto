import { Trans } from "@lingui/react/macro";
import {
    Box,
    Button,
    Container,
    Group,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import {
    createFileRoute,
    Link,
    useLoaderData,
    useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import ProjectRow from "@/app/ui/components/blocks/ProjectRow.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";

/**
 * Home/library landing route for editable scripture items.
 *
 * The broader index/catalog can contain more item types, but this route presents
 * the current editable-project slice that leads into the main scripture workspace.
 */
export const Route = createFileRoute("/")({
    component: IndexRoute,
});

function IndexRoute() {
    const router = useRouter();
    const { projects } = useLoaderData({ from: "__root__" });
    const { settingsManager } = router.options.context;
    const [currentLanguage, setCurrentLanguage] = useState<string | null>(
        settingsManager.get("appLanguage"),
    );
    const byLanguage = projects.reduce(
        (acc, project) => {
            const languageName = project.languageName;
            if (!acc[languageName]) {
                acc[languageName] = [];
            }
            acc[languageName].push(project);
            return acc;
        },
        {} as Record<string, typeof projects>,
    );
    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                        <Title order={2}>
                            <Trans>Current Projects</Trans>
                        </Title>
                        <Text c="dimmed">
                            <Trans>
                                Open an existing project, or create a new one.
                            </Trans>
                        </Text>
                    </Stack>
                    <Stack gap="sm" align="stretch">
                        <Button component={Link} to="/create">
                            <Trans>New Project</Trans>
                        </Button>
                        <Box miw="20rem" maw="22rem">
                            <LanguageSelector
                                onChange={async (val) => {
                                    if (!val) return;
                                    settingsManager.set("appLanguage", val);
                                    await loadLocale(val);
                                    settingsManager.applySettings?.();
                                    setCurrentLanguage(val);
                                }}
                                value={currentLanguage}
                            />
                        </Box>
                    </Stack>
                </Group>

                {projects.length === 0 ? (
                    <Stack gap="md">
                        <Text>
                            <Trans>No projects yet</Trans>
                        </Text>
                        <Group>
                            <Button component={Link} to="/create">
                                <Trans>Create your first project</Trans>
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Stack gap="sm">
                        {Object.entries(byLanguage)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([languageName, projectsForLanguage]) => (
                                <Stack key={languageName} gap="sm">
                                    <h2>{languageName}</h2>
                                    {projectsForLanguage.map((project) => (
                                        <ProjectRow
                                            key={project.projectPath}
                                            project={project}
                                            settingsManager={settingsManager}
                                            invalidateRouterAndReload={() => {
                                                void router.invalidate();
                                            }}
                                        />
                                    ))}
                                </Stack>
                            ))}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
