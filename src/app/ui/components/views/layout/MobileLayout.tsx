import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface MobileLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: WorkspacePane;
    closeProjectsPane: () => void;
    closeSettingsPane: () => void;
    openSearchPane: () => void;
    closeSearchPane: () => void;
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
            toggleReferencePane={props.toggleReferencePane}
            toggleSearchPane={() =>
                search.isSearchPaneOpen
                    ? props.closeSearchPane()
                    : props.openSearchPane()
            }
        />
    );
}
