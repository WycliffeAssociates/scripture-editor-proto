import type {
    EditorConfig,
    LexicalEditor,
    LexicalNode,
    NodeKey,
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
    Spread,
} from "lexical";
import { DecoratorNode } from "lexical";
import type { USFMNodeJSON } from "@/app/data/editor";
import { NestedEditor } from "@/app/ui/components/blocks/NestedEditor";
import type { LintError } from "@/core/data/usfm/lint";
import type { ParsedToken } from "@/core/data/usfm/parse";
import { arraysEqualByKey, guidGenerator } from "@/core/data/utils/generic";

export const USFM_NESTED_DECORATOR_TYPE = "usfm-nested-editor";

export const nestedEditorMarkers = new Set(["f", "x"]); // expandable later

export type USFMNestedEditorNodeJSON = Spread<
    {
        type: typeof USFM_NESTED_DECORATOR_TYPE;
        tokenType: string;
        id: string;
        version: 1;
        text: string;
        marker: string;
        editorState: SerializedEditorState;
        lexicalKey?: string;
        lintErrors?: LintError[];
        sid?: string;
        level?: string;
        inPara?: string;
        inChars?: string[];
        attributes?: Record<string, string>;
        randomRenderKey?: string;
        isOpen?: boolean;
    },
    SerializedLexicalNode
>;

export class USFMNestedEditorNode extends DecoratorNode<React.ReactNode> {
    __text: string; //the marker text that caused this to be created
    __marker: string;
    __id: string;
    __sid?: string;
    __tokenType: string;
    __level?: string;
    __inPara?: string;
    __attributes: Record<string, string>;
    __editorState: SerializedEditorState;
    __lintErrors?: LintError[];
    __randomRenderKey: string;
    __isOpen: boolean;

    constructor(
        text: string,
        marker: string,
        id: string,
        tokenType: string,
        editorState: SerializedEditorState,
        lintErrors?: LintError[],
        sid?: string,
        level?: string,
        inPara?: string,
        attributes: Record<string, string> = {},
        randomRenderKey?: string,
        isOpen?: boolean,
        key?: NodeKey,
    ) {
        super(key);
        this.__text = text;
        this.__marker = marker;
        this.__id = id;
        this.__sid = sid;
        this.__tokenType = tokenType;
        this.__level = level;
        this.__inPara = inPara;
        this.__attributes = attributes;
        this.__editorState = editorState;
        this.__lintErrors = lintErrors;
        this.__randomRenderKey = randomRenderKey || guidGenerator();
        this.__isOpen = isOpen || false;
    }

    static getType(): string {
        return USFM_NESTED_DECORATOR_TYPE;
    }

    getMarker(): string {
        return this.__marker;
    }
    getSid(): string | undefined {
        return this.__sid;
    }
    getId(): string {
        return this.__id;
    }
    getTokenType(): string {
        return this.__tokenType;
    }
    getLintErrors(): LintError[] | undefined {
        return this.__lintErrors;
    }
    getLatestEditorState(): SerializedEditorState<SerializedLexicalNode> {
        return this.getLatest().__editorState;
    }
    setLintErrors(lintErrors: LintError[]) {
        this.getWritable().__lintErrors = lintErrors;
    }
    setRandomRenderKey() {
        this.getWritable().__randomRenderKey = guidGenerator();
    }
    setIsOpen(mainEditor: LexicalEditor, isOpen: boolean) {
        mainEditor.update(() => {
            this.getWritable().__isOpen = isOpen;
        });
    }
    lintErrorsDoNeedUpdate(newLintErrors: LintError[]) {
        const current = this.__lintErrors;
        const incomingMessages = newLintErrors;
        // if either set is not fully contained in the other, then we need to update
        return arraysEqualByKey(current || [], incomingMessages, "message");
    }

