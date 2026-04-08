import { Combobox } from "@base-ui/react/combobox";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isElementNode, type LexicalNode } from "lexical";
import { X } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import { getVisibleActions } from "@/app/domain/editor/actions/registry.ts";
import type {
    ActionStep,
    EditorAction,
    EditorContext,
} from "@/app/domain/editor/actions/types.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import * as classes from "./ActionPalette.css.ts";

interface ActionPaletteProps {
    context: EditorContext;
    onClose: () => void;
}

interface ActionGroup {
    category: string;
    actions: EditorAction[];
}

/**
 * Some palette actions switch editor mode instead of mutating content directly.
 * Preserve verse context through that transition so the palette behaves like an
 * in-place command surface rather than jumping the user to a different spot.
 */
function getModeForAction(actionId: string): EditorModeSetting | null {
    switch (actionId) {
        case "switch-plain":
            return EDITOR_MODES.plain;
        case "switch-regular":
            return EDITOR_MODES.regular;
        case "switch-view":
            return EDITOR_MODES.view;
        case "switch-usfm":
            return EDITOR_MODES.usfm;
        default:
            return null;
    }
}

function getActionLabel(action: EditorAction, context: EditorContext): string {
    return typeof action.label === "function"
        ? action.label(context)
        : action.label;
}

function buildActionGroups(actions: EditorAction[]): ActionGroup[] {
    const groups = new Map<string, EditorAction[]>();

    for (const action of actions) {
        const existing = groups.get(action.category);
        if (existing) {
            existing.push(action);
            continue;
        }

        groups.set(action.category, [action]);
    }

    return Array.from(groups.entries(), ([category, groupedActions]) => ({
        category,
        actions: groupedActions,
    }));
}

