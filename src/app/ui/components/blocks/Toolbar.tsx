import {
    ActionIcon,
    Button,
    Center,
    Divider,
    Group,
    Menu,
    SegmentedControl,
    Select,
    Text,
} from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronDown, Code, Plus } from "lucide-react";
import { useState } from "react";
import {
    type EditorMarkersMutableState,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
} from "@/app/data/editor";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal";
// import { lexicalToUSFM } from "@/app/ui/hooks/useProjectState";
// import { parseUSFM } from "@/app/ui/hooks/useProjectState";
// import { getSerializedLexicalNodes } from "@/app/ui/hooks/useProjectState";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker";
import { SearchInput } from "@/app/ui/components/blocks/SearchTrigger";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import { EditorMarkersMutableStates } from "../../../data/editor";

export function Toolbar() {
    const { actions, project, saveDiff } = useWorkspaceContext();

    // const {} = useProjectContext();

    // function seeUsfm() {
    //   if (!editorRef.current) return;
    //   const usfm = lexicalToUSFM(editorRef.current);
    //   const bookSlug = pickedFile?.identifier?.toUpperCase();
    //   const parsed = parseUSFM(usfm, bookSlug).chapters;
    //   const lexical = getSerializedLexicalNodes(parsed[0]);
    //   console.log(lexical);
    // }

    return (
        <Group
            align="center"
            py="xs"
            gap="md"
            display="flex"
            className="border-y border-[var(--mantine-color-default-border)] divide-x divide-[var(--mantine-color-default-border)]"
        >
            <ProjectList />
            <ReferencePicker />
            {/* Assume ReferencePicker is Mantine-wrapped already */}
            {/* <Button variant="subtle" onClick={seeUsfm}>See USFM</Button> */}
            <ReferenceProjectList />
            <FontSizeAdjust />
            <FontPicker />
            <ActionIcon
                variant="default"
                onClick={() => actions.toggleToSourceMode()}
            >
                <Code size={16} />
            </ActionIcon>
            <SegmentedControl
                value={project.appSettings.markersMutableState}
                onChange={(value) => {
                    actions.adjustWysiwygMode({
                        markersMutableState: value as EditorMarkersMutableState,
                        // already set view state
                    });
                }}
                data={[
                    {
                        value: EditorMarkersMutableStates.IMMUTABLE,
                        label: (
                            <Center style={{ gap: 10 }}>
                                <span>Lock markers</span>
                            </Center>
                        ),
                    },
                    {
                        value: EditorMarkersMutableStates.MUTABLE,
                        label: (
                            <Center style={{ gap: 10 }}>
                                <span>Unlock markers</span>
                            </Center>
                        ),
                    },
                ]}
            />
            <SegmentedControl
                value={project.appSettings.markersViewState}
                onChange={(value) => {
                    actions.adjustWysiwygMode({
                        // already set mutable state
                        markersViewState: value as EditorMarkersViewState,
                    });
                }}
                data={[
                    {
                        value: EditorMarkersViewStates.ALWAYS,
                        label: (
                            <Center style={{ gap: 10 }}>
                                <span>Always visible</span>
                            </Center>
                        ),
                    },
                    {
                        value: EditorMarkersViewStates.WHEN_EDITING,
                        label: (
                            <Center style={{ gap: 10 }}>
                                <span>When editing</span>
                            </Center>
                        ),
                    },
                    {
                        value: EditorMarkersViewStates.NEVER,
                        label: (
                            <Center style={{ gap: 10 }}>
                                <span>Never visible</span>
                            </Center>
                        ),
                    },
                ]}
            />
            <SearchInput />
            <button
                type="button"
                onClick={() => {
                    location.href = `${location.href}`;
                }}
            >
                reload
            </button>
            {/* <button
                type="button"
                onClick={() => {
                    ;
                    console.log(actions.toSave);
                }}
            >
                Save
            </button> */}
            <SaveAndReviewChanges />
        </Group>
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
        // update project settings to this project
        // navigate("/create");
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
                    <Link to="/create">New Project</Link>
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
                            referenceProject.setReferenceProjectId(project.id)
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
