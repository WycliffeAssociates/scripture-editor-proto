import { Trans } from "@lingui/react/macro";
import { Accordion, Drawer, Group, Text } from "@mantine/core";
import { Book, Settings } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { SettingsPanel } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { ProjectList } from "@/app/ui/components/primitives/ProjectList/ProjectList.tsx";
import styles from "../../styles/modules/AppDrawer.module.css";
export type AppDrawerProps = {
    opened: boolean;
    close: () => void;
};

export function AppDrawer({ opened, close }: AppDrawerProps) {
    return (
        <Drawer
            opened={opened}
            onClose={close}
            classNames={{
                close: styles.drawerClose,
            }}
        >
            <Accordion defaultValue="Projects" p="0">
                <Accordion.Item value="Projects" bd="none">
                    <Accordion.Control
                        data-testid={
                            TESTING_IDS.settings.accordionControlProjects
                        }
                    >
                        <Group gap="xs" align="center">
                            <Book size={16} />
                            <Text fw={700}>
                                <Trans>Projects</Trans>
                            </Text>
                        </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <ProjectList />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="Settings" bd="none">
                    <Accordion.Control
                        data-testid={
                            TESTING_IDS.settings.accordionControlSettings
                        }
                    >
                        <Group gap="xs" align="center">
                            <Settings size={16} />
                            <Text fw={700}>
                                <Trans>Settings</Trans>
                            </Text>
                        </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <SettingsPanel />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Drawer>
    );
}