    static clone(node: USFMNestedEditorNode): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            node.__text,
            node.__marker,
            node.__id,
            node.__tokenType,
            node.__editorState,
            node.__lintErrors,
            node.__sid,
            node.__level,
            node.__inPara,
            node.__attributes,
            node.__randomRenderKey,
            node.__isOpen,
            node.__key,
        );
    }
    createDOM(): HTMLElement {
        const el = document.createElement("div");
        el.classList.add("nested-editor");
        return el;
    }
    updateDOM(
        prevNode: USFMNestedEditorNode,
        _dom: HTMLElement,
        _config: EditorConfig,
    ): boolean {
        if (prevNode.__randomRenderKey !== this.__randomRenderKey) {
            return true;
        }
        if (prevNode.__isOpen !== this.__isOpen) {
            return true;
        }
        return false;
    }
    isInline(): boolean {
        return true;
    }

    // JSON serialization
    exportJSON(): USFMNestedEditorNodeJSON {
        return {
            ...super.exportJSON(),
            type: USFM_NESTED_DECORATOR_TYPE,
            text: this.__text,
            id: this.__id,
            version: 1,
            marker: this.__marker,
            sid: this.__sid,
            tokenType: this.__tokenType,
            lintErrors: [], // we don't want to serialize lint errors
            level: this.__level,
            inPara: this.__inPara,
            attributes: this.__attributes,
            editorState: this.__editorState,
            randomRenderKey: this.__randomRenderKey,
            isOpen: this.__isOpen,
        };
    }

    static importJSON(json: USFMNestedEditorNodeJSON): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            json.text,
            json.marker,
            json.id,
            json.tokenType,
            json.editorState,
            json.lintErrors,
            json.sid,
            json.level,
            json.inPara,
            json.attributes ?? {},
            json.randomRenderKey,
            json.isOpen,
        );
    }

    // How it renders in the outer editor
    decorate(_editor: LexicalEditor, _configg: EditorConfig): React.ReactNode {
        return (
            <NestedEditor
                key={this.__key}
                outerMarker={this.__marker}
                id={this.__id}
                // lexicalKey={this.__key}
                initialEditorState={this.__editorState}
                lintErrors={this.__lintErrors}
                onChange={(
                    newState: SerializedEditorState<SerializedLexicalNode>,
                    mainEditor: LexicalEditor,
                ) => {
                    mainEditor.update(() => {
                        this.getWritable().__editorState = newState;
                    });
                }}
                setIsOpen={(mainEditor: LexicalEditor, isOpen: boolean) => {
                    this.setIsOpen(mainEditor, isOpen);
                }}
                isOpen={this.__isOpen}
            />
        );
    }
}

// Helper to construct in code
export function $createUSFMNestedEditorNode(
    text: string,
    marker: string,
    id: string,
    usfmType: string,
    editorState: SerializedEditorState,
    lintErrors?: LintError[],
    sid?: string,
    level?: string,
    inPara?: string,
    attributes?: Record<string, string>,
): USFMNestedEditorNode {
    return new USFMNestedEditorNode(
        text,
        marker,
        id,
        usfmType,
        editorState,
        lintErrors,
        sid,
        level,
        inPara,
        attributes,
    );
}

export function getSerializedNestedEditorNode({
    token,
    childrenCb,
    languageDirection,
}: {
    token: ParsedToken;
    childrenCb: () => USFMNodeJSON[];
    languageDirection: "ltr" | "rtl";
}): USFMNestedEditorNodeJSON {
    // needed to wrap nested flat text nodes
    const serializedPara: SerializedElementNode = {
        children: childrenCb(),
        type: "paragraph",
        version: 1,
        direction: languageDirection,
        format: "",
        indent: 0,
    };

    return {
        type: USFM_NESTED_DECORATOR_TYPE,
        id: token.id,
        version: 1,
        text: token.text,
        marker: token.marker ?? "",
        sid: token.sid ?? undefined,
        tokenType: token.tokenType,
        inPara: token.inPara ?? undefined,
        inChars: token.inChars ?? undefined,
        attributes: token.attributes ?? {},
        lintErrors: token.lintErrors ?? [],
        // Serialize children of this token into a nested editor state
        editorState: {
            root: {
                children: [serializedPara],
                direction: languageDirection,
                format: "",
                indent: 0,
                type: "root",
                version: 1,
            },
        },
    };
}

export function $isUSFMNestedEditorNode(
    node: LexicalNode,
): node is USFMNestedEditorNode {
    return node instanceof USFMNestedEditorNode;
}
export function isSerializedUSFMNestedEditorNode(
    node: SerializedLexicalNode,
): node is USFMNestedEditorNodeJSON {
    return node.type === USFM_NESTED_DECORATOR_TYPE;
}
export function getChildrenFromNestedEditorNode(node: USFMNestedEditorNode) {
    return node.__editorState.root.children;
}
