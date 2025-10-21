import type {
    EditorConfig,
    EditorState,
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
import type { ParsedToken } from "@/core/data/usfm/parse";
import type { LintError } from "@/core/domain/usfm/parse";

export const USFM_NESTED_DECORATOR_TYPE = "usfm-nested-editor";
export const nestedEditorMarkers = new Set(["f", "x"]); // expandable later

export type USFMNestedEditorNodeJSON = Spread<
    {
        type: typeof USFM_NESTED_DECORATOR_TYPE;
        tokenType: string;
        id: string;
        version: 1;
        marker: string;
        editorState: SerializedEditorState;
        lintErrors?: LintError[];
        sid?: string;
        level?: string;
        inPara?: string;
        inChars?: string[];
        attributes?: Record<string, string>;
    },
    SerializedLexicalNode
>;

export class USFMNestedEditorNode extends DecoratorNode<React.ReactNode> {
    __marker: string;
    __id: string;
    __sid?: string;
    __tokenType: string;
    __level?: string;
    __inPara?: string;
    __attributes: Record<string, string>;
    __editorState: SerializedEditorState;
    __lintErrors?: LintError[];

    constructor(
        marker: string,
        id: string,
        tokenType: string,
        editorState: SerializedEditorState,
        lintErrors?: LintError[],
        sid?: string,
        level?: string,
        inPara?: string,
        attributes: Record<string, string> = {},
        key?: NodeKey,
    ) {
        super(key);
        this.__marker = marker;
        this.__id = id;
        this.__sid = sid;
        this.__tokenType = tokenType;
        this.__level = level;
        this.__inPara = inPara;
        this.__attributes = attributes;
        this.__editorState = editorState;
        this.__lintErrors = lintErrors;
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
    getLatestEditorState(): SerializedEditorState<SerializedLexicalNode> {
        return this.getLatest().__editorState;
    }

    static clone(node: USFMNestedEditorNode): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            node.__marker,
            node.__id,
            node.__tokenType,
            node.__editorState,
            node.__lintErrors,
            node.__sid,
            node.__level,
            node.__inPara,
            node.__attributes,
            node.__key,
        );
    }
    createDOM(): HTMLElement {
        const el = document.createElement("div");
        el.classList.add("nested-editor");
        return el;
    }
    updateDOM(
        _prevNode: unknown,
        _dom: HTMLElement,
        _config: EditorConfig,
    ): boolean {
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
            id: this.__id,
            version: 1,
            marker: this.__marker,
            sid: this.__sid,
            tokenType: this.__tokenType,
            lintErrors: this.__lintErrors,
            level: this.__level,
            inPara: this.__inPara,
            attributes: this.__attributes,
            editorState: this.__editorState,
        };
    }

    static importJSON(json: USFMNestedEditorNodeJSON): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            json.marker,
            json.id,
            json.tokenType,
            json.editorState,
            json.lintErrors,
            json.sid,
            json.level,
            json.inPara,
            json.attributes ?? {},
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
            />
        );
    }
}

// Helper to construct in code
export function $createUSFMNestedEditorNode(
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
