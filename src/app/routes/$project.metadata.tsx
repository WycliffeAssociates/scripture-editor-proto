import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { Alert } from "@/app/ui/components/primitives/Alert/Alert.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { Checkbox } from "@/app/ui/components/primitives/Checkbox/Checkbox.tsx";
import { TextInput } from "@/app/ui/components/primitives/Input/Input.tsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/app/ui/components/primitives/Table/Table.tsx";
import { Textarea } from "@/app/ui/components/primitives/Textarea/Textarea.tsx";
import * as styles from "@/app/ui/styles/modules/MetadataPage.css.ts";
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
        return (
            <div className={styles.metadataCard}>
                Project metadata not found.
            </div>
        );
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
        <div className={styles.metadataPage}>
            <div className={styles.metadataHeader}>
                <div className={styles.metadataHeaderLeft}>
                    <div className={styles.metadataTitleRow}>
                        <h2 className={styles.metadataSectionTitle}>
                            Metadata
                        </h2>
                        <span className={styles.badge}>
                            {editorDocument.draft.kind}
                        </span>
                    </div>
                    <span className={styles.metadataSubtitle}>
                        Edit the supported metadata subset for this project.
                    </span>
                </div>
                <div className={styles.metadataHeaderRight}>
                    <Button
                        variant="secondary"
                        onClick={() =>
                            navigate({
                                to: "/$project",
                                params: { project },
                            })
                        }
                    >
                        Back to Project
                    </Button>
                    <Button onClick={saveDraft} disabled={isSaving}>
                        Save Metadata
                    </Button>
                </div>
            </div>

            {showIssues ? <IssuePanel issues={editorDocument.issues} /> : null}
            {saveError ? (
                <Alert color="red" icon={<AlertCircle size={16} />}>
                    {saveError}
                </Alert>
            ) : null}

            <div className={styles.metadataCard}>
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
            </div>
        </div>
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
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                }}
            >
                <span style={{ fontWeight: 600 }}>Metadata issues</span>
                {issues.map((issue) => (
                    <div key={`${issue.fieldPath}-${issue.message}`}>
                        <span style={{ fontSize: "0.875rem" }}>
                            {issue.message}
                        </span>
                        <span
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--color-onSurfaceTertiary)",
                            }}
                        >
                            {issue.fieldPath}
                            {issue.suggestedValue
                                ? ` -> Suggested: ${issue.suggestedValue}`
                                : ""}
                        </span>
                    </div>
                ))}
            </div>
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
        <div className={styles.metadataSection}>
            <h4 className={styles.metadataSectionTitle}>Language</h4>
            <div className={styles.formRowGrow}>
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
            </div>

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

            <div className={styles.metadataHeader}>
                <h4 className={styles.metadataSectionTitle}>Projects</h4>
                {suggestedProjects.length > 0 ? (
                    <Button
                        size="xs"
                        variant="light"
                        onClick={applyAllSuggestedProjects}
                    >
                        Apply All Suggestions
                    </Button>
                ) : null}
            </div>
            <Table striped withBorder>
                <TableHead>
                    <TableRow>
                        <TableHeader>Title</TableHeader>
                        <TableHeader>Identifier</TableHeader>
                        <TableHeader>Sort</TableHeader>
                        <TableHeader>Path</TableHeader>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {draft.projects.map((project, index) => {
                        const hasSuggestion =
                            project.suggestedIdentifier ||
                            project.suggestedSort ||
                            project.suggestedPath;

                        return (
                            <Fragment
                                key={`${project.identifier}-${project.title}-${index}`}
                            >
                                <TableRow>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                </TableRow>
                                {hasSuggestion ? (
                                    <TableRow>
                                        <TableCell />
                                        <TableCell>
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--color-onSurfaceTertiary)",
                                                }}
                                            >
                                                Suggested:{" "}
                                                {project.suggestedIdentifier ??
                                                    project.identifier ??
                                                    "(empty)"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--color-onSurfaceTertiary)",
                                                }}
                                            >
                                                Suggested:{" "}
                                                {project.suggestedSort ??
                                                    project.sort ??
                                                    "(empty)"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "center",
                                                    flexWrap: "nowrap",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--color-onSurfaceTertiary)",
                                                    }}
                                                >
                                                    Suggested:{" "}
                                                    {project.suggestedPath ??
                                                        project.path ??
                                                        "(empty)"}
                                                </span>
                                                <Button
                                                    size="xs"
                                                    variant="tertiary"
                                                    onClick={() =>
                                                        applySuggestedProject(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    Apply
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
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
        <div className={styles.metadataSection}>
            <h4 className={styles.metadataSectionTitle}>Language</h4>
            <div className={styles.formRowGrow}>
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
            </div>
            <div className={styles.formRowGrow}>
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
            </div>

            <div className={styles.formRowGrow}>
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
            </div>

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

            <h4 className={styles.metadataSectionTitle}>Ingredients</h4>
            <Table striped withBorder>
                <TableHead>
                    <TableRow>
                        <TableHeader>Path</TableHeader>
                        <TableHeader>Book Code</TableHeader>
                        <TableHeader>Title</TableHeader>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {draft.ingredients.map((ingredient, index) => (
                        <TableRow key={`${ingredient.path}-${index}`}>
                            <TableCell>
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
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
