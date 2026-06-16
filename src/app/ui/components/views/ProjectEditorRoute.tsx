import { Trans } from "@lingui/react/macro";
import { getRouteApi } from "@tanstack/react-router";

import { ProjectView } from "@/app/ui/components/views/ProjectView.tsx";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/projectIndex.css.ts";

const route = getRouteApi("/$project/");

/**
 * Main scripture editing route view — hosts the editor shell around the
 * already-resolved scripture workspace the loader projected into view.
 */
export function ProjectEditorRoute() {
  const {
    projectFiles,
    loadedProject,
    rejectionReason,
    workspaceBaselineStore,
    recoveredConflictTracker,
    dirtyBufferStore,
    workspaceKey,
    restoredBookCodes,
    conflictedBookCodes,
    recoveryReportEntries,
    kernel,
  } = route.useLoaderData();

  const { project } = route.useParams();
  const search = route.useSearch();

  if (!loadedProject) {
    return (
      <div className={styles.pendingPaper}>
        {rejectionReason === "not-editable"
          ? "This resource cannot be opened in the editable workspace."
          : "Project not found"}
      </div>
    );
  }
  // A null kernel is only ever the preload-while-occupied skip (the registry
  // declined to evict the open workspace); such a loader result never mounts
  // because the open project isn't being navigated away from. A real
  // navigation always re-runs the loader and yields a claimed handle.
  if (!kernel) {
    return (
      <div className={styles.pendingPaper}>
        <Trans>Loading...</Trans>
      </div>
    );
  }
  return (
    // Keyed by the workspace (project folder) so navigating between projects in
    // this one route instance fully remounts the provider. Without it the
    // `useStableInstance` stores — notably the `FindingsStore` seeded from the
    // kernel's awaited first-paint findings — would persist across the swap and
    // show the previous project's findings (the new project's initial findings
    // were consumed at kernel-build time, before any result router is mounted to
    // replay them). A fresh mount re-runs every seed against the new kernel.
    <ProjectProvider
      key={workspaceKey}
      currentProjectRoute={project}
      projectFiles={projectFiles}
      loadedProject={loadedProject}
      workspaceBaselineStore={workspaceBaselineStore}
      recoveredConflictTracker={recoveredConflictTracker}
      dirtyBufferStore={dirtyBufferStore}
      workspaceKey={workspaceKey}
      restoredBookCodes={restoredBookCodes}
      conflictedBookCodes={conflictedBookCodes}
      recoveryReportEntries={recoveryReportEntries}
      kernel={kernel}
      queryBookOverride={search.book}
      queryChapterOverride={search.chapter}
    >
      <ProjectView />
    </ProjectProvider>
  );
}
