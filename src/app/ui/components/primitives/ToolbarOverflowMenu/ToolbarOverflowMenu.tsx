import { Menu } from "@base-ui/react/menu";
import { Trans } from "@lingui/react/macro";
import { BookCopy, Copy } from "lucide-react";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import * as styles from "./toolbarOverflowMenu.css.ts";

export interface ToolbarOverflowMenuProps {
    onCopyEditorJson?: () => void;
    onMatchFormattingToSource?: () => void;
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
            <Menu.Portal style={{ zIndex: zLayer.toolbarMenu }}>
                <Menu.Positioner sideOffset={4} className={styles.positioner}>
                    <Menu.Popup className={styles.popup}>
                        {props.onMatchFormattingToSource ? (
                            <Menu.Item
                                className={styles.item}
                                onClick={() =>
                                    props.onMatchFormattingToSource?.()
                                }
                            >
                                <BookCopy
                                    size={14}
                                    className={styles.itemIcon}
                                />
                                <Trans>Match formatting to source</Trans>
                            </Menu.Item>
                        ) : null}
                        {props.onCopyEditorJson ? (
                            <Menu.Item
                                className={styles.item}
                                onClick={() => props.onCopyEditorJson?.()}
                            >
                                <Copy size={14} className={styles.itemIcon} />
                                <Trans>Copy editor JSON</Trans>
                            </Menu.Item>
                        ) : null}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
