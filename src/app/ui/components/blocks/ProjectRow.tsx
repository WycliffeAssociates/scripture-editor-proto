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
import { Route as projectRoute } from "@/app/routes/$project.tsx";
import * as styles from "@/app/ui/styles/modules/ProjectRow.css.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

type Props = {
    project: ProjectListItem;
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
 * Row view for one editable scripture item in legacy project-list surfaces.
 *
 * This component predates the newer typed library-item vocabulary, but its
 * runtime job is still straightforward: open the current editable scripture
 * route, rename the user-facing display name, or delete the managed item.
 */
export default function ProjectRow({
    project,
    invalidateRouterAndReload,
    settingsManager,
    className = "",
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState<string>(project.displayName ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { t } = useLingui();
    const router = useRouter();
    const { projectsService } = router.options.context;

    async function saveName() {
        const trimmed = (name ?? "").trim();
        if (!trimmed) return;
        setIsSaving(true);
        try {
            await projectsService.renameDisplayName(
                project.projectPath,
                trimmed,
            );
            invalidateRouterAndReload();
            setIsEditing(false);
        } catch (err) {
            console.error("Failed to update project name:", err);
        } finally {
            setIsSaving(false);
        }
    }

    async function doDelete() {
        setIsDeleting(true);
        try {
            await projectsService.deleteProject(project.projectPath);
            setIsDeleting(false);
            setConfirmOpen(false);
            invalidateRouterAndReload();
        } catch (e) {
            console.error("Failed to delete project:", e);
        } finally {
            setIsDeleting(false);
        }
    }

    const diskProjectName = project.folderName;
    if (!diskProjectName) {
        return null;
    }
    return (
        <>
            <div
                className={`${styles.row} ${className}`}
                data-testid={TESTING_IDS.project.list}
            >
                {!isEditing ? (
                    <>
                        <Link
                            to={projectRoute.id}
                            params={{ project: diskProjectName }}
                            onClick={() => {
                                settingsManager?.update?.({
                                    lastProjectPath: project.projectPath,
                                });
                            }}
                            className={styles.projectLink}
                            aria-label={`Open project ${project.displayName}`}
                            data-testid={TESTING_IDS.project.rowLink}
                        >
                            <Text data-testid={project.displayName} fw={500}>
                                {project.displayName}
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
                                aria-label={`Project display name for ${project.projectPath}`}
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
                                setName(project.displayName ?? "");
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
                    <strong>{project.displayName}</strong>?
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
