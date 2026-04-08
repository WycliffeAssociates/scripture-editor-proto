import { t } from "@lingui/core/macro";
import * as settingsStyles from "@/app/ui/components/blocks/ProjectSettings/settings.css.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ProjectList } from "@/app/ui/components/primitives/ProjectList/ProjectList.tsx";

interface ProjectBrowserPaneProps {
    onClose: () => void;
}

/**
 * Full-surface project browser shown inside the workspace overlay shell.
 *
 * This intentionally mirrors the settings-pane framing so switching projects
 * feels like a primary workspace action instead of a cramped transient popup.
 */
export function ProjectBrowserPane(props: ProjectBrowserPaneProps) {
    return (
        <div className={settingsStyles.panel}>
            <div className={settingsStyles.shell}>
                <div className={settingsStyles.headerOuter}>
                    <div className={settingsStyles.contentInner}>
                        <div className={settingsStyles.header}>
                            <div className={settingsStyles.title}>
                                {t`Projects`}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={settingsStyles.tabsPanel}>
                    <div className={settingsStyles.tabsPanelInner}>
                        <ProjectList />
                    </div>
                </div>

                <div className={settingsStyles.footer}>
                    <div className={settingsStyles.footerInner}>
                        <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            className={settingsStyles.footerButton}
                            onClick={props.onClose}
                        >
                            {t`Close`}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
