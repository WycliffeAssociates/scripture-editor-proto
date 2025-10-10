import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {Link} from "@tanstack/react-router";
import {invoke} from "@tauri-apps/api/core";
import {ChevronDown, Plus, Search, Settings2} from "lucide-react";
import {useEffect, useState} from "react";
// import { lexicalToUSFM } from "@/app/ui/hooks/useProjectState";
// import { parseUSFM } from "@/app/ui/hooks/useProjectState";
// import { getSerializedLexicalNodes } from "@/app/ui/hooks/useProjectState";
import {ReferencePicker} from "@/app/ui/components/blocks/ReferencePicker";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function Toolbar() {
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
      {/* <SearchBar /> */}
      <FontSizeAdjust />
      <FontPicker />
    </Group>
  );
}

/* ---------------- Project List ---------------- */
function ProjectList() {
  const {allProjects, project, currentProjectRoute} = useProjectContext();
  const currentProject = allProjects.find(
    (p) => p.path === currentProjectRoute
  );

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
          <Menu.Item key={project.path}>
            <Link to="/$project" params={{project: project.path}}>
              {project.name}
            </Link>
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
  const {allProjects, referenceProject} = useProjectContext();
  const selected =
    allProjects.find((p) => p.path === referenceProject?.referenceProjectPath)
      ?.name ?? "Select Reference Project";

  return (
    <Menu shadow="md" width={220}>
      <Menu.Target>
        <Button variant="light" rightSection={<ChevronDown size={16} />}>
          {selected}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {allProjects.map((project) => (
          <Menu.Item
            key={project.path}
            onClick={() =>
              referenceProject.setReferenceProjectPath(project.path)
            }
          >
            {project.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/* ---------------- Search ---------------- */
function SearchBar() {
  // const {
  //   projectSearchTerm,
  //   setProjectSearchTerm,
  //   projectSearchOptions,
  //   setProjectSearchOptions,
  // } = useProjectContext();
  const [opened, setOpened] = useState(false);

  // return (
  //   <Group gap="xs" align="center">
  //     <TextInput
  //       leftSection={<Search size={14} />}
  //       placeholder="Search..."
  //       value={projectSearchTerm}
  //       onChange={(e) => setProjectSearchTerm(e.currentTarget.value)}
  //       styles={{input: {width: 180}}}
  //     />
  //     <Popover
  //       opened={opened}
  //       onChange={setOpened}
  //       width={180}
  //       position="bottom-end"
  //     >
  //       <Popover.Target>
  //         <ActionIcon variant="subtle" onClick={() => setOpened((v) => !v)}>
  //           <Settings2 size={16} />
  //         </ActionIcon>
  //       </Popover.Target>
  //       <Popover.Dropdown>
  //         <Stack gap="xs">
  //           <Checkbox
  //             label="Case sensitive"
  //             checked={projectSearchOptions.caseSensitive}
  //             onChange={(e) =>
  //               setProjectSearchOptions({
  //                 ...projectSearchOptions,
  //                 caseSensitive: e.currentTarget.checked,
  //               })
  //             }
  //           />
  //           <Checkbox
  //             label="Whole word"
  //             checked={projectSearchOptions.wholeWord}
  //             onChange={(e) =>
  //               setProjectSearchOptions({
  //                 ...projectSearchOptions,
  //                 wholeWord: e.currentTarget.checked,
  //               })
  //             }
  //           />
  //         </Stack>
  //       </Popover.Dropdown>
  //     </Popover>
  //   </Group>
  // );
}

/* ---------------- Font Size Adjust ---------------- */
function FontSizeAdjust() {
  const {project} = useProjectContext();
  const {appSettings, updateAppSettings} = project;

  const minSize = 8;
  function adjust(delta: number) {
    const num = parseFloat(appSettings.fontSize);
    const unit = appSettings.fontSize.replace(/[0-9.]/g, "") || "px";
    const newSize = `${Math.max(minSize, num + delta)}${unit}`;
    updateAppSettings({fontSize: newSize});
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
  const {project} = useProjectContext();
  const {appSettings, updateAppSettings} = project;
  const [fonts, setFonts] = useState<string[]>(["Inter"]);
  const [selected, setSelected] = useState("Inter");

  useEffect(() => {
    invoke<string[]>("get_system_fonts")
      .then((sysFonts) => {
        setFonts(["Inter", ...new Set(sysFonts)]);
      })
      .catch(() => {});
  }, []);
  if (!appSettings.canAccessSystemFonts) return null;

  return (
    <Select
      data={fonts}
      value={appSettings.fontFamily}
      onChange={(value) => value && updateAppSettings({fontFamily: value})}
      placeholder="Font"
      searchable
      w={160}
    />
  );
}
