import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface MobileLayoutProps {
  hasReferenceResource: boolean;
  activeWorkspacePane: WorkspacePane;
  isStetDocked: boolean;
  openProjectsPane: () => void;
  openSettingsPane: () => void;
  closeProjectsPane: () => void;
  closeSettingsPane: () => void;
  openSearchPane: () => void;
  closeSearchPane: () => void;
  closeStetPane: () => void;
  toggleStetPane: () => void;
  toggleStetDock: () => void;
  stetRevealEditor: () => void;
  toggleReferencePane: () => void;
}

export function MobileLayout(props: MobileLayoutProps) {
  const { search } = useWorkspaceContext();

  return (
    <WorkspaceMainShell
      isSmall
      hasReferenceResource={props.hasReferenceResource}
      hasSearchPaneOpen={search.isSearchPaneOpen}
      activeWorkspacePane={props.activeWorkspacePane}
      closeProjectsPane={props.closeProjectsPane}
      closeSettingsPane={props.closeSettingsPane}
      closeSearchPane={props.closeSearchPane}
      closeStetPane={props.closeStetPane}
      // Small screens never dock; the toggle is a no-op the panel won't render.
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
  );
}