function ActionStepPill({
    activeAction,
    context,
    onClear,
}: {
    activeAction: EditorAction | null;
    context: EditorContext;
    onClear: () => void;
}) {
    if (!activeAction) {
        return null;
    }

    return (
        <div className={classes.pillContainer}>
            <div className={classes.stepPill}>
                <span>{getActionLabel(activeAction, context)}</span>
                <button
                    type="button"
                    className={classes.stepPillButton}
                    onClick={onClear}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}

function ActionOptionRow({
    action,
    context,
}: {
    action: EditorAction;
    context: EditorContext;
}) {
    return (
        <Combobox.Item
            value={action}
            className={classes.item}
            disabled={action.isDisabled?.(context)}
            data-testid={
                action.category === "Search"
                    ? TESTING_IDS.contextMenu.searchAction
                    : undefined
            }
        >
            <div className={classes.itemContent}>
                {action.icon}
                <div className={classes.itemTextBlock}>
                    <span className={classes.optionLabel}>
                        {getActionLabel(action, context)}
                    </span>
                    <span className={classes.itemMeta}>{action.category}</span>
                </div>
            </div>
        </Combobox.Item>
    );
}

function ActionGroupSection({
    group,
    context,
}: {
    group: ActionGroup;
    context: EditorContext;
}) {
    return (
        <div>
            <div className={classes.categoryHeader}>{group.category}</div>
            {group.actions.map((action) => (
                <ActionOptionRow
                    key={action.id}
                    action={action}
                    context={context}
                />
            ))}
        </div>
    );
}

function ActionList({
    groups,
    context,
}: {
    groups: ActionGroup[];
    context: EditorContext;
}) {
    return (
        <>
            {groups.map((group) => (
                <ActionGroupSection
                    key={group.category}
                    group={group}
                    context={context}
                />
            ))}
        </>
    );
}

function StepOptionRow({
    option,
}: {
    option: NonNullable<ActionStep["options"]>[number];
}) {
    return (
        <Combobox.Item value={option.value} className={classes.item}>
            <span className={classes.optionLabel}>{option.label}</span>
        </Combobox.Item>
    );
}

function StepOptionList({
    options,
}: {
    options: NonNullable<ActionStep["options"]>;
}) {
    return (
        <>
            {options.map((option) => (
                <StepOptionRow key={option.value} option={option} />
            ))}
        </>
    );
}

function PaletteScrollArea({ children }: { children: React.ReactNode }) {
    return (
        <ScrollArea.Root className={classes.scrollArea}>
            <ScrollArea.Viewport className={classes.scrollViewport}>
                {children}
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
        </ScrollArea.Root>
    );
}

/**
 * Command palette for the current editor selection/caret context.
 *
 * Upstream, `NodeContextMenuPlugin` decides when enough editor context exists to
 * open the palette. Downstream, actions either perform direct Lexical mutations or
 * dispatch workspace-level commands such as changing editor mode.
 */
export function ActionPalette({ context, onClose }: ActionPaletteProps) {
    const [editor] = useLexicalComposerContext();
    const [search, setSearch] = useState("");
    const [activeStep, setActiveStep] = useState<ActionStep | null>(null);
    const [activeAction, setActiveAction] = useState<EditorAction | null>(null);
    const [stepSearch, setStepSearch] = useState("");

    const visibleActions = useMemo(() => getVisibleActions(context), [context]);

    const filteredActions = useMemo(() => {
        const lowerSearch = search.toLowerCase();

        return visibleActions.filter((action) => {
            const label = getActionLabel(action, context);
            return (
                label.toLowerCase().includes(lowerSearch) ||
                action.marker?.toLowerCase().includes(lowerSearch) ||
                action.category.toLowerCase().includes(lowerSearch)
            );
        });
    }, [context, search, visibleActions]);

    const actionGroups = useMemo(
        () => buildActionGroups(filteredActions),
        [filteredActions],
    );

    const filteredStepOptions = useMemo(() => {
        if (!activeStep || !activeStep.options) {
            return [];
        }

        const lowerSearch = stepSearch.toLowerCase();
        return activeStep.options.filter((option) =>
            option.label.toLowerCase().includes(lowerSearch),
        );
    }, [activeStep, stepSearch]);

    const clearStep = () => {
        setActiveStep(null);
        setActiveAction(null);
        setStepSearch("");
    };

    const handleStepComplete = (value: string) => {
        if (!activeStep) {
            return;
        }

        editor.update(() => {
            activeStep.onComplete(value, editor, context);
        });

        onClose();
        editor.focus();
    };

    const handleSelectAction = (action: EditorAction) => {
        if (action.isDisabled?.(context)) {
            return;
        }

        let result: undefined | ActionStep;
        const sid = context.currentVerse;

        if (action.category === "Modes") {
            const nextMode = getModeForAction(action.id);

            if (nextMode) {
                context.actions.setEditorMode?.(nextMode, {
                    onComplete: () => {
                        editor.update(() => {
                            if (sid) {
                                const root = $getRoot();
                                const nodes = root.getChildren();

                                const findNodeBySid = (
                                    nodeList: LexicalNode[],
                                ): LexicalNode | null => {
                                    for (const node of nodeList) {
                                        if (
                                            $isUSFMTextNode(node) &&
                                            node.getSid() === sid
                                        ) {
                                            return node;
                                        }

                                        if ($isElementNode(node)) {
                                            const found = findNodeBySid(
                                                node.getChildren(),
                                            );
                                            if (found) {
                                                return found;
                                            }
                                        }
                                    }

                                    return null;
                                };

                                const targetNode = findNodeBySid(nodes);
                                if (targetNode && $isUSFMTextNode(targetNode)) {
                                    targetNode.select();
                                }
                            }

                            editor.focus();
                        });
                    },
                });
            } else {
                editor.update(() => {
                    result = action.execute(editor, context) || undefined;
                });
            }
        } else {
            editor.update(() => {
                result = action.execute(editor, context) || undefined;
            });
        }

        const nextStep = result as ActionStep | undefined;
        if (
            nextStep &&
            typeof nextStep === "object" &&
            "onComplete" in nextStep
        ) {
            setActiveAction(action);
            setActiveStep(nextStep);
            setSearch("");
            return;
        }

        onClose();
        if (action.category !== "Modes") {
            editor.focus();
        }
    };

    const handleMainKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            onClose();
            editor.focus();
        }

        if (event.key === "Backspace" && search === "") {
            onClose();
            editor.focus();
        }
    };

    const handleStepKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            clearStep();
        }

        if (event.key === "Backspace" && stepSearch === "") {
            clearStep();
        }
    };

    if (activeStep) {
        if (activeStep.type === "input") {
            return (
                <div className={classes.container}>
                    <ActionStepPill
                        activeAction={activeAction}
                        context={context}
                        onClear={clearStep}
                    />
                    <input
                        className={classes.searchInput}
                        placeholder={activeStep.placeholder || "Enter value..."}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                handleStepComplete(event.currentTarget.value);
                            }

                            if (event.key === "Escape") {
                                clearStep();
                            }
                        }}
                    />
                </div>
            );
        }

        return (
            <div className={classes.container}>
                <ActionStepPill
                    activeAction={activeAction}
                    context={context}
                    onClear={clearStep}
                />
                <Combobox.Root
                    inline
                    open
                    autoHighlight
                    inputValue={stepSearch}
                    onInputValueChange={setStepSearch}
                    onValueChange={(value) => {
                        if (typeof value === "string") {
                            handleStepComplete(value);
                        }
                    }}
                >
                    <div className={classes.header}>
                        <Combobox.Input
                            className={classes.searchInput}
                            placeholder={activeStep.placeholder || "Search..."}
                            autoFocus
                            onKeyDown={handleStepKeyDown}
                        />
                    </div>
                    <PaletteScrollArea>
                        <Combobox.List className={classes.list}>
                            <StepOptionList options={filteredStepOptions} />
                        </Combobox.List>
                        <Combobox.Empty className={classes.emptyState}>
                            No results found
                        </Combobox.Empty>
                    </PaletteScrollArea>
                </Combobox.Root>
            </div>
        );
    }

    return (
        <div className={classes.container}>
            <Combobox.Root<EditorAction>
                inline
                open
                autoHighlight
                inputValue={search}
                onInputValueChange={setSearch}
                itemToStringLabel={(action) => getActionLabel(action, context)}
                itemToStringValue={(action) => action.id}
                onValueChange={(action) => {
                    if (action) {
                        handleSelectAction(action);
                    }
                }}
            >
                <div className={classes.header}>
                    <Combobox.Input
                        data-testid={TESTING_IDS.contextMenu.searchInput}
                        placeholder="Search actions..."
                        className={classes.searchInput}
                        autoFocus
                        onKeyDown={handleMainKeyDown}
                    />
                </div>
                <PaletteScrollArea>
                    <Combobox.List className={classes.list}>
                        <ActionList groups={actionGroups} context={context} />
                    </Combobox.List>
                    <Combobox.Empty className={classes.emptyState}>
                        No results found
                    </Combobox.Empty>
                </PaletteScrollArea>
            </Combobox.Root>
        </div>
    );
}
