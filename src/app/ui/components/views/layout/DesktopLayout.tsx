import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { WorkspacePane } from "./WorkspaceShell.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface DesktopLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: WorkspacePane;
    isBottomPanelOpen: boolean;
    bottomPanelHeight: number;
    openProjectsPane: () => void;
    openSettingsPane: () => void;
    closeSettingsPane: () => void;
    closeProjectsPane: () => void;
    openSearchPane: () => void;
    closeSearchPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    onOpenVersionsDock: () => void;
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
                isBottomPanelOpen={props.isBottomPanelOpen}
                bottomPanelHeight={props.bottomPanelHeight}
                closeSettingsPane={props.closeSettingsPane}
                closeProjectsPane={props.closeProjectsPane}
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
        </>
    );
}

import { DesktopSidebar } from "../sidebar/DesktopSidebar.tsx";
