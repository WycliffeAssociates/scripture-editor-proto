import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Group, Menu, rem } from "@mantine/core";
import { BookCopy, ChevronDown, Menu as IconMenu } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { SaveAndReviewChanges } from "@/app/ui/components/blocks/DiffModal.tsx";
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

/* ---------------- Reference Project ---------------- */
function ReferenceProjectList() {
  const { t } = useLingui();
  const { allProjects, referenceProject } = useWorkspaceContext();
  const { isSm, setMobileTab } = useWorkspaceMediaQuery();
  const selected =
    allProjects.find((p) => p.id === referenceProject?.referenceProjectId)
      ?.name ?? t`Select Reference Project`;

  if (isSm) {
    return (
      <Menu
        shadow="md"
        width={220}
        data-testid={TESTING_IDS.referenceProjectTrigger}
      >
        <Menu.Target>
          <ActionIconSimple aria-label={t`Select reference project`}>
            <BookCopy size={16} />
          </ActionIconSimple>
        </Menu.Target>
        <Menu.Dropdown data-testid={TESTING_IDS.referenceProjectDropdown}>
          <Menu.Item
            onClick={() => {
              referenceProject.setReferenceProjectId(undefined);
              setMobileTab("main");
            }}
            data-testid="reference-project-clear"
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
              data-testid={TESTING_IDS.referenceProjectItem}
            >
              <span className="flex gap-1 items-center">
                {project.name}
                <span className="text-xs">
                  ({project.metadata?.language.name})
                </span>
              </span>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Menu
      shadow="md"
      width={220}
      data-testid={TESTING_IDS.referenceProjectTrigger}
    >
      <Menu.Target>
        <Button variant="light" rightSection={<ChevronDown size={16} />}>
          {selected}
        </Button>
      </Menu.Target>
      <Menu.Dropdown data-testid={TESTING_IDS.referenceProjectDropdown}>
        <Menu.Item
          onClick={() => {
            referenceProject.setReferenceProjectId(undefined);
            setMobileTab("main");
          }}
          data-testid={TESTING_IDS.referenceProjectClear}
        >
          <Trans>Clear Reference Project</Trans>
        </Menu.Item>
        {allProjects.map((project) => (
          <Menu.Item
            key={project.id}
            data-testid={TESTING_IDS.referenceProjectItem}
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

/* FontPicker moved to ProjectSettings/FontPicker.tsx */
