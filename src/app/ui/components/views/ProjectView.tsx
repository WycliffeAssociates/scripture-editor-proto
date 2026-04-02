import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import {
    AlertCircle,
    ChevronDown,
    Cloud,
    MoonStar,
    PanelBottom,
    Settings2,
    SunMedium,
    X,
} from "lucide-react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { BookChapterPickerSidebar } from "@/app/ui/components/blocks/BookChapterPickerSidebar/BookChapterPickerSidebar.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { EditorToolbar } from "@/app/ui/components/primitives/EditorToolbar/index.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

/**
 * Main workspace route view.
 *
 * By the time this component renders, the route has already loaded an editable
 * scripture workspace and the workspace provider has assembled the hooks that sit
 * on top of it. This component is responsible for layout only: toolbar, search
 * panel, main editor, and optional reference pane.
 */
export function ProjectView() {
    const [isReferencePaneOpen, setIsReferencePaneOpen] = useState(false);
    const [activeWorkspacePane, setActiveWorkspacePane] = useState<
        "editor" | "settings"
    >("editor");
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
    const [activeBottomPanelTab, setActiveBottomPanelTab] = useState<
        "problems" | "cloud"
    >("problems");
    const [bottomPanelHeight, setBottomPanelHeight] = useState(176);
    const { isSm } = useWorkspaceMediaQuery();
    const hasReferenceResource = isReferencePaneOpen;
    const layoutClassName = hasReferenceResource
        ? styles.appLayoutWithReference
        : styles.appLayout;

    return (
        <div className={layoutClassName}>
            {isSm ? (
                <MobileProjectView
                    hasReferenceResource={hasReferenceResource}
                    activeWorkspacePane={activeWorkspacePane}
                    isBottomPanelOpen={isBottomPanelOpen}
                    activeBottomPanelTab={activeBottomPanelTab}
                    bottomPanelHeight={bottomPanelHeight}
                    openSettingsPane={() => setActiveWorkspacePane("settings")}
                    closeSettingsPane={() => setActiveWorkspacePane("editor")}
                    openBottomPanel={() => setIsBottomPanelOpen(true)}
                    closeBottomPanel={() => setIsBottomPanelOpen(false)}
                    setBottomPanelHeight={setBottomPanelHeight}
                    setActiveBottomPanelTab={setActiveBottomPanelTab}
                    toggleReferencePane={() =>
                        setIsReferencePaneOpen((current) => !current)
                    }
                />
            ) : (
                <DesktopProjectView
                    hasReferenceResource={hasReferenceResource}
                    activeWorkspacePane={activeWorkspacePane}
                    isBottomPanelOpen={isBottomPanelOpen}
                    activeBottomPanelTab={activeBottomPanelTab}
                    bottomPanelHeight={bottomPanelHeight}
                    openSettingsPane={() => setActiveWorkspacePane("settings")}
                    closeSettingsPane={() => setActiveWorkspacePane("editor")}
                    openBottomPanel={() => setIsBottomPanelOpen(true)}
                    closeBottomPanel={() => setIsBottomPanelOpen(false)}
                    setBottomPanelHeight={setBottomPanelHeight}
                    setActiveBottomPanelTab={setActiveBottomPanelTab}
                    toggleReferencePane={() =>
                        setIsReferencePaneOpen((current) => !current)
                    }
                />
            )}
        </div>
    );
}

function DesktopProjectView(props: {
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    bottomPanelHeight: number;
    openSettingsPane: () => void;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <>
            <DesktopWorkspaceSidebar
                openSettingsPane={props.openSettingsPane}
            />
            <WorkspaceMainShell
                isSmall={false}
                hasReferenceResource={props.hasReferenceResource}
                activeWorkspacePane={props.activeWorkspacePane}
                isBottomPanelOpen={props.isBottomPanelOpen}
                activeBottomPanelTab={props.activeBottomPanelTab}
                bottomPanelHeight={props.bottomPanelHeight}
                closeSettingsPane={props.closeSettingsPane}
                openBottomPanel={props.openBottomPanel}
                closeBottomPanel={props.closeBottomPanel}
                setBottomPanelHeight={props.setBottomPanelHeight}
                setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                toggleReferencePane={props.toggleReferencePane}
            />
        </>
    );
}

