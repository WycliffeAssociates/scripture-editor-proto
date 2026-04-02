import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Group,
    Paper,
    Stack,
    Table,
    Text,
    Textarea,
    TextInput,
    Title,
} from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Fragment, useState } from "react";
import type {
    MetadataEditorDocument,
    MetadataIssue,
    ResourceContainerMetadataDraft,
    ScriptureBurritoMetadataDraft,
} from "@/core/domain/project/metadataEditor.ts";

export const Route = createFileRoute("/$project/metadata")({
    validateSearch: (
        search: Partial<Record<string, unknown>>,
    ): { issues?: "open" } => ({
        issues: search.issues === "open" ? "open" : undefined,
    }),
    loader: async ({ context, params, location }) => {
        const document = await context.projectsService.loadMetadataEditor(
            params.project,
            {
                includeIssues:
                    new URLSearchParams(location.search).get("issues") ===
                    "open",
            },
        );

        return {
            document,
        };
    },
    component: MetadataRoute,
});

function MetadataRoute() {
    const { document } = Route.useLoaderData();
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const { projectsService } = Route.useRouteContext();
    const [editorDocument, setEditorDocument] =
        useState<MetadataEditorDocument | null>(document);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    if (!editorDocument) {
        return <Paper p="md">Project metadata not found.</Paper>;
    }

    const showIssues =
        search.issues === "open" || editorDocument.issues.length > 0;

    async function saveDraft() {
        if (!editorDocument) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const saved = await projectsService.saveMetadataEditor(
                project,
                editorDocument.draft,
            );
            setEditorDocument(saved);
            if (
                search.issues === "open" &&
                saved &&
                saved.issues.length === 0
            ) {
                await navigate({
                    to: "/$project",
                    params: { project },
                });
            }
        } catch (error) {
            setSaveError(
                error instanceof Error
                    ? error.message
                    : "Failed to save metadata.",
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Stack p="lg" gap="lg">
            <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                    <Group gap="sm">
                        <Title order={2}>Metadata</Title>
                        <Badge variant="light">
                            {editorDocument.draft.kind}
                        </Badge>
                    </Group>
                    <Text c="dimmed">
                        Edit the supported metadata subset for this project.
                    </Text>
                </Stack>
                <Group>
                    <Button
                        variant="default"
                        onClick={() =>
                            navigate({
                                to: "/$project",
                                params: { project },
                            })
                        }
                    >
                        Back to Project
                    </Button>
                    <Button onClick={saveDraft} loading={isSaving}>
                        Save Metadata
                    </Button>
                </Group>
            </Group>

            {showIssues ? <IssuePanel issues={editorDocument.issues} /> : null}
            {saveError ? (
                <Alert color="red" icon={<AlertCircle size={16} />}>
                    {saveError}
                </Alert>
            ) : null}

            <Paper p="md" withBorder>
                {editorDocument.draft.kind === "resource-container" ? (
                    <ResourceContainerEditor
                        draft={editorDocument.draft}
                        onChange={(draft) =>
                            setEditorDocument((current) =>
                                current
                                    ? {
                                          ...current,
                                          draft,
                                      }
                                    : current,
                            )
                        }
                    />
                ) : (
                    <ScriptureBurritoEditor
                        draft={editorDocument.draft}
                        onChange={(draft) =>
                            setEditorDocument((current) =>
                                current
                                    ? {
                                          ...current,
                                          draft,
                                      }
                                    : current,
                            )
                        }
                    />
                )}
            </Paper>
        </Stack>
    );
}

function IssuePanel({ issues }: { issues: MetadataIssue[] }) {
    if (issues.length === 0) {
        return (
            <Alert color="green" icon={<AlertCircle size={16} />}>
                No metadata issues were detected for the current supported
                rules.
            </Alert>
        );
    }

    return (
        <Alert color="red" icon={<AlertCircle size={16} />}>
            <Stack gap="xs">
                <Text fw={600}>Metadata issues</Text>
                {issues.map((issue) => (
                    <div key={`${issue.fieldPath}-${issue.message}`}>
                        <Text size="sm">{issue.message}</Text>
                        <Text size="xs" c="dimmed">
                            {issue.fieldPath}
                            {issue.suggestedValue
                                ? ` -> Suggested: ${issue.suggestedValue}`
                                : ""}
                        </Text>
                    </div>
                ))}
            </Stack>
        </Alert>
    );
}

function ResourceContainerEditor(args: {
    draft: ResourceContainerMetadataDraft;
    onChange: (draft: ResourceContainerMetadataDraft) => void;
}) {
    const { draft, onChange } = args;

    function updateProject(
        index: number,
        key: keyof ResourceContainerMetadataDraft["projects"][number],
        value: string,
    ) {
        const projects = draft.projects.map((project, currentIndex) =>
            currentIndex === index ? { ...project, [key]: value } : project,
        );
        onChange({ ...draft, projects });
    }

    function applySuggestedProject(index: number) {
        const projects = draft.projects.map((project, currentIndex) => {
            if (currentIndex !== index) return project;
            return {
                ...project,
                identifier: project.suggestedIdentifier ?? project.identifier,
                sort: project.suggestedSort ?? project.sort,
                path: project.suggestedPath ?? project.path,
            };
        });
        onChange({ ...draft, projects });
    }

    function applyAllSuggestedProjects() {
        const projects = draft.projects.map((project) => ({
            ...project,
            identifier: project.suggestedIdentifier ?? project.identifier,
            sort: project.suggestedSort ?? project.sort,
            path: project.suggestedPath ?? project.path,
        }));
        onChange({ ...draft, projects });
    }

    const suggestedProjects = draft.projects
        .map((project, index) => ({
            index,
            project,
        }))
        .filter(
            ({ project }) =>
                project.suggestedIdentifier ||
                project.suggestedSort ||
                project.suggestedPath,
        );

    return (
        <Stack gap="md">
            <Title order={4}>Language</Title>
            <Group grow>
                <TextInput
                    label="Identifier"
                    value={draft.language.identifier}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                identifier: event.currentTarget.value,
                            },
                        })
                    }
                />
                <TextInput
                    label="Title"
                    value={draft.language.title}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                title: event.currentTarget.value,
                            },
                        })
                    }
                />
                <TextInput
                    label="Direction"
                    value={draft.language.direction}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                direction: event.currentTarget.value,
                            },
                        })
                    }
                />
            </Group>

            <Textarea
                label="Description"
                minRows={3}
                value={draft.description}
                onChange={(event) =>
                    onChange({
                        ...draft,
                        description: event.currentTarget.value,
                    })
                }
            />

            <Group justify="space-between" align="center">
                <Title order={4}>Projects</Title>
                {suggestedProjects.length > 0 ? (
                    <Button
                        size="xs"
                        variant="light"
                        onClick={applyAllSuggestedProjects}
                    >
                        Apply All Suggestions
                    </Button>
                ) : null}
            </Group>
            <Table striped withTableBorder>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Title</Table.Th>
                        <Table.Th>Identifier</Table.Th>
                        <Table.Th>Sort</Table.Th>
                        <Table.Th>Path</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {draft.projects.map((project, index) => {
                        const hasSuggestion =
                            project.suggestedIdentifier ||
                            project.suggestedSort ||
                            project.suggestedPath;

                        return (
                            <Fragment
                                key={`${project.identifier}-${project.title}-${index}`}
                            >
                                <Table.Tr>
                                    <Table.Td>
                                        <TextInput
                                            value={project.title}
                                            onChange={(event) =>
                                                updateProject(
                                                    index,
                                                    "title",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TextInput
                                            value={project.identifier}
                                            onChange={(event) =>
                                                updateProject(
                                                    index,
                                                    "identifier",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TextInput
                                            value={project.sort}
                                            onChange={(event) =>
                                                updateProject(
                                                    index,
                                                    "sort",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TextInput
                                            value={project.path}
                                            onChange={(event) =>
                                                updateProject(
                                                    index,
                                                    "path",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                </Table.Tr>
                                {hasSuggestion ? (
                                    <Table.Tr>
                                        <Table.Td />
                                        <Table.Td>
                                            <Text size="xs" c="dimmed">
                                                Suggested:{" "}
                                                {project.suggestedIdentifier ??
                                                    project.identifier ??
                                                    "(empty)"}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs" c="dimmed">
                                                Suggested:{" "}
                                                {project.suggestedSort ??
                                                    project.sort ??
                                                    "(empty)"}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group
                                                justify="space-between"
                                                align="center"
                                                wrap="nowrap"
                                            >
                                                <Text size="xs" c="dimmed">
                                                    Suggested:{" "}
                                                    {project.suggestedPath ??
                                                        project.path ??
                                                        "(empty)"}
                                                </Text>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={() =>
                                                        applySuggestedProject(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    Apply
                                                </Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ) : null}
                            </Fragment>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Stack>
    );
}

function ScriptureBurritoEditor(args: {
    draft: ScriptureBurritoMetadataDraft;
    onChange: (draft: ScriptureBurritoMetadataDraft) => void;
}) {
    const { draft, onChange } = args;

    function updateIngredient(
        index: number,
        key: keyof ScriptureBurritoMetadataDraft["ingredients"][number],
        value: string,
    ) {
        const ingredients = draft.ingredients.map((ingredient, currentIndex) =>
            currentIndex === index
                ? { ...ingredient, [key]: value }
                : ingredient,
        );
        onChange({ ...draft, ingredients });
    }

    return (
        <Stack gap="md">
            <Title order={4}>Language</Title>
            <Group grow>
                <TextInput
                    label="Tag"
                    value={draft.language.tag}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                tag: event.currentTarget.value,
                            },
                        })
                    }
                />
                <TextInput
                    label="English Name"
                    value={draft.language.englishName}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                englishName: event.currentTarget.value,
                            },
                        })
                    }
                />
                <TextInput
                    label="Direction"
                    value={draft.language.direction}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                direction:
                                    event.currentTarget.value === "rtl"
                                        ? "rtl"
                                        : "ltr",
                            },
                        })
                    }
                />
            </Group>
            <Group grow>
                <TextInput
                    label="Local Name Locale"
                    value={draft.language.localNameLocale}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                localNameLocale: event.currentTarget.value,
                            },
                        })
                    }
                />
                <TextInput
                    label="Local Name"
                    value={draft.language.localName}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            language: {
                                ...draft.language,
                                localName: event.currentTarget.value,
                            },
                        })
                    }
                />
            </Group>

            <Group grow align="end">
                <TextInput
                    label="Date Created"
                    value={draft.meta.dateCreated}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            meta: {
                                ...draft.meta,
                                dateCreated: event.currentTarget.value,
                            },
                        })
                    }
                />
                <Checkbox
                    label="Confidential"
                    checked={draft.meta.confidential}
                    onChange={(event) =>
                        onChange({
                            ...draft,
                            meta: {
                                ...draft.meta,
                                confidential: event.currentTarget.checked,
                            },
                        })
                    }
                />
            </Group>

            <Textarea
                label="Localized Names JSON"
                minRows={12}
                autosize
                value={draft.localizedNamesText}
                onChange={(event) =>
                    onChange({
                        ...draft,
                        localizedNamesText: event.currentTarget.value,
                    })
                }
            />

            <Title order={4}>Ingredients</Title>
            <Table striped withTableBorder>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Path</Table.Th>
                        <Table.Th>Book Code</Table.Th>
                        <Table.Th>Title</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {draft.ingredients.map((ingredient, index) => (
                        <Table.Tr key={`${ingredient.path}-${index}`}>
                            <Table.Td>
                                <TextInput
                                    value={ingredient.path}
                                    onChange={(event) =>
                                        updateIngredient(
                                            index,
                                            "path",
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                            </Table.Td>
                            <Table.Td>
                                <TextInput
                                    value={ingredient.bookCode}
                                    onChange={(event) =>
                                        updateIngredient(
                                            index,
                                            "bookCode",
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                            </Table.Td>
                            <Table.Td>
                                <TextInput
                                    value={ingredient.title}
                                    onChange={(event) =>
                                        updateIngredient(
                                            index,
                                            "title",
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    );
}
