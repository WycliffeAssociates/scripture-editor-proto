import { useLingui } from "@lingui/react/macro";
import { Link, useRouter } from "@tanstack/react-router";
import { Check, Pencil, Trash, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import { Route as projectRoute } from "@/app/routes/$project.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon/ActionIcon.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
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
    const deleteDialog = typeof document === "undefined" ? null : document.body;

    useEffect(() => {
        if (!confirmOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setConfirmOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [confirmOpen]);

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
                            <span
                                className={styles.projectName}
                                data-testid={project.displayName}
                            >
                                {project.displayName}
                            </span>
                        </Link>

                        <div className={styles.actionCluster}>
                            <ActionIconSimple
                                data-testid={TESTING_IDS.project.editButton}
                                onClick={() => setIsEditing(true)}
                                aria-label="Edit project name"
                                className={styles.actionIcon}
                            >
                                <Pencil size={16} />
                            </ActionIconSimple>

                            <ActionIconSimple
                                data-testid={TESTING_IDS.project.delete}
                                onClick={() => setConfirmOpen(true)}
                                aria-label="Delete project"
                                className={styles.actionIcon}
                            >
                                <Trash size={16} />
                            </ActionIconSimple>
                        </div>
                    </>
                ) : (
                    <div className={styles.editRow}>
                        <div className={styles.editInput}>
                            <input
                                data-testid={TESTING_IDS.project.nameInput}
                                className={styles.nameInput}
                                value={name}
                                onChange={(e) => setName(e.currentTarget.value)}
                                placeholder={t`Project display name`}
                                aria-label={`Project display name for ${project.projectPath}`}
                            />
                        </div>
                        <Button
                            leftIcon={<Check size={16} />}
                            data-testid={TESTING_IDS.project.saveName}
                            onClick={saveName}
                            disabled={isSaving}
                            variant="primary"
                        >
                            {t`Save`}
                        </Button>
                        <Button
                            leftIcon={<X size={16} />}
                            variant="secondary"
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

            {confirmOpen && deleteDialog
                ? createPortal(
                      <div
                          className={styles.dialogOverlay}
                          onMouseDown={() => setConfirmOpen(false)}
                      >
                          <div
                              className={styles.dialog}
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={styles.deleteDialogTitleId}
                              aria-describedby={styles.deleteDialogBodyId}
                              onMouseDown={(event) => event.stopPropagation()}
                          >
                              <h3
                                  id={styles.deleteDialogTitleId}
                                  className={styles.dialogTitle}
                              >
                                  {t`Delete project`}
                              </h3>
                              <p
                                  id={styles.deleteDialogBodyId}
                                  className={styles.dialogBody}
                              >
                                  {t`Are you sure you want to delete the project:`}{" "}
                                  <strong>{project.displayName}</strong>?
                                  <span className={styles.dialogHint}>
                                      {t`This will remove files from disk and delete the project's metadata from the local database.`}
                                  </span>
                              </p>
                              <div className={styles.dialogActions}>
                                  <Button
                                      variant="secondary"
                                      onClick={() => setConfirmOpen(false)}
                                  >
                                      {t`Cancel`}
                                  </Button>
                                  <Button
                                      data-testid={
                                          TESTING_IDS.project.deleteConfirm
                                      }
                                      onClick={doDelete}
                                      disabled={isDeleting}
                                      variant="primary"
                                  >
                                      {t`Delete`}
                                  </Button>
                              </div>
                          </div>
                      </div>,
                      deleteDialog,
                  )
                : null}
        </>
    );
}
