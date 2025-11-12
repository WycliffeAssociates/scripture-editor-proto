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
    $getNodeByKey,
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    $setSelection,
    type BaseSelection,
    COMMAND_PRIORITY_HIGH,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { checkAndSetIfLastMarker } from "../../../../core/domain/usfm/tokenParsers.ts";

export type ContextMenuItem = {
    title: string;
    marker?: string;
    onSelect: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    type: "markerAction" | "controlAction";
};

type Props = {
    items: ContextMenuItem[];
};

// {
//     title: "Unlock markers",
//     onSelect: () => {},
//     icon: <LockOpen size={16} />,
// },
// {
//     title: "Always visible",
//     onSelect: () => {},
//     icon: <Eye size={16} />,
// },
// {
//     title: "When editing",
//     onSelect: () => {},
//     icon: <EyeOff size={16} />,
// },
// {
//     title: "Never visible",
//     onSelect: () => {},
//     icon: <EyeOff size={16} />,
// },

export function NodeContextMenuPlugin({ items }: Props) {
    const [editor] = useLexicalComposerContext();
    const [opened, setOpened] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [search, setSearch] = useState("");
    const { actions } = useWorkspaceContext();
    const selToRestore = useRef<BaseSelection>(null);

    const preSelect = useCallback(() => {
        const selection = editor.getEditorState().read(() => $getSelection());
        if (!selection) return;
        const clone = selection.clone();
        selToRestore.current = clone;
    }, [editor]);
    const postSelect = useCallback(() => {
        if (!selToRestore.current) return;
        editor.update(() => {
            $setSelection(selToRestore.current);
        });
    }, [editor]);
    const insertMarker = useCallback(
        (markerNoSlash: string) => {
            editor.update(() => {
                const selection = $getSelection();
                if (!selection || !$isRangeSelection(selection)) return;
                // though might should do something else if we did want to say highlight to wrap
                if (!selection.isCollapsed()) {
                    return;
                }
                const slashMarker = `\\${markerNoSlash}`;
                const slashMarkerPadded = ` ${slashMarker} `; //any extra will be trimmed as needed in transform
                const currentNode = selection.anchor.getNode();
                if ($isUSFMTextNode(currentNode)) {
                    const ct = currentNode.getTextContent();
                    currentNode.setTextContent(
                        `${ct.slice(0, selection.anchor.offset)} ${slashMarkerPadded} ${ct.slice(selection.anchor.offset)}`,
                    );
                    currentNode.select(
                        selection.anchor.offset + slashMarkerPadded.length,
                        selection.anchor.offset + slashMarkerPadded.length,
                    );
                } else if ($isElementNode(currentNode)) {
                    const newNode = $createUSFMTextNode(slashMarkerPadded, {
                        id: guidGenerator(),
                        // metadata watcher will handle this
                        inPara: "",
                        marker: markerNoSlash,
                        tokenType: UsfmTokenTypes.text,
                    });
                    const nthChild = currentNode.getChildAtIndex(
                        selection.anchor.offset,
                    );
                    if ($isLineBreakNode(nthChild)) {
                        nthChild.insertBefore(newNode);
                        // replace line breaks
                    }
                    newNode.selectEnd();
                }
            });
        },
        [editor],
    );

    const contextMenuItemsToShow: ContextMenuItem[] = useMemo(
        () => [
            {
                title: "Insert verse marker",
                marker: "v",
                type: "markerAction",
                onSelect: () => insertMarker("v"),
            },
            {
                title: "Insert paragraph marker",
                marker: "p",
                type: "markerAction",
                onSelect: () => insertMarker("p"),
            },
            {
                title: "Insert chapter label",
                marker: "cl",
                type: "markerAction",
                onSelect: () => insertMarker("cl"),
            },
            {
                title: "Insert paragraph marker (at margin)",
                marker: "m",
                type: "markerAction",
                onSelect: () => insertMarker("m"),
            },
            {
                title: "Insert poetry marker (one level indent)",
                marker: "q1",
                type: "markerAction",
                onSelect: () => insertMarker("q1"),
            },
            {
                title: "Insert poetry marker (two level indent)",
                marker: "q2",
                type: "markerAction",
                onSelect: () => insertMarker("q2"),
            },
            {
                title: "Insert poetry marker (three level indent)",
                marker: "q3",
                type: "markerAction",
                onSelect: () => insertMarker("q3"),
            },
            {
                title: "Lock markers",
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersMutableState:
                            EditorMarkersMutableStates.IMMUTABLE,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: "Unlock markers",
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersMutableState: EditorMarkersMutableStates.MUTABLE,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: "Change markers to always visible",
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.ALWAYS,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: "Change markers to visible when editing",
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.WHEN_EDITING,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: "Change markers to never visible",
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.NEVER,
                    });
                },
                // icon: <Lock size={16} />,
            },
        ],
        [insertMarker, actions],
    );

    // Filter items by search text
    const filtered = contextMenuItemsToShow.filter(
        (i) =>
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            i.marker?.toLowerCase().includes(search.toLowerCase()),
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
                if ($isElementNode(anchorNode)) {
                    const nthChild = anchorNode.getChildAtIndex(
                        selection.anchor.offset,
                    );
                    if ($isLineBreakNode(nthChild)) {
                        const dom = editor.getElementByKey(nthChild.getKey());
                        if (dom) {
                            const r = dom.getBoundingClientRect();
                            if (r.height > 0) {
                                rect = r;
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
            preSelect={preSelect}
            postSelect={postSelect}
            editor={editor}
        />
    );
}

type ContextMenuProps = {
    pos: { x: number; y: number };
    search: string;
    setSearch: (v: string) => void;
    filtered: ContextMenuItem[];
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    preSelect: () => void;
    postSelect: () => void;
    editor: LexicalEditor;
};

function ContextMenu({
    pos,
    search,
    setSearch,
    filtered,
    isOpen,
    setIsOpen,
    preSelect,
    postSelect,
    editor,
}: ContextMenuProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const firstButtonRef = useRef<HTMLDivElement>(null);
    const clickOutSideRef = useClickOutside(() => setIsOpen(false));
    const selected = useMemo(() => {
        return search.length > 0 ? filtered[0] : undefined;
    }, [filtered, search]);

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

    function selectItem(item: ContextMenuItem) {
        setSearch("");
        if (item.type === "controlAction") {
            preSelect();
        }
        editor.update(() => item.onSelect());
        if (item.type === "controlAction") {
            postSelect();
        }
        setIsOpen(false);
    }

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
                    autoFocus={true}
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
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && selected) {
                            e.preventDefault();
                            const item = selected;
                            if (item) {
                                selectItem(item);
                            }
                        }
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
                                className={`${item === selected ? "bg-(--mantine-color-primary-0)" : ""}`}
                                key={item.title}
                                ref={i === 0 ? firstButtonRef : undefined}
                                p="xs"
                                gap="xs"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (item.disabled) return;
                                    selectItem(item);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (item.disabled) return;
                                        selectItem(item);
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
