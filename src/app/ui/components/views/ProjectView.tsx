import { useEffect, useState } from "react";
import { RecoveryBanners } from "@/app/ui/components/blocks/RecoveryBanners.tsx";
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
    const { search } = useWorkspaceContext();
    const [isReferencePaneOpen, setIsReferencePaneOpen] = useState(false);
    const [activeWorkspacePane, setActiveWorkspacePane] =
        useState<WorkspacePane>("editor");
    const { isSm } = useWorkspaceMediaQuery();
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
        toggleReferencePane: () =>
            setIsReferencePaneOpen((current) => !current),
    };

    return (
        <div className={layoutClassName}>
            <RecoveryBanners />
            {isSm ? (
                <MobileLayout {...layoutProps} />
            ) : (
                <DesktopLayout {...layoutProps} />
            )}
        </div>
    );
}
