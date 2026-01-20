import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    Combobox,
    Group,
    Pill,
    ScrollArea,
    Text,
    TextInput,
    useCombobox,
} from "@mantine/core";
import { $getRoot } from "lexical";
import { useEffect, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { getVisibleActions } from "../../actions/registry.ts";
import type {
    ActionStep,
    EditorAction,
    EditorContext,
} from "../../actions/types.ts";
import { $isUSFMTextNode } from "../../nodes/USFMTextNode.ts";
import * as classes from "./ActionPalette.css.ts";

interface ActionPaletteProps {
    context: EditorContext;
    onClose: () => void;
}

export function ActionPalette({ context, onClose }: ActionPaletteProps) {
    const [editor] = useLexicalComposerContext();
    const [search, setSearch] = useState("");
    const [activeStep, setActiveStep] = useState<ActionStep | null>(null);
    const [activeAction, setActiveAction] = useState<EditorAction | null>(null);

    const combobox = useCombobox({
        onDropdownClose: () => {
            combobox.resetSelectedOption();
            if (!activeStep) onClose();
        },
    });

    const visibleActions = useMemo(() => getVisibleActions(context), [context]);

    const filteredActions = useMemo(() => {
        const s = search.toLowerCase();
        return visibleActions.filter((action) => {
            const label =
                typeof action.label === "function"
                    ? action.label(context)
                    : action.label;
            return (
                label.toLowerCase().includes(s) ||
                action.marker?.toLowerCase().includes(s) ||
                action.category.toLowerCase().includes(s)
            );
        });
    }, [visibleActions, search, context]);

    const groups = useMemo(() => {
        const g: Record<string, EditorAction[]> = {};
        for (const action of filteredActions) {
            if (!g[action.category]) g[action.category] = [];
            g[action.category].push(action);
        }
        return g;
    }, [filteredActions]);

    const handleSelectAction = (action: EditorAction) => {
        let result: undefined | ActionStep;

        // Capture SID for restoration after mode change
        const sid = context.currentVerse;

        editor.update(() => {
            result = action.execute(editor, context) || undefined;
        });

        // Restore focus and selection after mode change
        if (action.category === "Modes") {
            setTimeout(() => {
                editor.update(() => {
                    if (sid) {
                        // Find the first USFMTextNode with the matching SID
                        const root = $getRoot();
                        const nodes = root.getChildren();
                        // Recursive search for the SID
                        const findNodeBySid = (nodes: any[]): any => {
                            for (const node of nodes) {
                                if (
                                    $isUSFMTextNode(node) &&
                                    node.getSid() === sid
                                ) {
                                    return node;
                                }
                                if (node.getChildren) {
                                    const found = findNodeBySid(
                                        node.getChildren(),
                                    );
                                    if (found) return found;
                                }
                            }
                            return null;
                        };

                        const targetNode = findNodeBySid(nodes);
                        if (targetNode) {
                            targetNode.select();
                        }
                    }
                    editor.focus();
                });
            }, 150);
        }

        const step = result as ActionStep | undefined;
        if (step && typeof step === "object" && "onComplete" in step) {
            setActiveAction(action);
            setActiveStep(step);
            setSearch("");
        } else {
            onClose();
        }
    };

    const handleStepComplete = (value: string) => {
        if (activeStep) {
            editor.update(() => {
                activeStep?.onComplete(value, editor, context);
            });
            onClose();
        }
    };

    // Auto-focus search on mount and sync dropdown state
    useEffect(() => {
        combobox.focusTarget();
        combobox.openDropdown();
    }, [combobox]);

    // Select first option when filtered actions change (VS Code style)
    useEffect(() => {
        if (filteredActions.length > 0) {
            combobox.selectFirstOption();
        }
    }, [filteredActions, combobox]);

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
            onClose();
        }
        if (event.key === "Backspace" && search === "") {
            onClose();
        }
        if (event.key === "Tab") {
            event.preventDefault();
            combobox.selectNextOption();
        }
        if (event.key === "ArrowDown") {
            // Mantine handles ArrowDown by default.
            // Since we call combobox.openDropdown() on mount,
            // the first ArrowDown will now correctly move to the 1st item.
        }
    };

    if (activeStep) {
        return (
            <div className={classes.container}>
                <div className={classes.pillContainer}>
                    <Pill
                        withRemoveButton
                        onRemove={() => {
                            setActiveStep(null);
                            setActiveAction(null);
                        }}
                    >
                        {activeAction
                            ? typeof activeAction.label === "function"
                                ? activeAction.label(context)
                                : activeAction.label
                            : ""}
                    </Pill>
                </div>
                <TextInput
                    placeholder={activeStep.placeholder || "Enter value..."}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleStepComplete(e.currentTarget.value);
                        }
                        if (e.key === "Escape") {
                            setActiveStep(null);
                            setActiveAction(null);
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className={classes.container}>
            <Combobox
                store={combobox}
                onOptionSubmit={(val) => {
                    const action = visibleActions.find((a) => a.id === val);
                    if (action) handleSelectAction(action);
                }}
            >
                <div className={classes.header}>
                    <Combobox.Target>
                        <TextInput
                            data-testid={TESTING_IDS.contextMenu.searchInput}
                            placeholder="Search actions..."
                            value={search}
                            onChange={(event) => {
                                setSearch(event.currentTarget.value);
                                combobox.updateSelectedOptionIndex();
                            }}
                            onKeyDown={handleKeyDown}
                            className={classes.searchInput}
                            variant="unstyled"
                            autoFocus
                        />
                    </Combobox.Target>
                </div>

                <div className={classes.scrollArea}>
                    <ScrollArea.Autosize mah={400} type="scroll">
                        <Combobox.Options>
                            {Object.entries(groups).map(
                                ([category, actions]) => (
                                    <div key={category}>
                                        <div className={classes.categoryHeader}>
                                            {category}
                                        </div>
                                        {actions.map((action) => {
                                            const label =
                                                typeof action.label ===
                                                "function"
                                                    ? action.label(context)
                                                    : action.label;
                                            return (
                                                <Combobox.Option
                                                    value={action.id}
                                                    key={action.id}
                                                    className={classes.item}
                                                    data-testid={
                                                        action.category ===
                                                        "Search"
                                                            ? TESTING_IDS
                                                                  .contextMenu
                                                                  .searchAction
                                                            : undefined
                                                    }
                                                >
                                                    <Group gap="sm">
                                                        {action.icon}
                                                        <Text size="sm">
                                                            {label}
                                                        </Text>
                                                    </Group>
                                                </Combobox.Option>
                                            );
                                        })}
                                    </div>
                                ),
                            )}
                            {filteredActions.length === 0 && (
                                <Text size="sm" c="dimmed" ta="center" py="xl">
                                    No results found
                                </Text>
                            )}
                        </Combobox.Options>
                    </ScrollArea.Autosize>
                </div>
            </Combobox>
        </div>
    );
}
