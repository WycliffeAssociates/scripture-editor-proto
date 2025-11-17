import {
    Accordion,
    ActionIcon,
    Button,
    Divider,
    Drawer,
    Group,
    Menu,
    NumberInput,
    rem,
    SegmentedControl,
    Select,
    Switch,
    Text,
    Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Link, useRouter } from "@tanstack/react-router";
import {
    CAN_REDO_COMMAND,
    CAN_UNDO_COMMAND,
    COMMAND_PRIORITY_EDITOR,
    type LexicalEditor,
    REDO_COMMAND,
    UNDO_COMMAND,
} from "lexical";
import {
    BookCopy,
    ChevronDown,
    Code,
    Menu as IconMenu,
    Plus,
    RotateCcw,
    RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MEDIA_QUERY_SCREEN_SIZE } from "@/app/data/constants.ts";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal.tsx";
import FontPicker from "@/app/ui/components/blocks/ProjectSettings/FontPicker.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function Toolbar({ openDrawer }: { openDrawer: () => void }) {
    const { actions, editorRef } = useWorkspaceContext();
    const [canUndo, setCanUndo] = useState(true);
    const [canRedo, setCanRedo] = useState(true);
    const [localEditorCopy, setLocalEditorCopy] =
        useState<LexicalEditor | null>(editorRef?.current);
    const [listenersAttached, setListenersAttached] = useState(false);

    function attachDisabledListeners(editor: LexicalEditor) {
        if (listenersAttached) return;
        editor.registerCommand(
            CAN_UNDO_COMMAND,
            (payload: boolean) => {
                setCanUndo(Boolean(payload));
                return false; // allow other handlers
            },
            COMMAND_PRIORITY_EDITOR,
        );
        editor.registerCommand(
            CAN_REDO_COMMAND,
            (payload: boolean) => {
                setCanRedo(Boolean(payload));
                return false;
            },
            COMMAND_PRIORITY_EDITOR,
        );
    }

    return (
        <Group
            align="center"
            py="xs"
            gap="md"
            display="flex"
            className="border-y border-(--mantine-color-default-border) divide-x divide-(--mantine-color-default-border)"
        >
            <ActionIconSimple
                onClick={openDrawer}
                aria-label="Open project drawer"
                className="text-(--mantine-color-default-text)!"
            >
                <IconMenu size={rem(18)} />
            </ActionIconSimple>

            {/* Undo / Redo */}
            <ActionIconSimple
                aria-label="Undo"
                title="Undo"
                onClick={() => {
                    localEditorCopy?.dispatchCommand(UNDO_COMMAND, undefined);
                    if (!localEditorCopy && editorRef?.current) {
                        setLocalEditorCopy(editorRef.current);
                        if (!listenersAttached) {
                            attachDisabledListeners(editorRef.current);
                            setListenersAttached(true);
                        }
                    }
                }}
                disabled={!canUndo}
            >
                <RotateCcw size={rem(16)} />
            </ActionIconSimple>
            <ActionIconSimple
                aria-label="Redo"
                title="Redo"
                onClick={() => {
                    localEditorCopy?.dispatchCommand(REDO_COMMAND, undefined);
                    if (!localEditorCopy && editorRef?.current) {
                        setLocalEditorCopy(editorRef.current);
                        if (!listenersAttached) {
                            attachDisabledListeners(editorRef.current);
                            setListenersAttached(true);
                        }
                    }
                }}
                disabled={!canRedo}
            >
                <RotateCw size={rem(16)} />
            </ActionIconSimple>

            <ReferencePicker />

            {/* Keep reference project selector visible */}
            <ReferenceProjectList />

            {/* Search and save remain in toolbar */}
            <SearchInput />
            <SaveAndReviewChanges />
        </Group>
    );
}

/**
 * ProjectDrawer
 * - Contains an accordion with Project list as the first item
 * - Settings (font size, language, mode, color scheme, zoom, marker controls) as second item
 *
 * Exported so the parent (ProjectView) can opt to render the drawer itself instead.
 */
