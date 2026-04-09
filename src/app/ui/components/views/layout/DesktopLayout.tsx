import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { BottomPanelTab } from "../bottom-panel/index.ts";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface DesktopLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings" | "projects";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: BottomPanelTab;
    isLintDockOpen: boolean;
    bottomPanelHeight: number;
    openProjectsPane: () => void;
    openSettingsPane: () => void;
    closeSettingsPane: () => void;
    closeProjectsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: BottomPanelTab) => void;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
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
                activeBottomPanelTab={props.activeBottomPanelTab}
                isLintDockOpen={props.isLintDockOpen}
                bottomPanelHeight={props.bottomPanelHeight}
                closeSettingsPane={props.closeSettingsPane}
                closeProjectsPane={props.closeProjectsPane}
                openBottomPanel={props.openBottomPanel}
                closeBottomPanel={props.closeBottomPanel}
                setBottomPanelHeight={props.setBottomPanelHeight}
                setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                onToggleLintDock={props.onToggleLintDock}
                onOpenCloudDock={props.onOpenCloudDock}
                onOpenVersionsDock={props.onOpenVersionsDock}
                toggleReferencePane={props.toggleReferencePane}
                toggleSearchPane={() =>
                    search.setIsSearchPaneOpen(!search.isSearchPaneOpen)
                }
            />
        </>
    );
}

import { DesktopSidebar } from "../sidebar/DesktopSidebar.tsx";
