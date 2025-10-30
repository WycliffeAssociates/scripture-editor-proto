import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $reverseDfs } from "@lexical/utils";
import {
    Group,
    Paper,
    Portal,
    rem,
    ScrollArea,
    Text,
    TextInput,
} from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";

export type ContextMenuItem = {
    title: string;
    onSelect: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
};

type Props = {
    items: ContextMenuItem[];
};

export function NodeContextMenuPlugin({ items }: Props) {
    const [editor] = useLexicalComposerContext();
    const [opened, setOpened] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [search, setSearch] = useState("");

    // Filter items by search text
    const filtered = items.filter((i) =>
        i.title.toLowerCase().includes(search.toLowerCase()),
    );

    // Open on right click
    useEffect(() => {
        function onContextMenu(e: MouseEvent) {
            e.preventDefault();
            setPos({ x: e.clientX, y: e.clientY });
            setOpened(true);
        }

        return editor.registerRootListener((root, prev) => {
            prev?.removeEventListener("contextmenu", onContextMenu);
            root?.addEventListener("contextmenu", onContextMenu);
        });
    }, [editor]);

    const showTooltipNearSelection = useCallback(
        (
            editor: LexicalEditor,
            setPos: (pos: { x: number; y: number }) => void,
            setOpened: (v: boolean) => void,
        ) => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            const nativeSel = window.getSelection();
            if (!nativeSel || nativeSel.rangeCount === 0) return;

            const range = nativeSel.getRangeAt(0);
            let rect = range.getBoundingClientRect();

            // If the current rect is collapsed/empty, look backwards for something with bounds
            if (!rect || (rect.width === 0 && rect.height === 0)) {
                const anchorNode = selection.anchor.getNode();
                for (const { node } of $reverseDfs(anchorNode)) {
                    if (
                        $isUSFMTextNode(node) &&
                        node.getTextContentSize() > 0
                    ) {
                        const dom = editor.getElementByKey(node.getKey());
                        if (dom) {
                            const r = dom.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) {
                                rect = r;
                                break;
                            }
                        }
                    }
                }
            }

            // If still nothing, bail
            if (!rect || (rect.width === 0 && rect.height === 0)) return;
            const pos = {
                x: rect.left + rect.width / 2,
                y: rect.bottom + 6,
            };
            console.log({ pos });
            setPos(pos);
            setOpened(true);
        },
        [],
    );

    useEffect(() => {
        return editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                const macCmdCombo =
                    event.metaKey && event.key.toLowerCase() === "k";
                const winCtrlCombo =
                    event.ctrlKey && event.key.toLowerCase() === "k";

                const isCmdK = macCmdCombo || winCtrlCombo;

                if (!isCmdK) return false;

                event.preventDefault();

                // Try to position at cursor
                editor.getEditorState().read(() => {
                    showTooltipNearSelection(editor, setPos, setOpened);
                });

                return true;
            },
            COMMAND_PRIORITY_HIGH,
        );
    }, [editor, showTooltipNearSelection]);

    if (!opened) return null;

    return (
        <ContextMenu
            pos={pos}
            search={search}
            setSearch={setSearch}
            filtered={filtered}
            isOpen={opened}
            setIsOpen={setOpened}
            editor={editor}
        />
    );
}

type ContextMenuProps = {
    pos: { x: number; y: number };
    search: string;
    setSearch: (v: string) => void;
    filtered: {
        title: string;
        onSelect: () => void;
        disabled?: boolean;
        icon?: React.ReactNode;
    }[];
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    editor: LexicalEditor;
};

function ContextMenu({
    pos,
    search,
    setSearch,
    filtered,
    isOpen,
    setIsOpen,
    editor,
}: ContextMenuProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const firstButtonRef = useRef<HTMLDivElement>(null);
    const clickOutSideRef = useClickOutside(() => setIsOpen(false));

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
            if (e.key === "Tab") {
                e.preventDefault();
                firstButtonRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, setIsOpen]);

    if (!isOpen) return null;

    return (
        <Portal>
            <Paper
                ref={clickOutSideRef}
                shadow="lg"
                radius="md"
                withBorder
                style={{
                    position: "fixed",
                    top: pos.y,
                    left: pos.x,
                    transform: "translate(4px, 4px)",
                    zIndex: 2000,
                    width: 240,
                    borderColor: "var(--mantine-color-blue-filled)",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        background: "var(--mantine-color-blue-filled)",
                        color: "white",
                        padding: rem(6),
                        fontSize: rem(13),
                        fontWeight: 600,
                    }}
                >
                    Actions
                </div>

                <TextInput
                    ref={searchRef}
                    placeholder="Search…"
                    size="xs"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    styles={{
                        input: {
                            border: "none",
                            borderBottom:
                                "1px solid var(--mantine-color-blue-filled)",
                            borderRadius: 0,
                            outline: "none",
                            boxShadow: "none",
                        },
                    }}
                />

                <ScrollArea.Autosize mah={240}>
                    {filtered.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" py={8}>
                            No results
                        </Text>
                    ) : (
                        filtered.map((item, i) => (
                            <Group
                                key={item.title}
                                ref={i === 0 ? firstButtonRef : undefined}
                                p="xs"
                                gap="xs"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (item.disabled) return;
                                    setIsOpen(false);
                                    editor.update(() => item.onSelect());
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (item.disabled) return;
                                        setIsOpen(false);
                                        editor.update(() => item.onSelect());
                                    }
                                }}
                                style={{
                                    cursor: item.disabled
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity: item.disabled ? 0.5 : 1,
                                    transition: "background 0.1s",
                                }}
                                onMouseEnter={(e) => {
                                    if (!item.disabled)
                                        e.currentTarget.style.background =
                                            "#f1f5ff";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                        "transparent";
                                }}
                                tabIndex={0}
                            >
                                {item.icon}
                                <Text size="sm">{item.title}</Text>
                            </Group>
                        ))
                    )}
                </ScrollArea.Autosize>
            </Paper>
        </Portal>
    );
}
