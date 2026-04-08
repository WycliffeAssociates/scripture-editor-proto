import { Menu } from "@base-ui/react/menu";
import { Code, Copy, History } from "lucide-react";
import * as styles from "./toolbarOverflowMenu.css.ts";

export interface ToolbarOverflowMenuProps {
    onCopyEditorJson?: () => void;
    onOpenVersions?: () => void;
    onOpenDeveloperTools?: () => void;
}

export function ToolbarOverflowMenu(props: ToolbarOverflowMenuProps) {
    return (
        <Menu.Root>
            <Menu.Trigger className={styles.trigger}>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                >
                    <circle cx="8" cy="2.5" r="1.5" fill="currentColor" />
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                    <circle cx="8" cy="13.5" r="1.5" fill="currentColor" />
                </svg>
            </Menu.Trigger>
            <Menu.Portal style={{ zIndex: 10000 }}>
                <Menu.Positioner sideOffset={4} className={styles.positioner}>
                    <Menu.Popup className={styles.popup}>
                        <Menu.Item
                            className={styles.item}
                            onClick={() => props.onCopyEditorJson?.()}
                        >
                            <Copy size={14} className={styles.itemIcon} />
                            Copy editor JSON
                        </Menu.Item>
                        <Menu.Item
                            className={styles.item}
                            onClick={() => props.onOpenVersions?.()}
                        >
                            <History size={14} className={styles.itemIcon} />
                            Versions
                        </Menu.Item>
                        {props.onOpenDeveloperTools ? (
                            <Menu.Item
                                className={styles.item}
                                onClick={() => props.onOpenDeveloperTools?.()}
                            >
                                <Code size={14} className={styles.itemIcon} />
                                Developer tools
                            </Menu.Item>
                        ) : null}
                        <Menu.Separator className={styles.separator} />
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
