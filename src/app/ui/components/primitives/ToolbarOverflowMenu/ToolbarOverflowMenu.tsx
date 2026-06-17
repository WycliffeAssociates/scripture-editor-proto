import { Menu } from "@base-ui/react/menu";
import { Trans, useLingui } from "@lingui/react/macro";
import { BookCopy, ClipboardPaste, Copy, Scissors } from "lucide-react";
import type { ReactNode } from "react";

import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

import * as styles from "./toolbarOverflowMenu.css.ts";

/**
 * A content-insert action surfaced under the kebab's "Content" section. Icons
 * and localized labels are minted by the toolbar (which owns the marker
 * vocabulary) so the menu stays a dumb renderer.
 */
export interface KebabMarkerAction {
  marker: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

export interface ToolbarOverflowMenuProps {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  markerActions: KebabMarkerAction[];
  onMatchFormattingToSource?: () => void;
  onCopyEditorJson?: () => void;
}

/**
 * Toolbar overflow ("kebab") menu.
 *
 * This is the home for everything the decluttered toolbar no longer surfaces as
 * a top-level button: clipboard ops, USFM content inserts, and occasional
 * tools. It is deliberately NOT the right-click `ActionPalette` (a searchable
 * command combobox) — this is a plain, sectioned menu the user pulls down from
 * a known anchor.
 */
export function ToolbarOverflowMenu(props: ToolbarOverflowMenuProps) {
  const { t } = useLingui();
  const hasTools = Boolean(
    props.onMatchFormattingToSource || props.onCopyEditorJson,
  );

  return (
    <Menu.Root>
      <IconTooltip label={t`More actions`}>
        <Menu.Trigger className={styles.trigger} aria-label={t`More actions`}>
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
      </IconTooltip>
      <Menu.Portal style={{ zIndex: zLayer.toolbarMenu }}>
        <Menu.Positioner sideOffset={4} className={styles.positioner}>
          <Menu.Popup className={styles.popup}>
            <Menu.Group>
              <Menu.Item className={styles.item} onClick={props.onCut}>
                <Scissors size={14} className={styles.itemIcon} />
                <Trans>Cut</Trans>
              </Menu.Item>
              <Menu.Item className={styles.item} onClick={props.onCopy}>
                <Copy size={14} className={styles.itemIcon} />
                <Trans>Copy</Trans>
              </Menu.Item>
              <Menu.Item className={styles.item} onClick={props.onPaste}>
                <ClipboardPaste size={14} className={styles.itemIcon} />
                <Trans>Paste</Trans>
              </Menu.Item>
            </Menu.Group>

            {props.markerActions.length > 0 ? (
              <>
                <Menu.Separator className={styles.separator} />
                <Menu.Group>
                  <Menu.GroupLabel className={styles.groupLabel}>
                    <Trans>Content</Trans>
                  </Menu.GroupLabel>
                  {props.markerActions.map((action) => (
                    <Menu.Item
                      key={action.marker}
                      className={styles.item}
                      onClick={action.onSelect}
                    >
                      <span className={styles.itemIcon}>{action.icon}</span>
                      {action.label}
                    </Menu.Item>
                  ))}
                </Menu.Group>
              </>
            ) : null}

            {hasTools ? (
              <>
                <Menu.Separator className={styles.separator} />
                <Menu.Group>
                  <Menu.GroupLabel className={styles.groupLabel}>
                    <Trans>Tools</Trans>
                  </Menu.GroupLabel>
                  {props.onMatchFormattingToSource ? (
                    <Menu.Item
                      className={styles.item}
                      onClick={props.onMatchFormattingToSource}
                    >
                      <BookCopy size={14} className={styles.itemIcon} />
                      <Trans>Match formatting to source</Trans>
                    </Menu.Item>
                  ) : null}
                  {props.onCopyEditorJson ? (
                    <Menu.Item
                      className={styles.item}
                      onClick={props.onCopyEditorJson}
                    >
                      <Copy size={14} className={styles.itemIcon} />
                      <Trans>Copy editor JSON</Trans>
                    </Menu.Item>
                  ) : null}
                </Menu.Group>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
