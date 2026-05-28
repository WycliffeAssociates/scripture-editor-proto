import { Fragment } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
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
import type { ResourceContainerMetadataDraft } from "@/core/domain/project/metadataEditor.ts";

export function ResourceContainerEditor(args: {
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

    const suggestedProjects: {
        index: number;
        project: (typeof draft.projects)[number];
    }[] = [];
    for (let index = 0; index < draft.projects.length; index++) {
        const project = draft.projects[index];
        if (
            project.suggestedIdentifier ||
            project.suggestedSort ||
            project.suggestedPath
        ) {
            suggestedProjects.push({ index, project });
        }
    }

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
