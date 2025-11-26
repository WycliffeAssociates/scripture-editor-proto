import { Group, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { AppDrawer } from "@/app/ui/components/blocks/AppDrawer.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { SearchPanel } from "@/app/ui/components/blocks/Search.tsx";
import { Toolbar } from "@/app/ui/components/blocks/Toolbar.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import type { ReferenceProject } from "@/app/ui/hooks/useReferenceProject.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

export function ProjectView() {
  const { referenceProject } = useWorkspaceContext();
  const [opened, { open, close }] = useDisclosure(false);
  const { isSm } = useWorkspaceMediaQuery();
  // const isSmall = !isBig;

  // Only used on mobile tabs
  const [mobileTab, setMobileTab] = useState<"main" | "ref">("main");

  return (
    <div
      className={
        referenceProject.referenceProjectId
          ? styles.appLayoutWithReference
          : styles.appLayout
      }
    >
      <TopToolbar isSmall={isSm} openDrawer={open} />

      {/* MOBILE TABS (CSS toggles visibility, editors remain mounted) */}
      <MobileReferenceTabs
        isSmall={isSm}
        referenceProject={referenceProject}
        mobileTab={mobileTab}
        setMobileTab={setMobileTab}
      />

      {/* EDITORS ALWAYS MOUNTED — only layout changes */}
      <div
        className={
          isSm ? styles.mobileEditorsContainer : styles.desktopContentGrid
        }
        style={
          isSm
            ? ({
                "--show-main": mobileTab === "main" ? "block" : "none",
                "--show-ref": mobileTab === "ref" ? "block" : "none",
              } as React.CSSProperties)
            : undefined
        }
      >
        {/* Desktop search panel */}
        <SearchPanel />

        {/* Main editor area */}
        <ScrollArea
          offsetScrollbars={"y"}
          type={isSm ? "always" : "hover"}
          className={
            isSm ? styles.editorMainSmall : styles.editorWrapperDesktop
          }
        >
          <div className={styles.editor}>
            {!isSm && (
              <Group
                justify="space-between"
                classNames={{
                  root: "sticky top-0 z-50 bg-[var(--mantine-color-body)] py-1",
                }}
              >
                <PrevButton />
                <LintPopover wrapperClassNames="" />
                <NextButton />
              </Group>
            )}
            <MainEditor />
          </div>
        </ScrollArea>

        {/* Reference editor */}
        <ScrollArea
          offsetScrollbars={"y"}
          className={isSm ? styles.editorReferenceSmall : ""}
          type={isSm ? "always" : "hover"}
        >
          <ReferenceEditor />
        </ScrollArea>
      </div>

      <AppDrawer opened={opened} close={close} />
    </div>
  );
}

function TopToolbar(props: { isSmall: boolean; openDrawer: () => void }) {
  const { actions } = useWorkspaceContext();

  return (
    <nav className={styles.navRibbon}>
      <Toolbar openDrawer={props.openDrawer} />

      {props.isSmall && (
        <div className={styles.mobileRibbon}>
          <div className={styles.mobileRibbonLeft}>
            {actions.prevChapter.hasPrev && <PrevButton />}
          </div>

          <LintPopover wrapperClassNames="relative" />

          <div className={styles.mobileRibbonRight}>
            {actions.nextChapter.hasNext && <NextButton />}
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileReferenceTabs(props: {
  isSmall: boolean;
  referenceProject: ReferenceProject;
  mobileTab: "main" | "ref";
  setMobileTab: (tab: "main" | "ref") => void;
}) {
  return (
    props.isSmall &&
    props.referenceProject.referenceProjectId && (
      <div className={styles.mobileTabsBar}>
        <button
          type="button"
          className={props.mobileTab === "main" ? "activeTab" : ""}
          onClick={() => props.setMobileTab("main")}
        >
          Editor
        </button>
        <button
          type="button"
          className={props.mobileTab === "ref" ? "activeTab" : ""}
          onClick={() => props.setMobileTab("ref")}
        >
          Reference
        </button>
      </div>
    )
  );
}

function PrevButton() {
  const { actions } = useWorkspaceContext();
  return (
    <button
      type="button"
      disabled={!actions.prevChapter.hasPrev}
      onClick={actions.prevChapter.go}
      className={`${styles.editorNavButton} ${!actions.prevChapter.hasPrev ? styles.editorNavButtonHidden : ""}`}
    >
      {actions.prevChapter.display}
    </button>
  );
}
function NextButton() {
  const { actions } = useWorkspaceContext();
  return (
    <button
      type="button"
      disabled={!actions.nextChapter.hasNext}
      onClick={actions.nextChapter.go}
      className={`${styles.editorNavButton} ${!actions.nextChapter.hasNext ? styles.editorNavButtonHidden : ""}`}
      data-css-vars="true"
    >
      {actions.nextChapter.display}
    </button>
  );
}
