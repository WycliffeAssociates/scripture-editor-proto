import { Trans } from "@lingui/react/macro";
import { Accordion, Drawer } from "@mantine/core";
import { Book, Settings } from "lucide-react";
import { SettingsPanel } from "@/app/ui/components/blocks/ProjectSettings/Settings.tsx";
import { ProjectList } from "@/app/ui/components/primitives/ProjectList/ProjectList.tsx";

export type AppDrawerProps = {
    opened: boolean;
    close: () => void;
};

export function AppDrawer({ opened, close }: AppDrawerProps) {
    return (
        <Drawer opened={opened} onClose={close} className="border-0">
            <Accordion defaultValue="Projects" p="0">
                <Accordion.Item value="Projects" className="border-0" bd="none">
                    <Accordion.Control>
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
                    <Accordion.Control>
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
