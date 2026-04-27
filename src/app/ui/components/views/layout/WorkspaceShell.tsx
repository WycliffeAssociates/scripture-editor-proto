import { DATA_JS } from "@/app/data/constants.ts";
import { SaveAndReviewChangesOverlay } from "@/app/ui/components/blocks/DiffModal/DiffModal.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { SettingsPanel } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { ProjectBrowserPane } from "@/app/ui/components/blocks/ProjectSwitcher/ProjectBrowserPane.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { EditorToolbar } from "@/app/ui/components/primitives/EditorToolbar/index.ts";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { BottomPanel } from "../bottom-panel/BottomPanel.tsx";
import { SearchPanel } from "../search-panel/SearchPanel.tsx";

interface EditorPaneProps {
    isSmall: boolean;
    hasReferenceResource: boolean;
    hasSearchPaneOpen: boolean;
    openBottomPanel: () => void;
    onOpenVersionsDock: () => void;
    toggleReferencePane: () => void;
    toggleSearchPane: () => void;
}

function EditorPane(props: EditorPaneProps) {
    return (
        <div
            data-js={DATA_JS.editorScrollContainer}
            className={
                props.isSmall
                    ? styles.editorMainSmall
                    : styles.editorWrapperDesktop
            }
        >
            <div className={styles.editorPaneHeader}>
                <EditorToolbar
                    isReferencePaneOpen={props.hasReferenceResource}
                    onOpenVersionsDock={props.onOpenVersionsDock}
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

function ReferencePane(props: ReferencePaneProps) {
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

function SettingsPane(props: SettingsPaneProps) {
    return <SettingsPanel onClose={props.onClose} />;
}

interface ProjectsPaneProps {
    onClose: () => void;
}

function ProjectsPane(props: ProjectsPaneProps) {
    return <ProjectBrowserPane onClose={props.onClose} />;
}

export type WorkspacePane = "editor" | "settings" | "projects" | "search";

interface WorkspacePaneStackProps {
    isSmall: boolean;
    activeWorkspacePane: WorkspacePane;
    hasReferenceResource: boolean;
    hasSearchPaneOpen: boolean;
    openBottomPanel: () => void;
    onOpenVersionsDock: () => void;
    toggleReferencePane: () => void;
    toggleSearchPane: () => void;
}

function WorkspacePaneStack(props: WorkspacePaneStackProps) {
    return (
        <div className={styles.workspacePaneStack}>
            <div className={styles.workspaceEditorPane}>
                <EditorPane
                    isSmall={props.isSmall}
                    hasReferenceResource={props.hasReferenceResource}
                    hasSearchPaneOpen={props.hasSearchPaneOpen}
                    openBottomPanel={props.openBottomPanel}
                    onOpenVersionsDock={props.onOpenVersionsDock}
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
    activeWorkspacePane: WorkspacePane;
    isBottomPanelOpen: boolean;
    bottomPanelHeight: number;
    closeProjectsPane: () => void;
    closeSettingsPane: () => void;
    closeSearchPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    onOpenVersionsDock: () => void;
    toggleReferencePane: () => void;
    toggleSearchPane: () => void;
}

function EditorsShell(props: EditorsShellProps) {
    const showRightPanel = props.hasReferenceResource;

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
                    <WorkspacePaneStack
                        isSmall={props.isSmall}
                        activeWorkspacePane={props.activeWorkspacePane}
                        hasReferenceResource={props.hasReferenceResource}
                        hasSearchPaneOpen={props.hasSearchPaneOpen}
                        openBottomPanel={props.openBottomPanel}
                        onOpenVersionsDock={props.onOpenVersionsDock}
                        toggleReferencePane={props.toggleReferencePane}
                        toggleSearchPane={props.toggleSearchPane}
                    />
                    <SaveAndReviewChangesOverlay />
                </div>
                {props.activeWorkspacePane !== "editor" ? (
                    <div className={styles.workspaceOverlayPane}>
                        {props.activeWorkspacePane === "settings" ? (
                            <SettingsPane onClose={props.closeSettingsPane} />
                        ) : props.activeWorkspacePane === "projects" ? (
                            <ProjectsPane onClose={props.closeProjectsPane} />
                        ) : (
                            <SearchPanel onClose={props.closeSearchPane} />
                        )}
                    </div>
                ) : null}
            </div>
            {props.isBottomPanelOpen ? (
                <BottomPanel
                    height={props.bottomPanelHeight}
                    onClose={props.closeBottomPanel}
                    onHeightChange={props.setBottomPanelHeight}
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
