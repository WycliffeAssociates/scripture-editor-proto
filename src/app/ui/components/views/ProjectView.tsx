import {Button, Popover} from "@mantine/core";
import {$getNodeByKey, HISTORY_MERGE_TAG} from "lexical";
import {useRef, useState} from "react";
import {MainEditor} from "@/app/ui/components/blocks/Editor";
import {LintPopover} from "@/app/ui/components/blocks/LintPopover";
import {ReferenceEditor} from "@/app/ui/components/blocks/ReferenceEditor";
import {SearchPanel} from "@/app/ui/components/blocks/Search";
import {Toolbar} from "@/app/ui/components/blocks/Toolbar";
import {useWorkspaceContext} from "@/app/ui/contexts/WorkspaceContext";
import styles from "@/app/ui/styles/modules/Projectview.module.css";

export function ProjectView() {
  // const {search, lint, editorRef} = useWorkspaceContext();

  return (
    <div className={styles.appLayout}>
      <nav>
        <Toolbar />
      </nav>
      <div className={styles.contentGrid}>
        <SearchPanel />
        <main className={styles.mainContent}>
          <div className={styles.editorWrapper}>
            <LintPopover wrapperClassNames="absolute top-4 right-4 z-50" />
            <MainEditor />
          </div>
        </main>
        <ReferenceEditor />
      </div>
    </div>
  );
}
