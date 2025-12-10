import { Trans } from "@lingui/react/macro";
import { Accordion, Drawer } from "@mantine/core";
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
            className="border-0"
            classNames={{
                close: styles.drawerClose,
            }}
        >
            <Accordion defaultValue="Projects" p="0">
                <Accordion.Item value="Projects" className="border-0" bd="none">
                    <Accordion.Control
                        data-testid={
                            TESTING_IDS.settings.accordionControlProjects
                        }
                    >
                        <h2 className="font-bold flex gap-(--mantine-spacing-xs)">
                            <Book />
                            <Trans>Projects</Trans>
                        </h2>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <ProjectList />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="Settings" className="border-0" bd="none">
                    <Accordion.Control
                        data-testid={
                            TESTING_IDS.settings.accordionControlSettings
                        }
                    >
                        <h2 className="font-bold flex gap-(--mantine-spacing-xs)">
                            <Settings />
                            <Trans>Settings</Trans>
                        </h2>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <SettingsPanel />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Drawer>
    );
}
