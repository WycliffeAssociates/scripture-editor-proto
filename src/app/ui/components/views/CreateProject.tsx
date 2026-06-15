import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { createProjectImportFacade } from "@/app/domain/api/import.ts";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { SourcePicker } from "@/app/ui/components/blocks/SourcePicker/SourcePicker.tsx";
import {
  hideNotification,
  showErrorNotification,
  showNotificationInfo,
  showNotificationSuccess,
  showProgressNotification,
  updateProgressNotification,
} from "@/app/ui/components/primitives/notifications.ts";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/createRoute.css.ts";
import {
  buildPersistentImportSuccessNotification,
  getProjectParamFromImportedPath,
  resolveImportErrorMessage,
} from "@/app/utils/createRouteHelpers.ts";
import { declaresEnglishUlbSource } from "@/core/domain/project/declaredSources.ts";
import {
  fetchConsolidatedRepos,
  getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { ImportProgressUpdate } from "@/core/library/ImportService.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Create/import view.
 *
 * This view stays at the app-shell level: it gathers user intent, forwards it to
 * the import facade, and reflects progress/result notifications. Import branching
 * and managed-disk shaping live below this UI layer. Browsing and downloading an
 * existing project is delegated to the embeddable `SourcePicker`.
 */
export function CreateProject() {
  const { t } = useLingui();
  const router = useRouter();

  const { settingsManager, importService, projectsService, giteaHostBaseUrl } =
    router.options.context;
  const importController = useMemo(
    () =>
      createProjectImportFacade({
        importService,
        invalidateRouterAndReload: () => router.invalidate(),
      }),
    [importService, router],
  );
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const [currentLanguage, setCurrentLanguage] = useState<string | null>(() =>
    settingsManager.get("appLanguage"),
  );
  const [isImporting, setIsImporting] = useState(false);

  const showImportGitWarningToast = (warning: string | undefined) => {
    if (!warning) return;
    showNotificationInfo({
      notification: {
        title: t`Version history unavailable`,
        message: warning,
        autoClose: false,
        withCloseButton: true,
      },
    });
  };
  const showImportSuccessToast = ({
    importedProject,
    message,
    isEditableProject,
    requiresMetadataReview = false,
  }: {
    importedProject: ProjectListItem | null | undefined;
    message: string;
    isEditableProject: boolean;
    requiresMetadataReview?: boolean;
  }) => {
    if (!isEditableProject) {
      showNotificationSuccess({
        notification: buildPersistentImportSuccessNotification(
          t`Success`,
          message,
        ),
      });
      return;
    }

    const importedPath = importedProject?.projectPath;
    const projectParam = getProjectParamFromImportedPath(importedPath);
    if (!projectParam) return;

    showNotificationSuccess({
      notification: {
        ...buildPersistentImportSuccessNotification(t`Success`, message),
        message: (
          <>
            {message}{" "}
            <button
              type="button"
              className={styles.notificationLink}
              onClick={() => {
                settingsManager?.update?.({
                  lastProjectPath: importedPath ?? "",
                });
                router.navigate({
                  to: requiresMetadataReview
                    ? "/$project/metadata"
                    : "/$project",
                  params: { project: projectParam },
                  ...(requiresMetadataReview
                    ? {
                        search: {
                          issues: "open" as const,
                        },
                      }
                    : {}),
                });
              }}
            >
              {requiresMetadataReview ? (
                <Trans>Review metadata</Trans>
              ) : (
                <Trans>Open project</Trans>
              )}
            </button>
          </>
        ),
      },
    });

    if (importedProject) {
      void maybeOfferEnglishUlbSource(importedProject);
    }
  };

  /**
   * When a freshly imported project declares the English ULB as its source and
   * we don't already have it, offer to download the curated copy from the
   * catalog. The catalog lookup doubles as the availability check — everything
   * in WA-Catalog is in the public data API.
   */
  const maybeOfferEnglishUlbSource = async (project: ProjectListItem) => {
    try {
      const sources = await projectsService.readDeclaredSources(
        project.projectPath,
      );
      if (!declaresEnglishUlbSource(sources)) return;

      const [projects, references, catalog] = await Promise.all([
        projectsService.listProjects(),
        projectsService.listReferenceResources(),
        fetchConsolidatedRepos(),
      ]);

      const englishUlb = catalog.find(
        (repo) =>
          repo.username.toLowerCase() === "wa-catalog" &&
          repo.repo_name.toLowerCase() === "en_ulb",
      );
      if (!englishUlb) return;

      // Heuristic dedupe: skip the offer when an English ULB-ish item is
      // already on disk. Refine once items record their origin repo.
      const alreadyHave = [...projects, ...references].some(
        (item) =>
          item.languageCode?.toLowerCase() === "en" &&
          `${item.folderName} ${item.displayName}`
            .toLowerCase()
            .includes("ulb"),
      );
      if (alreadyHave) return;

      const zipUrl = await getZipUrl(englishUlb);
      showNotificationInfo({
        notification: {
          title: t`Source text available`,
          autoClose: false,
          withCloseButton: true,
          message: (
            <>
              {t`This project lists the English ULB as its source.`}{" "}
              <button
                type="button"
                className={styles.notificationLink}
                onClick={() => {
                  void downloadSourceText(zipUrl);
                }}
              >
                <Trans>Download English ULB</Trans>
              </button>
            </>
          ),
        },
      });
    } catch (error) {
      console.error("Failed to offer source text", error);
    }
  };

  /**
   * Wrap one import action with the shared progress-notification lifecycle used by
   * every create/import entrypoint on this route.
   */
  const runImportWithProgress = async <T,>(
    initialMessage: string,
    run: (args: {
      onProgress: (update: ImportProgressUpdate) => void;
    }) => Promise<T>,
  ): Promise<T> => {
    const notificationId = showProgressNotification({
      title: t`Import Started`,
      message: initialMessage,
    });

    try {
      return await run({
        onProgress: ({ message }) => {
          updateProgressNotification(notificationId, {
            title: t`Import Started`,
            message,
          });
        },
      });
    } finally {
      hideNotification(notificationId);
    }
  };

  const onDownload = async (url: string) => {
    try {
      setIsImporting(true);
      const importedProject = await runImportWithProgress(
        t`Downloading repository...`,
        ({ onProgress }) =>
          importController.download(url, {
            onProgress,
          }),
      );
      showImportSuccessToast({
        importedProject: importedProject.project,
        message: importedProject.isEditableProject
          ? importedProject.requiresMetadataReview
            ? t`Project downloaded successfully. Metadata needs review before opening it.`
            : t`Project downloaded successfully!`
          : t`Resource downloaded successfully! It is available in the reference picker.`,
        isEditableProject: importedProject.isEditableProject,
        requiresMetadataReview: importedProject.requiresMetadataReview,
      });
      showImportGitWarningToast(importedProject.warning);
    } catch (error) {
      showErrorNotification({
        notification: {
          message: resolveImportErrorMessage({
            error,
            fallback: t`Failed to download project`,
          }),
          title: t`Download Error`,
        },
      });
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Download a declared source text. Unlike a project import, this is reference
   * material for the project just brought in — so it confirms quietly with no
   * "open project" prompt, even though the ULB itself is editable scripture.
   */
  const downloadSourceText = async (url: string) => {
    try {
      setIsImporting(true);
      const imported = await runImportWithProgress(
        t`Downloading source text...`,
        ({ onProgress }) => importController.download(url, { onProgress }),
      );
      showNotificationSuccess({
        notification: buildPersistentImportSuccessNotification(
          t`Source text downloaded`,
          t`The English ULB is available as a reference text.`,
        ),
      });
      showImportGitWarningToast(imported.warning);
    } catch (error) {
      showErrorNotification({
        notification: {
          message: resolveImportErrorMessage({
            error,
            fallback: t`Failed to download source text`,
          }),
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
      const importedProject = await runImportWithProgress(
        t`Importing directory...`,
        ({ onProgress }) =>
          importController.importDirectorySelection(event, {
            onProgress,
          }),
      );
      showImportSuccessToast({
        importedProject: importedProject?.project,
        message: importedProject?.requiresMetadataReview
          ? t`Project imported successfully. Metadata needs review before opening it.`
          : importedProject?.isEditableProject === false
            ? t`Resource imported successfully! It is available in the reference picker.`
            : t`Directory imported successfully!`,
        isEditableProject: importedProject?.isEditableProject ?? false,
        requiresMetadataReview: importedProject?.requiresMetadataReview,
      });
      showImportGitWarningToast(importedProject?.warning);
    } catch (error) {
      showErrorNotification({
        notification: {
          message: resolveImportErrorMessage({
            error,
            fallback: t`Failed to import directory`,
          }),
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
      const importedProject = await runImportWithProgress(
        t`Importing file...`,
        ({ onProgress }) =>
          importController.importZipSelection(event, {
            onProgress,
          }),
      );
      showImportSuccessToast({
        importedProject: importedProject?.project,
        message: importedProject?.requiresMetadataReview
          ? t`Project imported successfully. Metadata needs review before opening it.`
          : importedProject?.isEditableProject === false
            ? t`Resource imported successfully! It is available in the reference picker.`
            : t`File imported successfully!`,
        isEditableProject: importedProject?.isEditableProject ?? false,
        requiresMetadataReview: importedProject?.requiresMetadataReview,
      });
      showImportGitWarningToast(importedProject?.warning);
    } catch (error) {
      showErrorNotification({
        notification: {
          message: resolveImportErrorMessage({
            error,
            fallback: t`Failed to import file`,
          }),
          title: t`Import Error`,
        },
      });
    } finally {
      setIsImporting(false);
    }
  };

  const onDirectoryAction = importService.pickDirectory
    ? async () => {
        try {
          setIsImporting(true);
          const selectedPath = await importController.pickDirectory({
            title: t`Select folder`,
          });
          if (!selectedPath) return;
          const importedProject = await runImportWithProgress(
            t`Importing directory...`,
            ({ onProgress }) =>
              importController.importNativeDirectoryPath(selectedPath, {
                onProgress,
              }),
          );
          showImportSuccessToast({
            importedProject: importedProject.project,
            message: importedProject.requiresMetadataReview
              ? t`Project imported successfully. Metadata needs review before opening it.`
              : importedProject.isEditableProject === false
                ? t`Resource imported successfully! It is available in the reference picker.`
                : t`Directory imported successfully!`,
            isEditableProject: importedProject.isEditableProject,
            requiresMetadataReview: importedProject.requiresMetadataReview,
          });
          showImportGitWarningToast(importedProject.warning);
        } catch (error) {
          showErrorNotification({
            notification: {
              message: resolveImportErrorMessage({
                error,
                fallback: t`Failed to import directory`,
              }),
              title: t`Import Error`,
            },
          });
        } finally {
          setIsImporting(false);
        }
      }
    : () => directoryInputRef.current?.click();

  const onZipAction = importService.pickZip
    ? async () => {
        try {
          setIsImporting(true);
          const selectedPath = await importController.pickZip({
            title: t`Select ZIP file`,
          });
          if (!selectedPath) return;
          const importedProject = await runImportWithProgress(
            t`Importing file...`,
            ({ onProgress }) =>
              importController.importNativeZipPath(selectedPath, {
                onProgress,
              }),
          );
          showImportSuccessToast({
            importedProject: importedProject.project,
            message: importedProject.requiresMetadataReview
              ? t`Project imported successfully. Metadata needs review before opening it.`
              : importedProject.isEditableProject === false
                ? t`Resource imported successfully! It is available in the reference picker.`
                : t`File imported successfully!`,
            isEditableProject: importedProject.isEditableProject,
            requiresMetadataReview: importedProject.requiresMetadataReview,
          });
          showImportGitWarningToast(importedProject.warning);
        } catch (error) {
          showErrorNotification({
            notification: {
              message: resolveImportErrorMessage({
                error,
                fallback: t`Failed to import file`,
              }),
              title: t`Import Error`,
            },
          });
        } finally {
          setIsImporting(false);
        }
      }
    : () => zipInputRef.current?.click();

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <Link
              to="/"
              className={styles.backLink}
              aria-label={t`Back to projects`}
            >
              <ArrowLeft size={16} />
              <Trans>Projects</Trans>
            </Link>
          </div>

          <div className={styles.localizationBlock}>
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
        </header>

        <SourcePicker
          onDownload={(zipUrl) => {
            void onDownload(zipUrl);
          }}
          isBusy={isImporting}
          onDirectoryAction={onDirectoryAction}
          onZipAction={onZipAction}
          onDirectorySelected={
            !importService.pickDirectory ? onOpenDirectory : undefined
          }
          onZipSelected={!importService.pickZip ? onOpenFile : undefined}
          directoryInputRef={directoryInputRef}
          zipInputRef={zipInputRef}
          giteaHostBaseUrl={giteaHostBaseUrl}
        />
      </section>
    </main>
  );
}
