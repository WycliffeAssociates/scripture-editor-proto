import {
    Accordion,
    ActionIcon,
    Button,
    Divider,
    Drawer,
    Group,
    Menu,
    NumberInput,
    SegmentedControl,
    Select,
    Switch,
    Text,
    Tooltip,
} from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronDown, Code, Menu as IconMenu, Plus } from "lucide-react";
import { useState } from "react";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function Toolbar() {
    const { actions, project } = useWorkspaceContext();
    const [drawerOpened, setDrawerOpened] = useState(false);

    // Minimal toolbar: provide a single control to open the drawer (project + settings)
    // and keep frequently used controls visible.
    return (
        <>
            <Group
                align="center"
                py="xs"
                gap="md"
                display="flex"
                className="border-y border-(--mantine-color-default-border) divide-x divide-(--mantine-color-default-border)"
            >
                <Tooltip
                    label="Open project & settings"
                    withArrow
                    openDelay={150}
                >
                    <ActionIcon
                        variant="default"
                        onClick={() => setDrawerOpened(true)}
                        aria-label="Open project drawer"
                    >
                        <IconMenu size={16} />
                    </ActionIcon>
                </Tooltip>

                <ReferencePicker />

                {/* Keep reference project selector visible */}
                <ReferenceProjectList />

                {/* Search and save remain in toolbar */}
                <SearchInput />
                <SaveAndReviewChanges />
            </Group>

            {/* Drawer lives here for now; exported below as a standalone component too */}
            <ProjectDrawer
                opened={drawerOpened}
                onClose={() => setDrawerOpened(false)}
            />
        </>
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
    const selected =
        allProjects.find((p) => p.id === referenceProject?.referenceProjectId)
            ?.name ?? "Select Reference Project";

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

/* ---------------- Font Picker ---------------- */
function FontPicker() {
    const { project } = useWorkspaceContext();
    const { appSettings, updateAppSettings } = project;
    const [fonts, _setFonts] = useState<string[]>(["Inter"]);
    const [_selected, _setSelected] = useState("Inter");

    // useEffect(() => {
    //   invoke<string[]>("get_system_fonts")
    //     .then((sysFonts) => {
    //       setFonts(["Inter", ...new Set(sysFonts)]);
    //     })
    //     .catch(() => {});
    // }, []);
    if (!appSettings.canAccessSystemFonts) return null;

    return (
        <Select
            data={fonts}
            value={appSettings.fontFamily}
            onChange={(value) =>
                value && updateAppSettings({ fontFamily: value })
            }
            placeholder="Font"
            searchable
            w={160}
        />
    );
}
