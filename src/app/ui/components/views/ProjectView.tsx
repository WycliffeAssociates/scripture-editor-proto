import { MainEditor } from "@/app/ui/components/blocks/Editor";
import { LintPopover } from "@/app/ui/components/blocks/LintPopover";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor";
import { SearchPanel } from "@/app/ui/components/blocks/Search";
import { Toolbar } from "@/app/ui/components/blocks/Toolbar";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import styles from "@/app/ui/styles/modules/Projectview.module.css";

export function ProjectView() {
    const { actions } = useWorkspaceContext();
    return (
        <div className={styles.appLayout}>
            <nav>
                <Toolbar />
            </nav>
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
        </div>
    );
}
