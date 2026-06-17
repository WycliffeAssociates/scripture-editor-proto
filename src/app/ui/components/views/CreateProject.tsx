import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { createProjectImportFacade } from "@/app/domain/api/import.ts";
import {
  type ImportModalAction,
  type ImportModalState,
  ImportProgressModal,
} from "@/app/ui/components/blocks/ImportProgressModal.tsx";
import { LanguageSelector } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { SourcePicker } from "@/app/ui/components/blocks/SourcePicker/SourcePicker.tsx";
import { loadLocale } from "@/app/ui/i18n/loadLocale.tsx";
import * as styles from "@/app/ui/styles/modules/createRoute.css.ts";
import {
  getProjectParamFromImportedPath,
  resolveImportErrorMessage,
} from "@/app/utils/createRouteHelpers.ts";
import { declaresEnglishUlbSource } from "@/core/domain/project/declaredSources.ts";
import {
  fetchConsolidatedRepos,
  getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Create/import view.
 *
 * This view stays at the app-shell level: it gathers user intent, forwards it to
 * the import facade, and reflects progress/result through a single modal (no
 * toasts on this route — the modal is the one un-ignorable surface). Import
 * branching and managed-disk shaping live below this UI layer. Browsing and
 * downloading an existing project is delegated to the embeddable `SourcePicker`.
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
  const [modalState, setModalState] = useState<ImportModalState>({
    phase: "closed",
  });

  const showImportError = (error: unknown, fallback: string) => {
    setModalState({
      phase: "done",
      tone: "error",
      message: resolveImportErrorMessage({ error, fallback }),
    });
  };

  const showImportSuccess = ({
    importedProject,
    message,
    isEditableProject,
    requiresMetadataReview = false,
    warning,
  }: {
    importedProject: ProjectListItem | null | undefined;
    message: string;
    isEditableProject: boolean;
    requiresMetadataReview?: boolean;
    warning?: string;
  }) => {
    const importedPath = importedProject?.projectPath;
    const projectParam = getProjectParamFromImportedPath(importedPath);

    // Resources (non-editable) and projects we can't resolve a route for get a
    // bare confirmation; editable projects get the open/review action.
    if (!isEditableProject || !projectParam) {
      setModalState({ phase: "done", tone: "success", message, warning });
      return;
    }

    setModalState({
      phase: "done",
      tone: "success",
      message,
      warning,
      openAction: {
        label: requiresMetadataReview ? (
          <Trans>Review metadata</Trans>
        ) : (
          <Trans>Open project</Trans>
        ),
        onClick: () => {
          settingsManager?.update?.({
            lastProjectPath: importedPath ?? "",
          });
          router.navigate({
            to: requiresMetadataReview ? "/$project/metadata" : "/$project",
            params: { project: projectParam },
            ...(requiresMetadataReview
              ? { search: { issues: "open" as const } }
              : {}),
          });
        },
      },
    });

    if (importedProject) {
      void maybeOfferEnglishUlbSource(importedProject);
    }
  };

  /**
   * When a freshly imported project declares the English ULB as its source and
   * we don't already have it, offer to download the curated copy from the
   * catalog — merged into the open success modal as a second action rather than
   * a separate prompt. The catalog lookup doubles as the availability check.
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
      const offerNote = t`This project lists the English ULB as its source.`;
      // Graft the offer onto the still-open success modal; bail if the user
      // already closed it or moved on. Carry the project's open action through
      // the source-text download so the modal can still offer "open your
      // project" afterward.
      setModalState((prev) =>
        prev.phase === "done" && prev.tone === "success"
          ? {
              ...prev,
              message: (
                <>
                  {prev.message} {offerNote}
                </>
              ),
              offerAction: {
                label: <Trans>Download English ULB</Trans>,
                onClick: () => {
                  void downloadSourceText(zipUrl, prev.openAction);
                },
              },
            }
          : prev,
      );
    } catch (error) {
      console.error("Failed to offer source text", error);
    }
  };

  /**
   * Open the modal's importing phase, then run one import action. Success/error
   * transitions are the caller's job (they know the right copy + actions). No
   * progress is streamed — the modal shows a plain spinner.
   */
  const runImport = async <T,>(run: () => Promise<T>): Promise<T> => {
    setModalState({ phase: "importing" });
    return await run();
  };

  const onDownload = async (url: string) => {
    try {
      setIsImporting(true);
      const importedProject = await runImport(() =>
        importController.download(url),
      );
      showImportSuccess({
        importedProject: importedProject.project,
        message: importedProject.isEditableProject
          ? importedProject.requiresMetadataReview
            ? t`Project downloaded successfully. Metadata needs review before opening it.`
            : t`Project downloaded successfully!`
          : t`Resource downloaded successfully! It is available in the resource picker.`,
        isEditableProject: importedProject.isEditableProject,
        requiresMetadataReview: importedProject.requiresMetadataReview,
        warning: importedProject.warning,
      });
    } catch (error) {
      showImportError(error, t`Failed to download project`);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Download a declared source text — reference material for the project just
   * brought in. Keeps the project's open action so the user can still jump to
   * the project they originally imported once the source text lands.
   */
  const downloadSourceText = async (
    url: string,
    openAction?: ImportModalAction,
  ) => {
    try {
      setIsImporting(true);
      const imported = await runImport(() => importController.download(url));
      setModalState({
        phase: "done",
        tone: "success",
        message: t`The English ULB is ready as a resource.`,
        warning: imported.warning,
        openAction,
      });
    } catch (error) {
      showImportError(error, t`Failed to download source text`);
    } finally {
      setIsImporting(false);
    }
  };

  const onOpenDirectory = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    try {
      setIsImporting(true);
      const importedProject = await runImport(() =>
        importController.importDirectorySelection(event),
      );
      showImportSuccess({
        importedProject: importedProject?.project,
        message: importedProject?.requiresMetadataReview
          ? t`Project imported successfully. Metadata needs review before opening it.`
          : importedProject?.isEditableProject === false
            ? t`Resource imported successfully! It is available in the resource picker.`
            : t`Directory imported successfully!`,
        isEditableProject: importedProject?.isEditableProject ?? false,
        requiresMetadataReview: importedProject?.requiresMetadataReview,
        warning: importedProject?.warning,
      });
    } catch (error) {
      showImportError(error, t`Failed to import directory`);
    } finally {
      setIsImporting(false);
    }
  };

  const onOpenFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsImporting(true);
      const importedProject = await runImport(() =>
        importController.importZipSelection(event),
      );
      showImportSuccess({
        importedProject: importedProject?.project,
        message: importedProject?.requiresMetadataReview
          ? t`Project imported successfully. Metadata needs review before opening it.`
          : importedProject?.isEditableProject === false
            ? t`Resource imported successfully! It is available in the resource picker.`
            : t`File imported successfully!`,
        isEditableProject: importedProject?.isEditableProject ?? false,
        requiresMetadataReview: importedProject?.requiresMetadataReview,
        warning: importedProject?.warning,
      });
    } catch (error) {
      showImportError(error, t`Failed to import file`);
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
          const importedProject = await runImport(() =>
            importController.importNativeDirectoryPath(selectedPath),
          );
          showImportSuccess({
            importedProject: importedProject.project,
            message: importedProject.requiresMetadataReview
              ? t`Project imported successfully. Metadata needs review before opening it.`
              : importedProject.isEditableProject === false
                ? t`Resource imported successfully! It is available in the resource picker.`
                : t`Directory imported successfully!`,
            isEditableProject: importedProject.isEditableProject,
            requiresMetadataReview: importedProject.requiresMetadataReview,
            warning: importedProject.warning,
          });
        } catch (error) {
          showImportError(error, t`Failed to import directory`);
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
          const importedProject = await runImport(() =>
            importController.importNativeZipPath(selectedPath),
          );
          showImportSuccess({
            importedProject: importedProject.project,
            message: importedProject.requiresMetadataReview
              ? t`Project imported successfully. Metadata needs review before opening it.`
              : importedProject.isEditableProject === false
                ? t`Resource imported successfully! It is available in the resource picker.`
                : t`File imported successfully!`,
            isEditableProject: importedProject.isEditableProject,
            requiresMetadataReview: importedProject.requiresMetadataReview,
            warning: importedProject.warning,
          });
        } catch (error) {
          showImportError(error, t`Failed to import file`);
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

      <ImportProgressModal
        state={modalState}
        onClose={() => setModalState({ phase: "closed" })}
      />
    </main>
  );
}
