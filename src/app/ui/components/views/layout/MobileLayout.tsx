import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface MobileLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: WorkspacePane;
    isBottomPanelOpen: boolean;
    bottomPanelHeight: number;
    closeProjectsPane: () => void;
    closeSettingsPane: () => void;
    openSearchPane: () => void;
    closeSearchPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    onOpenVersionsDock: () => void;
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
            isBottomPanelOpen={props.isBottomPanelOpen}
            bottomPanelHeight={props.bottomPanelHeight}
            closeProjectsPane={props.closeProjectsPane}
            closeSettingsPane={props.closeSettingsPane}
            closeSearchPane={props.closeSearchPane}
            openBottomPanel={props.openBottomPanel}
            closeBottomPanel={props.closeBottomPanel}
            setBottomPanelHeight={props.setBottomPanelHeight}
            onOpenVersionsDock={props.onOpenVersionsDock}
            toggleReferencePane={props.toggleReferencePane}
            toggleSearchPane={() =>
                search.isSearchPaneOpen
                    ? props.closeSearchPane()
                    : props.openSearchPane()
            }
        />
    );
}
