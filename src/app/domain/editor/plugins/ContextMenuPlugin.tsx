import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
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
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    $setSelection,
    type BaseSelection,
    COMMAND_PRIORITY_HIGH,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
} from "lexical";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";

function calculateMenuPosition(
    touchPoint: { x: number; y: number },
    isMobile: boolean,
): { x: number; y: number } {
    if (isMobile) {
        // Center on screen for mobile
        return {
            x: window.innerWidth / 2 - 120, // Half of menu width
            y: window.innerHeight / 2 - 150, // Approximate center accounting for height
        };
    }

    // Desktop: Use touch point with boundary checking
    const menuWidth = 240;
    const menuHeight = 300; // Estimated max height
    const offset = 4;

    let x = touchPoint.x + offset;
    let y = touchPoint.y + offset;

    // Boundary checks
    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - offset;
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - offset;
    }
    if (x < offset) x = offset;
    if (y < offset) y = offset;

    return { x, y };
}

export type ContextMenuItem = {
    title: React.ReactNode;
    marker?: string;
    onSelect: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    type: "markerAction" | "controlAction" | "searchAction";
    doHide?: () => boolean;
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

export function NodeContextMenuPlugin() {
    const [editor] = useLexicalComposerContext();
    const [opened, setOpened] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [search, setSearch] = useState("");
    const { actions, search: searchApi } = useWorkspaceContext();
    const { isXs, isSm } = useWorkspaceMediaQuery();
    const [suggestedSearchApiTerm, setSuggestedSearchApiTerm] = useState("");
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

    const extractSearchTerm = useCallback(() => {
        let searchTerm = "";

        // First check for native selection (from right-click/double-click)
        const nativeSel = window.getSelection();
        if (nativeSel && nativeSel.rangeCount > 0) {
            const range = nativeSel.getRangeAt(0);
            searchTerm = range.toString().trim();
            if (searchTerm) {
                return searchTerm;
            }
        }

        // Fall back to Lexical selection logic
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                if (!selection.isCollapsed()) {
                    // Use selected text if there's a range selection
                    searchTerm = selection.getTextContent();
                } else {
                    // Extract word at cursor if selection is collapsed
                    const anchorNode = selection.anchor.getNode();
                    if ($isUSFMTextNode(anchorNode)) {
                        const text = anchorNode.getTextContent();
                        const offset = selection.anchor.offset;

                        // Find word start (move backward until non-word character)
                        let start = offset;
                        while (start > 0 && /\w/.test(text[start - 1])) {
                            start--;
                        }

                        // Find word end (move forward until non-word character)
                        let end = offset;
                        while (end < text.length && /\w/.test(text[end])) {
                            end++;
                        }

                        if (start !== end) {
                            searchTerm = text.slice(start, end);
                        }
                    }
                }
            }
        });

        return searchTerm;
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
                title: <Trans>Find "{suggestedSearchApiTerm || ""}"</Trans>,
                type: "searchAction",
                doHide: () =>
                    !suggestedSearchApiTerm ||
                    suggestedSearchApiTerm.length === 0,
                onSelect: () => {
                    const text = suggestedSearchApiTerm;
                    if (text) {
                        searchApi.onSearchChange(text);
                        searchApi.setIsSearchPaneOpen(true);
                    }
                },
            },
            {
                title: <Trans>Insert verse marker</Trans>,
                marker: "v",
                type: "markerAction",
                onSelect: () => insertMarker("v"),
            },
            {
                title: <Trans>Insert paragraph marker</Trans>,
                marker: "p",
                type: "markerAction",
                onSelect: () => insertMarker("p"),
            },
            {
                title: <Trans>Insert chapter label</Trans>,
                marker: "cl",
                type: "markerAction",
                onSelect: () => insertMarker("cl"),
            },
            {
                title: <Trans>Insert paragraph marker (at margin)</Trans>,
                marker: "m",
                type: "markerAction",
                onSelect: () => insertMarker("m"),
            },
            {
                title: <Trans>Insert poetry marker (one level indent)</Trans>,
                marker: "q1",
                type: "markerAction",
                onSelect: () => insertMarker("q1"),
            },
            {
                title: <Trans>Insert poetry marker (two level indent)</Trans>,
                marker: "q2",
                type: "markerAction",
                onSelect: () => insertMarker("q2"),
            },
            {
                title: <Trans>Insert poetry marker (three level indent)</Trans>,
                marker: "q3",
                type: "markerAction",
                onSelect: () => insertMarker("q3"),
            },

            {
                title: <Trans>Lock markers</Trans>,
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
                title: <Trans>Unlock markers</Trans>,
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersMutableState: EditorMarkersMutableStates.MUTABLE,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: <Trans>Change markers to always visible</Trans>,
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.ALWAYS,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: <Trans>Change markers to visible when editing</Trans>,
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.WHEN_EDITING,
                    });
                },
                // icon: <Lock size={16} />,
            },
            {
                title: <Trans>Change markers to never visible</Trans>,
                type: "controlAction",
                onSelect: () => {
                    actions.adjustWysiwygMode({
                        markersViewState: EditorMarkersViewStates.NEVER,
                    });
                },
                // icon: <Lock size={16} />,
            },
        ],
        [insertMarker, actions, searchApi, suggestedSearchApiTerm],
    );

    // Filter items by search text
    const filtered = contextMenuItemsToShow.filter(
        (i) =>
            (!i.doHide?.() &&
                (typeof i.title === "string"
                    ? i.title.toLowerCase().includes(search.toLowerCase())
                    : String(i.title)
                          .toLowerCase()
                          .includes(search.toLowerCase()))) ||
            i.marker?.toLowerCase().includes(search.toLowerCase()),
    );

    // Open on right click
    useEffect(() => {
        function onContextMenu(e: MouseEvent) {
            e.preventDefault();
            const isMobile = isXs || isSm;
            const menuPos = calculateMenuPosition(
                { x: e.clientX, y: e.clientY },
                isMobile,
            );
            setPos(menuPos);
            setOpened(true);

            const searchTerm = extractSearchTerm();
            if (searchTerm) {
                setSuggestedSearchApiTerm(searchTerm);
            }
        }

        return editor.registerRootListener((root, prev) => {
            prev?.removeEventListener("contextmenu", onContextMenu);
            root?.addEventListener("contextmenu", onContextMenu);
        });
    }, [editor, isXs, isSm, extractSearchTerm]);

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
            const touchPoint = {
                x: rect.left + rect.width / 2,
                y: rect.bottom + 6,
            };
            const isMobile = isXs || isSm;
            const menuPos = calculateMenuPosition(touchPoint, isMobile);
            setPos(menuPos);
            setOpened(true);
        },
        [isXs, isSm],
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

                const searchTerm = extractSearchTerm();
                if (searchTerm) {
                    setSuggestedSearchApiTerm(searchTerm);
                }

                // Try to position at cursor
                editor.getEditorState().read(() => {
                    showTooltipNearSelection(editor, setPos, setOpened);
                });

                return true;
            },
            COMMAND_PRIORITY_HIGH,
        );
    }, [editor, showTooltipNearSelection, extractSearchTerm]);

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
        if (item.type === "searchAction") {
            item.onSelect();
        } else {
            editor.update(() => item.onSelect());
        }
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
                data-testid={TESTING_IDS.contextMenu.container}
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
                    <Trans>Actions</Trans>
                </div>

                <TextInput
                    ref={searchRef}
                    data-testid={TESTING_IDS.contextMenu.searchInput}
                    placeholder={t`Search…`}
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
                            <Trans>No results</Trans>
                        </Text>
                    ) : (
                        filtered.map((item, i) => (
                            <Group
                                className={`${item === selected ? "bg-(--mantine-color-primary-0)" : ""}`}
                                key={item.title?.toString()}
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
                                            "var(--mantine-color-primary-light)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                        "transparent";
                                }}
                                tabIndex={0}
                                data-testid={
                                    item.type === "searchAction"
                                        ? TESTING_IDS.contextMenu.searchAction
                                        : undefined
                                }
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
