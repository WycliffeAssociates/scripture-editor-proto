import {Button, Group, Popover} from "@mantine/core";
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
  const {actions} = useWorkspaceContext();
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
            {/* <Group gap="xs" justify="between">
              <Button
                disabled={actions.prevChapter.hasPrev}
                onClick={actions.prevChapter.go}
              >
                {actions.prevChapter.display}
              </Button>
              <Button
                disabled={!actions.nextChapter.hasNext}
                onClick={actions.nextChapter.go}
              >
                {actions.nextChapter.display}
              </Button>
            </Group> */}
            <MainEditor />
          </div>
        </main>
        <ReferenceEditor />
      </div>
    </div>
  );
}
