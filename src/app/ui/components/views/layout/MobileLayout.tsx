import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { WorkspaceMainShell } from "./WorkspaceShell.tsx";

interface MobileLayoutProps {
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    isLintDockOpen: boolean;
    bottomPanelHeight: number;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
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
            closeSettingsPane={props.closeSettingsPane}
            openBottomPanel={props.openBottomPanel}
            closeBottomPanel={props.closeBottomPanel}
            setBottomPanelHeight={props.setBottomPanelHeight}
            setActiveBottomPanelTab={props.setActiveBottomPanelTab}
            onToggleLintDock={props.onToggleLintDock}
            onOpenCloudDock={props.onOpenCloudDock}
            toggleReferencePane={props.toggleReferencePane}
            toggleSearchPane={() =>
                search.setIsSearchPaneOpen(!search.isSearchPaneOpen)
            }
        />
    );
}
