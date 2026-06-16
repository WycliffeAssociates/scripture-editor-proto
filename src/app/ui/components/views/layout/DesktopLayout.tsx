import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

import { DesktopSidebar } from "../sidebar/DesktopSidebar.tsx";
import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface DesktopLayoutProps {
  hasReferenceResource: boolean;
  activeWorkspacePane: WorkspacePane;
  openProjectsPane: () => void;
  openSettingsPane: () => void;
  closeSettingsPane: () => void;
  closeProjectsPane: () => void;
  openSearchPane: () => void;
  closeSearchPane: () => void;
  toggleReferencePane: () => void;
}

export function DesktopLayout(props: DesktopLayoutProps) {
  const { search } = useWorkspaceContext();

  return (
    <>
      <DesktopSidebar
        openProjectsPane={props.openProjectsPane}
        openSettingsPane={props.openSettingsPane}
      />
      <WorkspaceMainShell
        isSmall={false}
        hasReferenceResource={props.hasReferenceResource}
        hasSearchPaneOpen={search.isSearchPaneOpen}
        activeWorkspacePane={props.activeWorkspacePane}
        closeSettingsPane={props.closeSettingsPane}
        closeProjectsPane={props.closeProjectsPane}
        closeSearchPane={props.closeSearchPane}
        toggleReferencePane={props.toggleReferencePane}
        toggleSearchPane={() =>
          search.isSearchPaneOpen
            ? props.closeSearchPane()
            : props.openSearchPane()
        }
      />
    </>
  );
}
