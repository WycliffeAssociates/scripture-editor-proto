import { $createNodeSelection, $getNodeByKey, $setSelection } from "lexical";
import { useState } from "react";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/primitives/popover";
import { useProjectContext } from "@/contexts/ProjectContext";
import {
    $isUSFMDecoratorNode,
    USFM_DECORATOR_TYPE,
} from "@/features/editor/nodes/USFMMarkerDecoratorNode";
import { allParaTokens } from "@/lib/lex";

type USFMDecoratorProps = {
    text: string;
    marker?: string;
    sid?: string;
    usfmType?: string;
    level?: string;
    inPara?: string;
    attributes?: Record<string, string>;
    setText: (text: string) => void;
    nodeKey: string;
};

export function USFMDecorator({
    text,
    marker,
    sid,
    usfmType,
    level,
    inPara,
    setText,
    attributes = {},
    nodeKey,
}: USFMDecoratorProps) {
    const [draft, setDraft] = useState(text);
    const [open, setOpen] = useState(false);
    const { editorRef, dragState, setDragState } = useProjectContext();

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                asChild
                className="focus:outline-2 focus:outline-primary"
                data-js="usfm-decorator-trigger"
                onFocus={() => {
                    // set editor focus to this decorator node:
                    editorRef.current?.update(() => {
                        console.log("FOCUSING");
                        const node = $getNodeByKey(nodeKey);
                        console.log(node);
                        if ($isUSFMDecoratorNode(node)) {
                            const nodeSelection = $createNodeSelection();
                            // Add a node key to the selection.
                            nodeSelection.add(nodeKey);
                            console.log("SELECTING");
                            $setSelection(nodeSelection);
                        }
                    });
                }}
                tabIndex={0}
                onClick={() => {
                    setOpen(true);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        setOpen(true);
                    }
                }}
            >
                <span
                    className="cursor-pointer select-none px-1 rounded hover:bg-muted"
                    contentEditable={false}
                    data-in-para={inPara}
                    data-sid={sid}
                    data-marker={marker}
                    data-level={level}
                    data-usfm-type={usfmType}
                    data-lexical-node={USFM_DECORATOR_TYPE}
                    data-category={
                        marker && allParaTokens.has(marker) ? "para" : undefined
                    }
                >
                    {text}
                </span>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-2">
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Change text"
                />
                <Button
                    onClick={() => {
                        editorRef.current?.update(() => {
                            setText(draft);
                        });
                        setOpen(false);
                        // close popover
                    }}
                    className="w-full"
                >
                    Save
                </Button>
                <Button
                    onClick={() => {
                        // Put the current node into drag mode
                        setDragState({ draggingNodeKey: nodeKey });
                        setOpen(false);
                        // close popover
                    }}
                    className="w-full"
                >
                    Start Drag
                </Button>
            </PopoverContent>
        </Popover>
    );
}
