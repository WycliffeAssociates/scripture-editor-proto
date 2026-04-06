import { SaveAndReviewChangesOverlay } from "@/app/ui/components/blocks/DiffModal/DiffModal.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { SettingsPanel } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { EditorToolbar } from "@/app/ui/components/primitives/EditorToolbar/index.ts";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { BottomPanel } from "../bottom-panel/BottomPanel.tsx";
import { SearchPanel } from "../search-panel/SearchPanel.tsx";

interface EditorPaneProps {
    isSmall: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    isLintDockOpen: boolean;
    hasReferenceResource: boolean;
    hasSearchPaneOpen: boolean;
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
    toggleReferencePane: () => void;
    toggleSearchPane: () => void;
}

export function EditorPane(props: EditorPaneProps) {
    return (
        <div
            className={
                props.isSmall
                    ? styles.editorMainSmall
                    : styles.editorWrapperDesktop
            }
        >
            <div className={styles.editorPaneHeader}>
                <EditorToolbar
                    isReferencePaneOpen={props.hasReferenceResource}
                    isLintDockOpen={props.isLintDockOpen}
                    onToggleLintDock={props.onToggleLintDock}
                    onOpenCloudDock={props.onOpenCloudDock}
                    onToggleReferencePane={props.toggleReferencePane}
                    isSearchPaneOpen={props.hasSearchPaneOpen}
                    onToggleSearchPane={props.toggleSearchPane}
                />
            </div>
            <MainEditor />
        </div>
    );
}

interface ReferencePaneProps {
    isSmall: boolean;
}

export function ReferencePane(props: ReferencePaneProps) {
    return (
        <div
            className={
                props.isSmall
                    ? styles.editorReferenceSmall
                    : styles.referenceColumn
            }
        >
            <ReferencePicker />
            <ReferenceEditor />
        </div>
    );
}

interface SettingsPaneProps {
    onClose: () => void;
}

export function SettingsPane(props: SettingsPaneProps) {
    return <SettingsPanel onClose={props.onClose} />;
}

interface WorkspacePaneStackProps {
    isSmall: boolean;
    activeWorkspacePane: "editor" | "settings";
    activeBottomPanelTab: "problems" | "cloud";
    isLintDockOpen: boolean;
    hasReferenceResource: boolean;
    hasSearchPaneOpen: boolean;
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
    toggleReferencePane: () => void;
    toggleSearchPane: () => void;
}

export function WorkspacePaneStack(props: WorkspacePaneStackProps) {
    return (
        <div className={styles.workspacePaneStack}>
            <div className={styles.workspaceEditorPane}>
                <EditorPane
                    isSmall={props.isSmall}
                    activeBottomPanelTab={props.activeBottomPanelTab}
                    isLintDockOpen={props.isLintDockOpen}
                    hasReferenceResource={props.hasReferenceResource}
                    hasSearchPaneOpen={props.hasSearchPaneOpen}
                    openBottomPanel={props.openBottomPanel}
                    setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                    onToggleLintDock={props.onToggleLintDock}
                    onOpenCloudDock={props.onOpenCloudDock}
                    toggleReferencePane={props.toggleReferencePane}
                    toggleSearchPane={props.toggleSearchPane}
                />
            </div>
        </div>
    );
}

interface EditorsShellProps {
    isSmall: boolean;
    hasReferenceResource: boolean;
    hasSearchPaneOpen: boolean;
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
    toggleSearchPane: () => void;
}

export function EditorsShell(props: EditorsShellProps) {
    const showRightPanel =
        props.hasReferenceResource || props.hasSearchPaneOpen;

    return (
        <section
            className={
                props.isSmall
                    ? styles.workspaceShellMobile
                    : styles.workspaceShellDesktop
            }
        >
            <div className={styles.workspaceEditorsStage}>
                <div
                    className={
                        props.isSmall
                            ? styles.mobileEditorsContainer
                            : showRightPanel
                              ? styles.desktopContentGridWithReference
                              : styles.desktopContentGrid
                    }
                >
                    {props.hasReferenceResource ? (
                        <ReferencePane isSmall={props.isSmall} />
                    ) : null}
                    {props.hasSearchPaneOpen ? <SearchPanel /> : null}
                    <WorkspacePaneStack
                        isSmall={props.isSmall}
                        activeWorkspacePane={props.activeWorkspacePane}
                        activeBottomPanelTab={props.activeBottomPanelTab}
                        isLintDockOpen={props.isLintDockOpen}
                        hasReferenceResource={props.hasReferenceResource}
                        hasSearchPaneOpen={props.hasSearchPaneOpen}
                        openBottomPanel={props.openBottomPanel}
                        setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                        onToggleLintDock={props.onToggleLintDock}
                        onOpenCloudDock={props.onOpenCloudDock}
                        toggleReferencePane={props.toggleReferencePane}
                        toggleSearchPane={props.toggleSearchPane}
                    />
                    <SaveAndReviewChangesOverlay />
                </div>
                {props.activeWorkspacePane !== "editor" ? (
                    <div className={styles.workspaceOverlayPane}>
                        <SettingsPane onClose={props.closeSettingsPane} />
                    </div>
                ) : null}
            </div>
            {props.isBottomPanelOpen ? (
                <BottomPanel
                    activeTab={props.activeBottomPanelTab}
                    height={props.bottomPanelHeight}
                    onClose={props.closeBottomPanel}
                    onHeightChange={props.setBottomPanelHeight}
                    onTabChange={props.setActiveBottomPanelTab}
                />
            ) : null}
        </section>
    );
}

interface WorkspaceMainShellProps extends EditorsShellProps {}

export function WorkspaceMainShell(props: WorkspaceMainShellProps) {
    return (
        <div className={styles.workspaceMain}>
            <EditorsShell {...props} />
        </div>
    );
}
