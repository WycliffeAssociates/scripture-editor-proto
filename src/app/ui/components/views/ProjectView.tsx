import { useEffect, useState } from "react";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { DesktopLayout } from "./layout/DesktopLayout.tsx";
import { MobileLayout } from "./layout/MobileLayout.tsx";
import type { WorkspacePane } from "./layout/WorkspaceShell.tsx";

/**
 * Main workspace route view.
 *
 * By the time this component renders, the route has already loaded an editable
 * scripture workspace and the workspace provider has assembled the hooks that sit
 * on top of it. This component is responsible for layout orchestration only.
 */
export function ProjectView() {
    const { save, search } = useWorkspaceContext();
    const [isReferencePaneOpen, setIsReferencePaneOpen] = useState(false);
    const [activeWorkspacePane, setActiveWorkspacePane] =
        useState<WorkspacePane>("editor");
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
    const [bottomPanelHeight, setBottomPanelHeight] = useState(240);
    const { isSm } = useWorkspaceMediaQuery();
    const openVersionsDock = () => {
        setIsBottomPanelOpen(true);
        void save.versions.ensureLoaded();
    };
    const hasReferenceResource = isReferencePaneOpen;
    const layoutClassName = hasReferenceResource
        ? styles.appLayoutWithReference
        : styles.appLayout;
    const openSearchPane = () => {
        search.setIsSearchPaneOpen(true);
        setActiveWorkspacePane("search");
    };
    const closeSearchPane = () => {
        search.setIsSearchPaneOpen(false);
        setActiveWorkspacePane((current) =>
            current === "search" ? "editor" : current,
        );
    };

    useEffect(() => {
        if (search.isSearchPaneOpen) {
            setActiveWorkspacePane("search");
            return;
        }
        setActiveWorkspacePane((current) =>
            current === "search" ? "editor" : current,
        );
    }, [search.isSearchPaneOpen]);

    const layoutProps = {
        hasReferenceResource,
        activeWorkspacePane,
        isBottomPanelOpen,
        bottomPanelHeight,
        openProjectsPane: () => {
            search.setIsSearchPaneOpen(false);
            setActiveWorkspacePane("projects");
        },
        openSettingsPane: () => {
            search.setIsSearchPaneOpen(false);
            setActiveWorkspacePane("settings");
        },
        closeProjectsPane: () => setActiveWorkspacePane("editor"),
        closeSettingsPane: () => setActiveWorkspacePane("editor"),
        openSearchPane,
        closeSearchPane,
        openBottomPanel: () => setIsBottomPanelOpen(true),
        closeBottomPanel: () => setIsBottomPanelOpen(false),
        setBottomPanelHeight,
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
