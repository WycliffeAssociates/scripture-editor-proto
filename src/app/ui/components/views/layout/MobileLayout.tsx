import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { BottomPanelTab } from "../bottom-panel/index.ts";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface MobileLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings" | "projects";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: BottomPanelTab;
    isLintDockOpen: boolean;
    bottomPanelHeight: number;
    closeProjectsPane: () => void;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: BottomPanelTab) => void;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
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
            activeBottomPanelTab={props.activeBottomPanelTab}
            isLintDockOpen={props.isLintDockOpen}
            bottomPanelHeight={props.bottomPanelHeight}
            closeProjectsPane={props.closeProjectsPane}
            closeSettingsPane={props.closeSettingsPane}
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
    );
}
