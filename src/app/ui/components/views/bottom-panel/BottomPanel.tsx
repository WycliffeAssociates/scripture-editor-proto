import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { CloudPanelContent } from "./CloudPanel.tsx";
import { ProblemsPanelContent } from "./ProblemsPanel.tsx";
import { VersionsPanelContent } from "./VersionsPanel.tsx";

export type BottomPanelTab = "problems" | "cloud" | "versions";

export function BottomPanel(props: {
    activeTab: BottomPanelTab;
    height: number;
    onClose: () => void;
    onHeightChange: (height: number) => void;
    onTabChange: (tab: BottomPanelTab) => void;
}) {
    const resizeStateRef = useRef<{
        startY: number;
        startHeight: number;
    } | null>(null);

    useEffect(() => {
        function handlePointerMove(event: PointerEvent) {
            const resizeState = resizeStateRef.current;
            if (!resizeState) return;

            const deltaY = resizeState.startY - event.clientY;
            const nextHeight = clampBottomPanelHeight(
                resizeState.startHeight + deltaY,
            );
            props.onHeightChange(nextHeight);
        }

        function handlePointerUp() {
            resizeStateRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [props]);

    function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
        resizeStateRef.current = {
            startY: event.clientY,
            startHeight: props.height,
        };
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
    }

    return (
        <section
            className={styles.bottomPanel}
            style={{ height: `${props.height}px` }}
        >
            <button
                type="button"
                aria-label="Resize bottom panel"
                className={styles.bottomPanelResizeHandle}
                onPointerDown={handleResizeStart}
            />
            <div className={styles.bottomPanelHeader}>
                <BottomPanelTabs
                    activeTab={props.activeTab}
                    onTabChange={props.onTabChange}
                />
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.referenceToggleButton}
                    aria-label="Close bottom panel"
                    onClick={props.onClose}
                >
                    <X size={16} />
                </Button>
            </div>
        </section>
    );
}

function clampBottomPanelHeight(height: number) {
    return Math.min(Math.max(height, 120), 420);
}

function BottomPanelTabs(props: {
    activeTab: BottomPanelTab;
    onTabChange: (tab: BottomPanelTab) => void;
}) {
    const { lint } = useWorkspaceContext();

    return (
        <BaseTabs.Root
            value={props.activeTab}
            onValueChange={(value) => {
                if (
                    value === "problems" ||
                    value === "cloud" ||
                    value === "versions"
                ) {
                    props.onTabChange(value);
                }
            }}
            className={styles.bottomPanelTabsRoot}
        >
            <BaseTabs.List className={styles.bottomPanelTabsList}>
                <BaseTabs.Tab
                    value="problems"
                    className={styles.bottomPanelTabTrigger}
                >
                    <span>Problems</span>
                    <span className={styles.bottomPanelTabCount}>
                        {lint.allIssues.length}
                    </span>
                </BaseTabs.Tab>
                <BaseTabs.Tab
                    value="cloud"
                    className={styles.bottomPanelTabTrigger}
                >
                    <span>Cloud</span>
                </BaseTabs.Tab>
                <BaseTabs.Tab
                    value="versions"
                    className={styles.bottomPanelTabTrigger}
                >
                    <span>Versions</span>
                </BaseTabs.Tab>
            </BaseTabs.List>
            <BaseTabs.Panel
                value="problems"
                className={styles.bottomPanelTabPanel}
            >
                <ProblemsPanelContent />
            </BaseTabs.Panel>
            <BaseTabs.Panel
                value="cloud"
                className={styles.bottomPanelTabPanel}
            >
                <CloudPanelContent />
            </BaseTabs.Panel>
            <BaseTabs.Panel
                value="versions"
                className={styles.bottomPanelTabPanel}
            >
                <VersionsPanelContent />
            </BaseTabs.Panel>
        </BaseTabs.Root>
    );
}
