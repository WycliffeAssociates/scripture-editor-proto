import { DATA_JS } from "@/app/data/constants.ts";
import { SaveAndReviewChangesOverlay } from "@/app/ui/components/blocks/DiffModal/DiffModal.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { SettingsPanel } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { ProjectBrowserPane } from "@/app/ui/components/blocks/ProjectSwitcher/ProjectBrowserPane.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { ReferencePanel } from "@/app/ui/components/blocks/ReferencePanel/ReferencePanel.tsx";
import { EditorToolbar } from "@/app/ui/components/primitives/EditorToolbar/index.ts";
import { FormFocusProvider } from "@/app/ui/contexts/FormFocusContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

import { SearchPanel } from "../search-panel/SearchPanel.tsx";

interface EditorPaneProps {
  isSmall: boolean;
}

function EditorPane(props: EditorPaneProps) {
  return (
    <div
      data-js={DATA_JS.editorScrollContainer}
      className={
        props.isSmall ? styles.editorMainSmall : styles.editorWrapperDesktop
      }
    >
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
        props.isSmall ? styles.editorReferenceSmall : styles.referenceColumn
      }
    >
      <ReferencePanel />
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
}

function WorkspacePaneStack(props: WorkspacePaneStackProps) {
  return (
    <div className={styles.workspacePaneStack}>
      <div className={styles.workspaceEditorPane}>
        <EditorPane isSmall={props.isSmall} />
      </div>
    </div>
  );
}

interface EditorsShellProps {
  isSmall: boolean;
  hasReferenceResource: boolean;
  hasSearchPaneOpen: boolean;
  isSearchDocked?: boolean;
  activeWorkspacePane: WorkspacePane;
  closeProjectsPane: () => void;
  closeSettingsPane: () => void;
  closeSearchPane: () => void;
  toggleReferencePane: () => void;
  toggleSearchPane: () => void;
}

function EditorsShell(props: EditorsShellProps) {
  // Docked search reveals the editor beside the find panel (desktop only). The
  // editor stays mounted in place throughout — only the surrounding layout
  // shifts — so the Lexical instance and its pipelines are never torn down.
  const isSearchDocked =
    props.activeWorkspacePane === "search" &&
    Boolean(props.isSearchDocked) &&
    !props.isSmall;

  // While docked, the editor takes the whole revealed slot. The reference
  // column is suppressed here — otherwise it shares the narrow docked track and
  // crowds the editor down to a sliver (the reference picker is still reachable
  // from inside the find controls).
  const showReferencePane = props.hasReferenceResource && !isSearchDocked;

  const contentGridClassName = props.isSmall
    ? styles.mobileEditorsContainer
    : `${
        showReferencePane
          ? styles.desktopContentGridWithReference
          : styles.desktopContentGrid
      }${isSearchDocked ? ` ${styles.desktopContentGridDocked}` : ""}`;

  return (
    <section
      className={
        props.isSmall
          ? styles.workspaceShellMobile
          : styles.workspaceShellDesktop
      }
    >
      <div
        className={`${styles.workspaceEditorsStage}${
          isSearchDocked ? ` ${styles.workspaceEditorsStageDocked}` : ""
        }`}
      >
        {/* Full-width toolbar bar — spans the reference + editor row beneath
                    it. Covered by the overlay pane when a non-editor pane
                    (settings/projects/search) is active, and hidden entirely
                    while search is docked (the editing surface stays clean). */}
        {isSearchDocked ? null : (
          <div className={styles.editorToolbarRow}>
            <EditorToolbar
              isReferencePaneOpen={props.hasReferenceResource}
              onToggleReferencePane={props.toggleReferencePane}
              isSearchPaneOpen={props.hasSearchPaneOpen}
              onToggleSearchPane={props.toggleSearchPane}
            />
          </div>
        )}
        <div className={contentGridClassName}>
          {showReferencePane ? <ReferencePane isSmall={props.isSmall} /> : null}
          <WorkspacePaneStack isSmall={props.isSmall} />
          <SaveAndReviewChangesOverlay />
        </div>
        {props.activeWorkspacePane !== "editor" ? (
          <div
            className={`${styles.workspaceOverlayPane}${
              isSearchDocked ? ` ${styles.workspaceOverlayPaneDocked}` : ""
            }`}
          >
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
    </section>
  );
}

interface WorkspaceMainShellProps extends EditorsShellProps {}

export function WorkspaceMainShell(props: WorkspaceMainShellProps) {
  return (
    <div className={styles.workspaceMain}>
      <FormFocusProvider>
        <EditorsShell {...props} />
      </FormFocusProvider>
    </div>
  );
}
