import { useState } from "react";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import type { BottomPanelTab } from "./bottom-panel/index.ts";
import { DesktopLayout } from "./layout/DesktopLayout.tsx";
import { MobileLayout } from "./layout/MobileLayout.tsx";

/**
 * Main workspace route view.
 *
 * By the time this component renders, the route has already loaded an editable
 * scripture workspace and the workspace provider has assembled the hooks that sit
 * on top of it. This component is responsible for layout orchestration only.
 */
export function ProjectView() {
    const { save } = useWorkspaceContext();
    const [isReferencePaneOpen, setIsReferencePaneOpen] = useState(false);
    const [activeWorkspacePane, setActiveWorkspacePane] = useState<
        "editor" | "settings" | "projects"
    >("editor");
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
    const [activeBottomPanelTab, setActiveBottomPanelTab] =
        useState<BottomPanelTab>("problems");
    const [bottomPanelHeight, setBottomPanelHeight] = useState(240);
    const { isSm } = useWorkspaceMediaQuery();
    const isLintDockOpen =
        isBottomPanelOpen && activeBottomPanelTab === "problems";
    const openCloudDock = () => {
        setActiveBottomPanelTab("cloud");
        setIsBottomPanelOpen(true);
    };
    const openVersionsDock = () => {
        setActiveBottomPanelTab("versions");
        setIsBottomPanelOpen(true);
        void save.versions.ensureLoaded();
    };
    const toggleLintDock = () => {
        if (isLintDockOpen) {
            setIsBottomPanelOpen(false);
            return;
        }
        setActiveBottomPanelTab("problems");
        setIsBottomPanelOpen(true);
    };
    const hasReferenceResource = isReferencePaneOpen;
    const layoutClassName = hasReferenceResource
        ? styles.appLayoutWithReference
        : styles.appLayout;

    const layoutProps = {
        hasReferenceResource,
        activeWorkspacePane,
        isBottomPanelOpen,
        activeBottomPanelTab,
        isLintDockOpen,
        bottomPanelHeight,
        openProjectsPane: () => setActiveWorkspacePane("projects"),
        openSettingsPane: () => setActiveWorkspacePane("settings"),
        closeProjectsPane: () => setActiveWorkspacePane("editor"),
        closeSettingsPane: () => setActiveWorkspacePane("editor"),
        openBottomPanel: () => setIsBottomPanelOpen(true),
        closeBottomPanel: () => setIsBottomPanelOpen(false),
        setBottomPanelHeight,
        setActiveBottomPanelTab,
        onToggleLintDock: toggleLintDock,
        onOpenCloudDock: openCloudDock,
        onOpenVersionsDock: openVersionsDock,
        toggleReferencePane: () =>
            setIsReferencePaneOpen((current) => !current),
    };

    return (
        <div className={layoutClassName}>
            {isSm ? (
                <MobileLayout {...layoutProps} />
            ) : (
                <DesktopLayout {...layoutProps} />
            )}
        </div>
    );
}