function MobileProjectView(props: {
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    bottomPanelHeight: number;
    openSettingsPane: () => void;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <>
            <WorkspaceMainShell
                isSmall
                hasReferenceResource={props.hasReferenceResource}
                activeWorkspacePane={props.activeWorkspacePane}
                isBottomPanelOpen={props.isBottomPanelOpen}
                activeBottomPanelTab={props.activeBottomPanelTab}
                bottomPanelHeight={props.bottomPanelHeight}
                closeSettingsPane={props.closeSettingsPane}
                openBottomPanel={props.openBottomPanel}
                closeBottomPanel={props.closeBottomPanel}
                setBottomPanelHeight={props.setBottomPanelHeight}
                setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                toggleReferencePane={props.toggleReferencePane}
            />
        </>
    );
}

function WorkspaceMainShell(props: {
    isSmall: boolean;
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    bottomPanelHeight: number;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <div className={styles.workspaceMain}>
            <EditorsShell
                isSmall={props.isSmall}
                hasReferenceResource={props.hasReferenceResource}
                activeWorkspacePane={props.activeWorkspacePane}
                isBottomPanelOpen={props.isBottomPanelOpen}
                activeBottomPanelTab={props.activeBottomPanelTab}
                bottomPanelHeight={props.bottomPanelHeight}
                closeSettingsPane={props.closeSettingsPane}
                openBottomPanel={props.openBottomPanel}
                closeBottomPanel={props.closeBottomPanel}
                setBottomPanelHeight={props.setBottomPanelHeight}
                setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                toggleReferencePane={props.toggleReferencePane}
            />
        </div>
    );
}

