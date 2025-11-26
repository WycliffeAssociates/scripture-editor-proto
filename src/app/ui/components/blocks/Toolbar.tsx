import { useLingui } from "@lingui/react/macro";
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
import { Link, useRouter } from "@tanstack/react-router";
import {
  BookCopy,
  ChevronDown,
  Code,
  Menu as IconMenu,
  Plus,
} from "lucide-react";
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
import { HistoryButtons } from "@/app/ui/components/primitives/HistoryButton.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function Toolbar({ openDrawer }: { openDrawer: () => void }) {
  return (
    <Group align="center" py="xs" gap="md" display="flex" className="">
      <ActionIconSimple
        onClick={openDrawer}
        aria-label="Open project drawer"
        className="text-(--mantine-color-default-text)!"
      >
        <IconMenu size={rem(14)} />
      </ActionIconSimple>

      {/* Undo / Redo */}
      <HistoryButtons />

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
  const { t } = useLingui();
  const { actions, project } = useWorkspaceContext();
  const { appSettings, updateAppSettings } = project;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={t`Project & Settings`}
      padding="md"
      size="xs"
      className="toolbar-drawer"
    >
      <Accordion variant="separated" multiple>
        <Accordion.Item value="projects">
          <Accordion.Control>{t`Projects`}</Accordion.Control>
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
          <Accordion.Control>{t`Settings`}</Accordion.Control>
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
                <Text fw={600}>{t`Editor mode`}</Text>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Tooltip
                    label={t`Switch to source mode`}
                    withArrow
                    openDelay={150}
                  >
                    <ActionIcon
                      variant="default"
                      onClick={() => actions.toggleToSourceMode()}
                      aria-label={t`Switch to source mode`}
                    >
                      <Code size={16} />
                    </ActionIcon>
                  </Tooltip>

                  <SegmentedControl
                    value={appSettings.markersMutableState}
                    onChange={(value) => {
                      actions.adjustWysiwygMode({
                        markersMutableState: value as EditorMarkersMutableState,
                      });
                    }}
                    data={[
                      {
                        value: EditorMarkersMutableStates.IMMUTABLE,
                        label: t`Lock markers`,
                      },
                      {
                        value: EditorMarkersMutableStates.MUTABLE,
                        label: t`Unlock markers`,
                      },
                    ]}
                  />

                  <SegmentedControl
                    value={appSettings.markersViewState}
                    onChange={(value) => {
                      actions.adjustWysiwygMode({
                        markersViewState: value as EditorMarkersViewState,
                      });
                    }}
                    data={[
                      {
                        value: EditorMarkersViewStates.ALWAYS,
                        label: t`Always`,
                      },
                      {
                        value: EditorMarkersViewStates.WHEN_EDITING,
                        label: t`When editing`,
                      },
                      {
                        value: EditorMarkersViewStates.NEVER,
                        label: t`Never`,
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
                <Text fw={600}>{t`App language`}</Text>
                <Select
                  value={appSettings.appLanguage}
                  onChange={(v) =>
                    v &&
                    updateAppSettings({
                      appLanguage: v,
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
                <Text fw={600}>{t`Theme`}</Text>
                <Switch
                  checked={appSettings.colorScheme === "dark"}
                  onChange={(e) =>
                    updateAppSettings({
                      colorScheme: e.currentTarget.checked ? "dark" : "light",
                    })
                  }
                  aria-label={t`Toggle dark theme`}
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
                <Text fw={600}>{t`Webview zoom`}</Text>
                <NumberInput
                  value={appSettings.zoom}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(v) =>
                    typeof v === "number" && updateAppSettings({ zoom: v })
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
  const { t } = useLingui();
  const { allProjects, project } = useWorkspaceContext();
  const router = useRouter();
  const currentProject = allProjects.find(
    (p) => p.projectDirectoryPath === project.appSettings.lastProjectPath,
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
          {currentProject?.name ?? t`Select Project`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {allProjects.map((project) => (
          <Menu.Item
            key={project.projectDirectoryPath}
            onClick={() => navigateToNewProject(project.projectDirectoryPath)}
          >
            {project.name}
          </Menu.Item>
        ))}
        <Divider />
        <Menu.Item leftSection={<Plus size={14} />}>
          <Link to="/">{t`New Project`}</Link>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/* ---------------- Reference Project ---------------- */
function ReferenceProjectList() {
  const { t } = useLingui();
  const { allProjects, referenceProject } = useWorkspaceContext();
  const { isSm } = useWorkspaceMediaQuery();
  const selected =
    allProjects.find((p) => p.id === referenceProject?.referenceProjectId)
      ?.name ?? t`Select Reference Project`;

  if (isSm) {
    return (
      <Menu shadow="md" width={220}>
        <Menu.Target>
          <ActionIconSimple aria-label={t`Select reference project`}>
            <BookCopy size={16} />
          </ActionIconSimple>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => referenceProject.setReferenceProjectId(undefined)}
          >
            {t`Clear Reference Project`}
          </Menu.Item>
          {allProjects.map((project) => (
            <Menu.Item
              key={project.id}
              onClick={() =>
                referenceProject.setReferenceProjectId(
                  project.projectDirectoryPath,
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
        <Button variant="light" rightSection={<ChevronDown size={16} />}>
          {selected}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => referenceProject.setReferenceProjectId(undefined)}
        >
          Clear Reference Project
        </Menu.Item>
        {allProjects.map((project) => (
          <Menu.Item
            key={project.id}
            onClick={() =>
              referenceProject.setReferenceProjectId(
                project.projectDirectoryPath,
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
