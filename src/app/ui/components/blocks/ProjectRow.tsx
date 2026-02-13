import { useLingui } from "@lingui/react/macro";
import {
    ActionIcon,
    Button,
    Group,
    Modal,
    Text,
    TextInput,
} from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { Check, Pencil, Trash, X } from "lucide-react";
import { useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import { deleteProjectByPath, upsertProject } from "@/app/db/api.ts";
import { Route as projectRoute } from "@/app/routes/$project.tsx";
import * as styles from "@/app/ui/styles/modules/ProjectRow.css.ts";
import type { ListedProject } from "@/core/persistence/ProjectRepository.ts";

type Props = {
    project: ListedProject;
    /**
     * Called to refresh the UI after a change (e.g. rename).
     * Typically index.tsx passes a function that invalidates the route.
     */
    invalidateRouterAndReload: () => void;
    /**
     * Settings manager is used when clicking the project link to persist
     * last project path. Kept typed as any because the app's settings manager
     * surface is external to this component.
     */
    settingsManager: SettingsManager;
    className?: string;
};

/**
 * ProjectRow (Mantine)
 *
 * Renders a project row with:
 *  - link to open project
 *  - edit action (inline input) with clearer affordance indicating you're editing the project's public name
 *  - delete action (confirmation modal) which removes the project directory and DB row
 *
 * Designed for good mobile ergonomics (no hover interactions).
 */
export default function ProjectRow({
    project,
    invalidateRouterAndReload,
    settingsManager,
    className = "",
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState<string>(project.name ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { t } = useLingui();
    const router = useRouter();
    const { projectRepository } = router.options.context;

    // Save updated project name to DB and refresh listing
    async function saveName() {
        const trimmed = (name ?? "").trim();
        if (!trimmed) return;
        setIsSaving(true);
        try {
            await upsertProject(project.projectDirectoryPath, {
                title: trimmed,
            });
            invalidateRouterAndReload();
            setIsEditing(false);
        } catch (err) {
            console.error("Failed to update project name:", err);
        } finally {
            setIsSaving(false);
        }
    }

    // Delete project: remove directory from disk via repository, then remove DB row
    async function doDelete() {
        setIsDeleting(true);
        try {
            if (
                projectRepository &&
                typeof projectRepository.deleteProject === "function"
            ) {
                await projectRepository.deleteProject(
                    project.projectDirectoryPath,
                    {
                        recursive: true,
                    },
                );
            }
        } catch (e) {
            console.error("Failed to delete project:", e);
        }
        // remove DB row
        try {
            await deleteProjectByPath(project.projectDirectoryPath);
            setIsDeleting(false);
            setConfirmOpen(false);
            invalidateRouterAndReload();
        } catch (dbErr) {
            console.error("Failed to delete project row from DB:", dbErr);
            // we continue; directory already removed
        } finally {
            setIsDeleting(false);
        }
    }

    const diskProjectName = project.projectDirectoryPath.split("/").pop();
    if (!diskProjectName) {
        return null;
    }
    return (
        <>
            <div className={`${styles.row} ${className}`}>
                {!isEditing ? (
                    <>
                        <Link
                            to={projectRoute.id}
                            params={{ project: diskProjectName }}
                            onClick={() => {
                                settingsManager?.update?.({
                                    lastProjectPath:
                                        project.projectDirectoryPath,
                                });
                            }}
                            className={styles.projectLink}
                            aria-label={`Open project ${project.name}`}
                            data-testid={TESTING_IDS.project.rowLink}
                        >
                            <Text data-testid={project.name} fw={500}>
                                {project.name}
                            </Text>
                        </Link>

                        <Group gap="xs">
                            <ActionIcon
                                size="sm"
                                data-testid={TESTING_IDS.project.editButton}
                                variant="light"
                                onClick={() => setIsEditing(true)}
                                aria-label="Edit project name"
                            >
                                <Pencil size={16} />
                            </ActionIcon>

                            <ActionIcon
                                data-testid={TESTING_IDS.project.delete}
                                size="sm"
                                color="red"
                                variant="light"
                                onClick={() => setConfirmOpen(true)}
                                aria-label="Delete project"
                            >
                                <Trash size={16} />
                            </ActionIcon>
                        </Group>
                    </>
                ) : (
                    <div className={styles.editRow}>
                        <div className={styles.editInput}>
                            <TextInput
                                data-testid={TESTING_IDS.project.nameInput}
                                value={name}
                                onChange={(e) => setName(e.currentTarget.value)}
                                placeholder={t`Project display name`}
                                aria-label={`Project display name for ${project.projectDirectoryPath}`}
                            />
                        </div>
                        <Button
                            leftSection={<Check />}
                            color="green"
                            data-testid={TESTING_IDS.project.saveName}
                            onClick={saveName}
                            loading={isSaving}
                        >
                            {t`Save`}
                        </Button>
                        <Button
                            leftSection={<X />}
                            variant="default"
                            onClick={() => {
                                setIsEditing(false);
                                setName(project.name ?? "");
                            }}
                        >
                            {t`Cancel`}
                        </Button>
                    </div>
                )}
            </div>

            <Modal
                opened={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                title={t`Delete project`}
                centered
            >
                <Text>
                    {t`Are you sure you want to delete the project:`}{" "}
                    <strong>{project.name}</strong>?
                </Text>
                <Text mt="sm">
                    {t`This will remove files from disk and delete the project's metadata from the local database.`}
                </Text>
                <Group justify="right" mt="md">
                    <Button
                        variant="default"
                        onClick={() => setConfirmOpen(false)}
                    >{t`Cancel`}</Button>
                    <Button
                        color="red"
                        data-testid={TESTING_IDS.project.deleteConfirm}
                        onClick={doDelete}
                        loading={isDeleting}
                    >{t`Delete`}</Button>
                </Group>
            </Modal>
        </>
    );
}