function EditorsShell(props: {
    isSmall: boolean;
    hasReferenceResource: boolean;
    activeWorkspacePane: "editor" | "settings";
    isBottomPanelOpen: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    bottomPanelHeight: number;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    closeBottomPanel: () => void;
    setBottomPanelHeight: (height: number) => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <section
            className={
                props.isSmall
                    ? styles.workspaceShellMobile
                    : styles.workspaceShellDesktop
            }
        >
            <div
                className={
                    props.isSmall
                        ? styles.mobileEditorsContainer
                        : props.hasReferenceResource
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
                    activeBottomPanelTab={props.activeBottomPanelTab}
                    hasReferenceResource={props.hasReferenceResource}
                    closeSettingsPane={props.closeSettingsPane}
                    openBottomPanel={props.openBottomPanel}
                    setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                    toggleReferencePane={props.toggleReferencePane}
                />
            </div>
            {props.isBottomPanelOpen ? (
                <BottomPanel
                    activeTab={props.activeBottomPanelTab}
                    height={props.bottomPanelHeight}
                    onClose={props.closeBottomPanel}
                    onHeightChange={props.setBottomPanelHeight}
                    onTabChange={props.setActiveBottomPanelTab}
                />
            ) : null}
        </section>
    );
}

function WorkspacePaneStack(props: {
    isSmall: boolean;
    activeWorkspacePane: "editor" | "settings";
    activeBottomPanelTab: "problems" | "cloud";
    hasReferenceResource: boolean;
    closeSettingsPane: () => void;
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    const editorClassName =
        props.activeWorkspacePane === "editor"
            ? styles.workspacePaneVisible
            : styles.workspacePaneHidden;
    const settingsClassName =
        props.activeWorkspacePane === "settings"
            ? styles.workspacePaneVisible
            : styles.workspacePaneHidden;

    return (
        <div className={styles.workspacePaneStack}>
            <div className={editorClassName}>
                <EditorPane
                    isSmall={props.isSmall}
                    activeBottomPanelTab={props.activeBottomPanelTab}
                    hasReferenceResource={props.hasReferenceResource}
                    openBottomPanel={props.openBottomPanel}
                    setActiveBottomPanelTab={props.setActiveBottomPanelTab}
                    toggleReferencePane={props.toggleReferencePane}
                />
            </div>
            <div className={settingsClassName}>
                <SettingsPane onClose={props.closeSettingsPane} />
            </div>
        </div>
    );
}

function EditorPane(props: {
    isSmall: boolean;
    activeBottomPanelTab: "problems" | "cloud";
    hasReferenceResource: boolean;
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <div
            className={
                props.isSmall
                    ? styles.editorMainSmall
                    : styles.editorWrapperDesktop
            }
        >
            <div className={styles.editorPaneHeader}>
                <EditorToolbar
                    statusText="Saved"
                    rightSlot={
                        <EditorToolbarActions
                            activeBottomPanelTab={props.activeBottomPanelTab}
                            hasReferenceResource={props.hasReferenceResource}
                            openBottomPanel={props.openBottomPanel}
                            setActiveBottomPanelTab={
                                props.setActiveBottomPanelTab
                            }
                            toggleReferencePane={props.toggleReferencePane}
                        />
                    }
                />
            </div>
            <div className={styles.editorPanePlaceholder}>ipsum</div>
        </div>
    );
}

function EditorToolbarActions(props: {
    activeBottomPanelTab: "problems" | "cloud";
    hasReferenceResource: boolean;
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
    toggleReferencePane: () => void;
}) {
    return (
        <>
            <ThemeToggleButton />
            <BottomPanelToggleButton
                activeBottomPanelTab={props.activeBottomPanelTab}
                openBottomPanel={props.openBottomPanel}
                setActiveBottomPanelTab={props.setActiveBottomPanelTab}
            />
            <ReferenceToggleButton
                hasReferenceResource={props.hasReferenceResource}
                onToggle={props.toggleReferencePane}
            />
        </>
    );
}

function ThemeToggleButton() {
    const { actions, project } = useWorkspaceContext();
    const nextColorScheme =
        project.appSettings.colorScheme === "dark" ? "light" : "dark";
    const label =
        nextColorScheme === "dark"
            ? "Switch to dark theme"
            : "Switch to light theme";
    const icon =
        nextColorScheme === "dark" ? (
            <MoonStar size={16} />
        ) : (
            <SunMedium size={16} />
        );

    function handleClick() {
        actions.setColorScheme(nextColorScheme);
    }

    return (
        <Button
            type="button"
            variant="tertiary"
            size="sm"
            className={styles.referenceToggleButton}
            aria-label={label}
            title={label}
            onClick={handleClick}
        >
            {icon}
        </Button>
    );
}

function ReferenceToggleButton(props: {
    hasReferenceResource: boolean;
    onToggle: () => void;
}) {
    const label = props.hasReferenceResource
        ? "Hide Reference"
        : "Show Reference";

    return (
        <button
            type="button"
            className={styles.referenceToggleButton}
            onClick={props.onToggle}
        >
            {label}
        </button>
    );
}

function BottomPanelToggleButton(props: {
    activeBottomPanelTab: "problems" | "cloud";
    openBottomPanel: () => void;
    setActiveBottomPanelTab: (tab: "problems" | "cloud") => void;
}) {
    function handleClick() {
        props.setActiveBottomPanelTab("problems");
        props.openBottomPanel();
    }

    return (
        <Button
            type="button"
            variant="tertiary"
            size="sm"
            className={styles.referenceToggleButton}
            aria-label="Open bottom panel"
            title={`Open ${props.activeBottomPanelTab} panel`}
            onClick={handleClick}
        >
            <PanelBottom size={16} />
        </Button>
    );
}

function ReferencePane(props: { isSmall: boolean }) {
    return (
        <div
            className={
                props.isSmall
                    ? styles.editorReferenceSmall
                    : styles.referenceColumn
            }
        >
            <div className={styles.referencePanePlaceholder}>lorem</div>
        </div>
    );
}

function SettingsPane(props: { onClose: () => void }) {
    return (
        <div className={styles.settingsPane}>
            <div className={styles.settingsPaneHeader}>
                <div className={styles.settingsPaneTitle}>Settings</div>
                <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className={styles.referenceToggleButton}
                    aria-label="Close settings"
                    onClick={props.onClose}
                >
                    <X size={16} />
                </Button>
            </div>
            <div className={styles.settingsPaneBody}>mock settings pane</div>
        </div>
    );
}

function BottomPanel(props: {
    activeTab: "problems" | "cloud";
    height: number;
    onClose: () => void;
    onHeightChange: (height: number) => void;
    onTabChange: (tab: "problems" | "cloud") => void;
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
    return Math.min(Math.max(height, 120), 320);
}

function BottomPanelTabs(props: {
    activeTab: "problems" | "cloud";
    onTabChange: (tab: "problems" | "cloud") => void;
}) {
    return (
        <BaseTabs.Root
            value={props.activeTab}
            onValueChange={(value) => {
                if (value === "problems" || value === "cloud") {
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
                    <span className={styles.bottomPanelTabCount}>10</span>
                </BaseTabs.Tab>
                <BaseTabs.Tab
                    value="cloud"
                    className={styles.bottomPanelTabTrigger}
                >
                    <span>Cloud</span>
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
        </BaseTabs.Root>
    );
}

function ProblemsPanelContent() {
    const projectViewItems = [
        {
            icon: <AlertCircle size={14} />,
            tone: "accent" as const,
            message:
                "Imports and exports are not sorted. biome(assist/source/organizeImports)",
            meta: "[Ln 1, Col 1]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "This fragment is unnecessary. biome(lint/complexity/noUselessFragments)",
            meta: "[Ln 127, Col 9]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Unused variable `panelState` should be removed. biome(lint/correctness/noUnusedVariables)",
            meta: "[Ln 148, Col 11]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Prefer a named helper over inline callback nesting. biome(lint/style/useNamingConvention)",
            meta: "[Ln 202, Col 17]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Condition can be simplified for readability. biome(lint/complexity/useSimplifiedLogicExpression)",
            meta: "[Ln 244, Col 13]",
        },
    ];

    const mainItems = [
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Imports and exports are not sorted. biome(assist/source/organizeImports)",
            meta: "[Ln 1, Col 1]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "accent" as const,
            message:
                "Theme utility import should be grouped with app-side imports. biome(assist/source/organizeImports)",
            meta: "[Ln 7, Col 1]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Pointer handler can be moved below pure helpers. biome(lint/style/useSortedDeclarations)",
            meta: "[Ln 84, Col 5]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Avoid repeated literal title strings in bottom panel rows. biome(lint/style/noDuplicateLiterals)",
            meta: "[Ln 137, Col 21]",
        },
        {
            icon: <AlertCircle size={14} />,
            tone: "muted" as const,
            message:
                "Imports and exports are not sorted. biome(assist/source/organizeImports)",
            meta: "[Ln 1, Col 1]",
        },
    ];

    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.bottomPanelList}>
                <BottomPanelGroup
                    title="ProjectView.tsx"
                    location="src/app/ui/components/views"
                    count={String(projectViewItems.length)}
                    items={projectViewItems}
                />
                <BottomPanelGroup
                    title="main.tsx"
                    location="src/web"
                    count={String(mainItems.length)}
                    items={mainItems}
                />
            </div>
        </div>
    );
}

function CloudPanelContent() {
    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.bottomPanelList}>
                <BottomPanelGroup
                    title="Sync activity"
                    location="Remote"
                    count="2"
                    items={[
                        {
                            icon: <Cloud size={14} />,
                            tone: "muted",
                            message: "Push completed for origin/main",
                            meta: "12 seconds ago",
                        },
                        {
                            icon: <Cloud size={14} />,
                            tone: "accent",
                            message: "Remote has one newer commit available",
                            meta: "Fetch to inspect changes",
                        },
                    ]}
                />
            </div>
        </div>
    );
}

function BottomPanelGroup(props: {
    title: string;
    location: string;
    count: string;
    items: Array<{
        icon: ReactNode;
        tone: "accent" | "muted";
        message: string;
        meta: string;
    }>;
}) {
    const rows = props.items.map((item, index) => (
        <BottomPanelRow
            key={`${props.title}-${index}`}
            icon={item.icon}
            tone={item.tone}
            message={item.message}
            meta={item.meta}
        />
    ));

    return (
        <section className={styles.bottomPanelGroup}>
            <header className={styles.bottomPanelGroupHeader}>
                <span className={styles.bottomPanelGroupChevron}>
                    <ChevronDown size={14} />
                </span>
                <span className={styles.bottomPanelGroupTitle}>
                    {props.title}
                </span>
                <span className={styles.bottomPanelGroupLocation}>
                    {props.location}
                </span>
                <span className={styles.bottomPanelGroupCount}>
                    {props.count}
                </span>
            </header>
            <div>{rows}</div>
        </section>
    );
}

function BottomPanelRow(props: {
    icon: ReactNode;
    tone: "accent" | "muted";
    message: string;
    meta: string;
}) {
    const messageClassName =
        props.tone === "accent"
            ? styles.bottomPanelRowMessageAccent
            : styles.bottomPanelRowMessage;

    return (
        <div className={styles.bottomPanelRow}>
            <div className={styles.bottomPanelRowIcon}>{props.icon}</div>
            <div className={messageClassName}>{props.message}</div>
            <div className={styles.bottomPanelRowMeta}>{props.meta}</div>
        </div>
    );
}

function DesktopWorkspaceSidebar(props: { openSettingsPane: () => void }) {
    return (
        <aside className={styles.desktopSidebar}>
            <div className={styles.sidebarTop}>
                <div className={styles.sidebarSlotCard} />
            </div>

            <div className={styles.sidebarBooks}>
                <BookChapterPickerSidebar />
            </div>

            <div className={styles.sidebarBottom}>
                <button
                    type="button"
                    className={styles.sidebarAction}
                    onClick={props.openSettingsPane}
                    aria-label="Open settings pane"
                >
                    <span className={styles.sidebarActionIcon}>
                        <Settings2 size={16} />
                    </span>
                    <span>Settings</span>
                </button>
            </div>
        </aside>
    );
}