export function ProjectDrawer({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) {
    const { actions, project } = useWorkspaceContext();
    const { appSettings, updateAppSettings } = project;

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title="Project & Settings"
            padding="md"
            size="xs"
            className="toolbar-drawer"
        >
            <Accordion variant="separated" multiple>
                <Accordion.Item value="projects">
                    <Accordion.Control>Projects</Accordion.Control>
                    <Accordion.Panel>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <ProjectList />
                        </div>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="settings">
                    <Accordion.Control>Settings</Accordion.Control>
                    <Accordion.Panel>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                    }}
                                >
                                    <Text fw={600}>Font size</Text>
                                </div>
                                <FontSizeAdjust />
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <Text fw={600}>Font</Text>
                                <FontPicker />
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexDirection: "column",
                                }}
                            >
                                <Text fw={600}>Editor mode</Text>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Tooltip
                                        label="Switch to source mode"
                                        withArrow
                                        openDelay={150}
                                    >
                                        <ActionIcon
                                            variant="default"
                                            onClick={() =>
                                                actions.toggleToSourceMode()
                                            }
                                            aria-label="Switch to source mode"
                                        >
                                            <Code size={16} />
                                        </ActionIcon>
                                    </Tooltip>

                                    <SegmentedControl
                                        value={appSettings.markersMutableState}
                                        onChange={(value) => {
                                            actions.adjustWysiwygMode({
                                                markersMutableState:
                                                    value as EditorMarkersMutableState,
                                            });
                                        }}
                                        data={[
                                            {
                                                value: EditorMarkersMutableStates.IMMUTABLE,
                                                label: "Lock markers",
                                            },
                                            {
                                                value: EditorMarkersMutableStates.MUTABLE,
                                                label: "Unlock markers",
                                            },
                                        ]}
                                    />

                                    <SegmentedControl
                                        value={appSettings.markersViewState}
                                        onChange={(value) => {
                                            actions.adjustWysiwygMode({
                                                markersViewState:
                                                    value as EditorMarkersViewState,
                                            });
                                        }}
                                        data={[
                                            {
                                                value: EditorMarkersViewStates.ALWAYS,
                                                label: "Always",
                                            },
                                            {
                                                value: EditorMarkersViewStates.WHEN_EDITING,
                                                label: "When editing",
                                            },
                                            {
                                                value: EditorMarkersViewStates.NEVER,
                                                label: "Never",
                                            },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <Text fw={600}>App language</Text>
                                <Select
                                    value={appSettings.appLanguage}
                                    onChange={(v) =>
                                        v &&
                                        updateAppSettings({
                                            appLanguage: v as any,
                                        })
                                    }
                                    data={[
                                        { value: "en", label: "English" },
                                        { value: "es", label: "Español" },
                                        { value: "fr", label: "Français" },
                                    ]}
                                    w={160}
                                />
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <Text fw={600}>Theme</Text>
                                <Switch
                                    checked={appSettings.colorScheme === "dark"}
                                    onChange={(e) =>
                                        updateAppSettings({
                                            colorScheme: e.currentTarget.checked
                                                ? "dark"
                                                : "light",
                                        })
                                    }
                                    aria-label="Toggle dark theme"
                                />
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <Text fw={600}>Webview zoom</Text>
                                <NumberInput
                                    value={appSettings.zoom}
                                    min={0.5}
                                    max={3}
                                    step={0.1}
                                    onChange={(v) =>
                                        typeof v === "number" &&
                                        updateAppSettings({ zoom: v })
                                    }
                                    style={{ width: 120 }}
                                />
                            </div>
                        </div>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Drawer>
    );
}

/* ---------------- Project List ---------------- */
function ProjectList() {
    const { allProjects, project, currentProjectRoute } = useWorkspaceContext();
    const router = useRouter();
    const currentProject = allProjects.find(
        (p) => p.projectDir.name === currentProjectRoute,
    );
    const navigateToNewProject = (projectId: string) => {
        project.updateAppSettings({
            lastProjectPath: projectId,
        });
        router.navigate({
            to: `/$project`,
            params: { project: projectId },
            reloadDocument: true,
        });
    };

    return (
        <Menu shadow="md" width={220}>
            <Menu.Target>
                <Button
                    variant="default"
                    bd={"none"}
                    rightSection={<ChevronDown size={16} />}
                >
                    {currentProject?.name ?? "Select Project"}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {allProjects.map((project) => (
                    <Menu.Item
                        key={project.projectDir.path}
                        onClick={() =>
                            navigateToNewProject(project.projectDir.name)
                        }
                    >
                        {project.name}
                    </Menu.Item>
                ))}
                <Divider />
                <Menu.Item leftSection={<Plus size={14} />}>
                    <Link to="/">New Project</Link>
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

/* ---------------- Reference Project ---------------- */
function ReferenceProjectList() {
    const { allProjects, referenceProject } = useWorkspaceContext();
    const isSmall = useMediaQuery(MEDIA_QUERY_SCREEN_SIZE.SMALL);
    const selected =
        allProjects.find((p) => p.id === referenceProject?.referenceProjectId)
            ?.name ?? "Select Reference Project";

    if (isSmall) {
        return (
            <Menu shadow="md" width={220}>
                <Menu.Target>
                    <ActionIconSimple aria-label="Select reference project">
                        <BookCopy size={16} />
                    </ActionIconSimple>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        onClick={() =>
                            referenceProject.setReferenceProjectId(undefined)
                        }
                    >
                        Clear Reference Project
                    </Menu.Item>
                    {allProjects.map((project) => (
                        <Menu.Item
                            key={project.id}
                            onClick={() =>
                                referenceProject.setReferenceProjectId(
                                    project.projectDir.name,
                                )
                            }
                        >
                            {project.name}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        );
    }

    return (
        <Menu shadow="md" width={220}>
            <Menu.Target>
                <Button
                    variant="light"
                    rightSection={<ChevronDown size={16} />}
                >
                    {selected}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    onClick={() =>
                        referenceProject.setReferenceProjectId(undefined)
                    }
                >
                    Clear Reference Project
                </Menu.Item>
                {allProjects.map((project) => (
                    <Menu.Item
                        key={project.id}
                        onClick={() =>
                            referenceProject.setReferenceProjectId(
                                project.projectDir.name,
                            )
                        }
                    >
                        {project.name}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}

/* ---------------- Font Size Adjust ---------------- */
function FontSizeAdjust() {
    const { project } = useWorkspaceContext();
    const { appSettings, updateAppSettings } = project;

    const minSize = 8;
    function adjust(delta: number) {
        const num = parseFloat(appSettings.fontSize);
        const unit = appSettings.fontSize.replace(/[0-9.]/g, "") || "px";
        const newSize = `${Math.max(minSize, num + delta)}${unit}`;
        updateAppSettings({ fontSize: newSize });
    }

    return (
        <Group gap={4}>
            <ActionIcon
                variant="default"
                onClick={() => adjust(-1)}
                disabled={parseFloat(appSettings.fontSize) <= minSize}
            >
                –
            </ActionIcon>
            <Text fz="sm">{appSettings.fontSize}</Text>
            <ActionIcon variant="default" onClick={() => adjust(1)}>
                +
            </ActionIcon>
        </Group>
    );
}

/* FontPicker moved to ProjectSettings/FontPicker.tsx */
