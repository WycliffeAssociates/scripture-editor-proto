import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

import { DesktopSidebar } from "../sidebar/DesktopSidebar.tsx";
import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface DesktopLayoutProps {
  hasReferenceResource: boolean;
  activeWorkspacePane: WorkspacePane;
  isStetDocked: boolean;
  openProjectsPane: () => void;
  openSettingsPane: () => void;
  closeSettingsPane: () => void;
  closeProjectsPane: () => void;
  openSearchPane: () => void;
  closeSearchPane: () => void;
  openStetPane: () => void;
  closeStetPane: () => void;
  toggleStetPane: () => void;
  toggleStetDock: () => void;
  stetRevealEditor: () => void;
  toggleReferencePane: () => void;
}

export function DesktopLayout(props: DesktopLayoutProps) {
  const { search } = useWorkspaceContext();

  return (
    <>
      <DesktopSidebar
        openProjectsPane={props.openProjectsPane}
        openSettingsPane={props.openSettingsPane}
        openStetPane={props.openStetPane}
      />
      <WorkspaceMainShell
        isSmall={false}
        hasReferenceResource={props.hasReferenceResource}
        hasSearchPaneOpen={search.isSearchPaneOpen}
        isSearchDocked={search.isSearchDocked}
        isStetDocked={props.isStetDocked}
        activeWorkspacePane={props.activeWorkspacePane}
        closeSettingsPane={props.closeSettingsPane}
        closeProjectsPane={props.closeProjectsPane}
        closeSearchPane={props.closeSearchPane}
        closeStetPane={props.closeStetPane}
        toggleStetDock={props.toggleStetDock}
        toggleStetPane={props.toggleStetPane}
        stetRevealEditor={props.stetRevealEditor}
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
