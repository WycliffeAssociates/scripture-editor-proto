import { useLingui } from "@lingui/react/macro";
import { Group, ScrollArea, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { InfoIcon } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { AppDrawer } from "@/app/ui/components/blocks/AppDrawer.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { SearchPanel } from "@/app/ui/components/blocks/Search.tsx";
import { Toolbar } from "@/app/ui/components/blocks/Toolbar.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import type { ReferenceProject } from "@/app/ui/hooks/useReferenceProject.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

export function ProjectView() {
    const { referenceProject } = useWorkspaceContext();
    const [opened, { open, close }] = useDisclosure(false);
    const { isSm, mobileTab, setMobileTab } = useWorkspaceMediaQuery();

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
                    isSm
                        ? styles.mobileEditorsContainer
                        : styles.desktopContentGrid
                }
                style={
                    isSm
                        ? ({
                              "--show-main":
                                  mobileTab === "main" ? "block" : "none",
                              "--show-ref":
                                  mobileTab === "ref" ? "block" : "none",
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
                        isSm
                            ? styles.editorMainSmall
                            : styles.editorWrapperDesktop
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
    return (
        <nav className={styles.navRibbon}>
            <Toolbar openDrawer={props.openDrawer} />

            {props.isSmall && (
                <div className={styles.mobileRibbon}>
                    <div className={styles.mobileRibbonLeft}>
                        <PrevButton />
                    </div>

                    <LintPopover wrapperClassNames="relative" />

                    <div className={styles.mobileRibbonRight}>
                        <NextButton />
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
                    data-testid={TESTING_IDS.mobile.mainEditorTab}
                    className={props.mobileTab === "main" ? "activeTab" : ""}
                    onClick={() => props.setMobileTab("main")}
                >
                    Editor
                </button>
                <button
                    type="button"
                    data-testid={TESTING_IDS.mobile.referenceEditorTab}
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
    const { t } = useLingui();

    if (!actions.prevChapter.hasPrev) {
        return (
            <span
                data-testid={TESTING_IDS.navigation.prevChapterButtonHidden}
                className={`${styles.editorNavButton} ${styles.editorNavButtonHidden}`}
            />
        );
    }

    const isIntroduction =
        actions.prevChapter.display?.includes(t`Introduction`) || false;

    return (
        <button
            type="button"
            data-testid={TESTING_IDS.navigation.prevChapterButton}
            disabled={!actions.prevChapter.hasPrev}
            onClick={actions.prevChapter.go}
            className={`${styles.editorNavButton}`}
        >
            {isIntroduction ? (
                <Tooltip label={t`This is introductory material for this book`}>
                    <InfoIcon size={16} />
                </Tooltip>
            ) : (
                actions.prevChapter.display || ""
            )}
        </button>
    );
}
function NextButton() {
    const { actions } = useWorkspaceContext();
    const { t } = useLingui();

    if (!actions.nextChapter.hasNext) {
        return (
            <span
                data-testid={TESTING_IDS.navigation.nextChapterButtonHidden}
                className={`${styles.editorNavButton} ${styles.editorNavButtonHidden}`}
            />
        );
    }
    const isIntroduction =
        actions.nextChapter.display?.includes(t`Introduction`) || false;

    return (
        <button
            type="button"
            data-testid={TESTING_IDS.navigation.nextChapterButton}
            disabled={!actions.nextChapter.hasNext}
            onClick={actions.nextChapter.go}
            className={`${styles.editorNavButton}`}
        >
            {isIntroduction ? (
                <Tooltip label={t`This is introductory material for this book`}>
                    <InfoIcon size={16} />
                </Tooltip>
            ) : (
                actions.nextChapter.display || ""
            )}
        </button>
    );
}
