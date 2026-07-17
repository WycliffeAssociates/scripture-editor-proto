import { useEffect, useState } from "react";

import { RecoveryBanners } from "@/app/ui/components/blocks/RecoveryBanners.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/useWorkspaceMediaQuery.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

import { DesktopLayout } from "./layout/DesktopLayout.tsx";
import { MobileLayout } from "./layout/MobileLayout.tsx";
import type { WorkspacePane } from "./layout/WorkspaceShell.tsx";

/**
 * Main workspace route view.
 *
 * By the time this component renders, the route has already loaded an editable
 * scripture workspace and the workspace provider has assembled the hooks that sit
 * on top of it. This component is responsible for layout orchestration only —
 * including which single overlay tool (Find or STET) is active and whether it is
 * docked beside the editor.
 */
export function ProjectView() {
  const { search } = useWorkspaceContext();
  const [isReferencePaneOpen, setIsReferencePaneOpen] = useState(false);
  const [activeWorkspacePane, setActiveWorkspacePane] =
    useState<WorkspacePane>("editor");
  // STET docking lives here (layout), independent of Find's own dock state. Find
  // keeps its existing contract untouched.
  const [isStetDocked, setIsStetDocked] = useState(false);
  const { isSm } = useWorkspaceMediaQuery();
  const hasReferenceResource = isReferencePaneOpen;
  const layoutClassName = hasReferenceResource
    ? styles.appLayoutWithReference
    : styles.appLayout;

  const openSearchPane = () => {
    search.setIsSearchPaneOpen(true);
    setActiveWorkspacePane("search");
  };
  const closeSearchPane = () => {
    search.setIsSearchPaneOpen(false);
    setActiveWorkspacePane((current) =>
      current === "search" ? "editor" : current,
    );
  };

  const openStetPane = () => {
    // Search and STET share the overlay slot. Close Find through its own path
    // (clearing its editor highlights) so none survive the switch.
    search.setIsSearchPaneOpen(false);
    search.clearSearch();
    setActiveWorkspacePane("stet");
  };
  const closeStetPane = () => {
    setActiveWorkspacePane((current) =>
      current === "stet" ? "editor" : current,
    );
  };

  useEffect(() => {
    if (search.isSearchPaneOpen) {
      setActiveWorkspacePane("search");
      return;
    }
    setActiveWorkspacePane((current) =>
      current === "search" ? "editor" : current,
    );
  }, [search.isSearchPaneOpen]);

  // Leaving STET always undocks it — reopening starts undocked (V1).
  useEffect(() => {
    if (activeWorkspacePane !== "stet") setIsStetDocked(false);
  }, [activeWorkspacePane]);

  const layoutProps = {
    hasReferenceResource,
    activeWorkspacePane,
    isStetDocked,
    openProjectsPane: () => {
      search.setIsSearchPaneOpen(false);
      setActiveWorkspacePane("projects");
    },
    openSettingsPane: () => {
      search.setIsSearchPaneOpen(false);
      setActiveWorkspacePane("settings");
    },
    closeProjectsPane: () => setActiveWorkspacePane("editor"),
    closeSettingsPane: () => setActiveWorkspacePane("editor"),
    openSearchPane,
    closeSearchPane,
    openStetPane,
    closeStetPane,
    toggleStetPane: () =>
      activeWorkspacePane === "stet" ? closeStetPane() : openStetPane(),
    toggleStetDock: () => setIsStetDocked((current) => !current),
    // Row navigation reveals the editor: dock STET beside it on desktop, or
    // close STET (full editor) on small screens.
    stetRevealEditor: () => {
      if (isSm) {
        closeStetPane();
      } else {
        setIsStetDocked(true);
      }
    },
    toggleReferencePane: () => setIsReferencePaneOpen((current) => !current),
  };

  return (
    <div className={layoutClassName}>
      <RecoveryBanners />
      {isSm ? (
        <MobileLayout {...layoutProps} />
      ) : (
        <DesktopLayout {...layoutProps} />
      )}
    </div>
  );
}
