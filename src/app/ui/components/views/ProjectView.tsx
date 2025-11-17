import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { MEDIA_QUERY_SCREEN_SIZE } from "@/app/data/constants.ts";
import { AppDrawer } from "@/app/ui/components/blocks/AppDrawer.tsx";
import { MainEditor } from "@/app/ui/components/blocks/Editor.tsx";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover.tsx";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { SearchPanel } from "@/app/ui/components/blocks/Search.tsx";
import { Toolbar } from "@/app/ui/components/blocks/Toolbar.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import styles from "@/app/ui/styles/modules/Projectview.module.css";

export function ProjectView() {
    const { actions } = useWorkspaceContext();
    const [opened, { open, close }] = useDisclosure(false);
    const isSmall = useMediaQuery(MEDIA_QUERY_SCREEN_SIZE.SMALL);

    return (
        <div className={styles.appLayout}>
            <main>
                <nav className={styles.navRibbon}>
                    <Toolbar openDrawer={open} />
                    {isSmall && (
                        <div className={styles.mobileRibbon}>
                            <div className={styles.mobileRibbonLeft}>
                                {actions.prevChapter.hasPrev && (
                                    <button
                                        type="button"
                                        disabled={!actions.prevChapter.hasPrev}
                                        onClick={actions.prevChapter.go}
                                        className={styles.editorNavButton}
                                    >
                                        <span className="w-full">
                                            {actions.prevChapter.display}
                                        </span>
                                    </button>
                                )}
                            </div>
                            <LintPopover wrapperClassNames="relative" />
                            <div className={styles.mobileRibbonRight}>
                                {actions.nextChapter.hasNext && (
                                    <button
                                        type="button"
                                        disabled={!actions.nextChapter.hasNext}
                                        onClick={actions.nextChapter.go}
                                        className={styles.editorNavButton}
                                    >
                                        <span className="w-full">
                                            {actions.nextChapter.display}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </nav>

                {isSmall ? (
                    // Mobile layout with sticky ribbon
                    <div className={styles.mobileContentGrid}>
                        {/* Main content area */}
                        <div className={styles.mobileMainContent}>
                            <div className={styles.mobileEditor}>
                                <MainEditor />
                            </div>
                            <ReferenceEditor />
                        </div>
                    </div>
                ) : (
                    // Desktop layout
                    <div className={styles.contentGrid}>
                        <SearchPanel />
                        <main className={styles.mainContent}>
                            <div className={styles.editorWrapper}>
                                {actions.prevChapter.hasPrev && (
                                    <button
                                        type="button"
                                        disabled={!actions.prevChapter.hasPrev}
                                        onClick={actions.prevChapter.go}
                                        className={styles.editorNavButton}
                                    >
                                        <span className="w-full">
                                            {actions.prevChapter.display}
                                        </span>
                                    </button>
                                )}
                                <div className={styles.editor}>
                                    <LintPopover wrapperClassNames="absolute top-4 right-4 z-50" />
                                    <MainEditor />
                                </div>
                                {actions.nextChapter.hasNext && (
                                    <button
                                        type="button"
                                        disabled={!actions.nextChapter.hasNext}
                                        onClick={actions.nextChapter.go}
                                        className={styles.editorNavButton}
                                    >
                                        <span className="w-full">
                                            {actions.nextChapter.display}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </main>
                        <ReferenceEditor />
                    </div>
                )}
            </main>
            <AppDrawer opened={opened} close={close} />
        </div>
    );
}
