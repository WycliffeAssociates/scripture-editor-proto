import type {
    EditorConfig,
    EditorState,
    LexicalEditor,
    NodeKey,
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
    Spread,
} from "lexical";
import { DecoratorNode } from "lexical";
import { USFMNestedEditor } from "@/ui/components/ui/UsfmNestedEditor";
import type { USFMNodeJSON } from "@/lib/getEditorState";
import type { ParsedToken } from "@/lib/parse";

export const USFM_NESTED_DECORATOR_TYPE = "usfm-nested-editor";

export type USFMNestedEditorNodeJSON = Spread<
    {
        type: typeof USFM_NESTED_DECORATOR_TYPE;
        cuid: string;
        version: 1;
        marker: string;
        sid?: string;
        usfmType: string;
        level?: string;
        inPara?: string;
        attributes?: Record<string, string>;
        editorState: SerializedEditorState;
    },
    SerializedLexicalNode
>;

export class USFMNestedEditorNode extends DecoratorNode<React.ReactNode> {
    __marker: string;
    __cuid: string;
    __sid?: string;
    __usfmType: string;
    __level?: string;
    __inPara?: string;
    __attributes: Record<string, string>;
    __editorState: SerializedEditorState;

    constructor(
        marker: string,
        cuid: string,
        usfmType: string,
        editorState: SerializedEditorState,
        sid?: string,
        level?: string,
        inPara?: string,
        attributes: Record<string, string> = {},
        key?: NodeKey,
    ) {
        super(key);
        this.__marker = marker;
        this.__cuid = cuid;
        this.__sid = sid;
        this.__usfmType = usfmType;
        this.__level = level;
        this.__inPara = inPara;
        this.__attributes = attributes;
        this.__editorState = editorState;
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

    static clone(node: USFMNestedEditorNode): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            node.__marker,
            node.__cuid,
            node.__usfmType,
            node.__editorState,
            node.__sid,
            node.__level,
            node.__inPara,
            node.__attributes,
            node.__key,
        );
    }
    createDOM(): HTMLElement {
        return document.createElement("div");
    }
    updateDOM(
        _prevNode: unknown,
        _dom: HTMLElement,
        _config: EditorConfig,
    ): boolean {
        return false;
    }

    // JSON serialization
    exportJSON(): USFMNestedEditorNodeJSON {
        return {
            type: USFM_NESTED_DECORATOR_TYPE,
            cuid: this.__cuid,
            version: 1,
            marker: this.__marker,
            sid: this.__sid,
            usfmType: this.__usfmType,
            level: this.__level,
            inPara: this.__inPara,
            attributes: this.__attributes,
            editorState: this.__editorState,
        };
    }

    static importJSON(json: USFMNestedEditorNodeJSON): USFMNestedEditorNode {
        return new USFMNestedEditorNode(
            json.marker,
            json.cuid,
            json.usfmType,
            json.editorState,
            json.sid,
            json.level,
            json.inPara,
            json.attributes ?? {},
        );
    }

    // How it renders in the outer editor
    decorate(_editor: LexicalEditor, _configg: EditorConfig): React.ReactNode {
        return (
            <USFMNestedEditor
                key={this.__key}
                marker={this.__marker}
                lexicalKey={this.__key}
                initialEditorState={this.__editorState}
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
    cuid: string,
    usfmType: string,
    editorState: SerializedEditorState,
    sid?: string,
    level?: string,
    inPara?: string,
    attributes?: Record<string, string>,
): USFMNestedEditorNode {
    return new USFMNestedEditorNode(
        marker,
        cuid,
        usfmType,
        editorState,
        sid,
        level,
        inPara,
        attributes,
    );
}
export function getSerializedNestedEditorNode(
    token: ParsedToken,
    childrenCb: () => USFMNodeJSON[],
): USFMNestedEditorNodeJSON {
    const serializedPara: SerializedElementNode = {
        children: childrenCb(),
        type: "paragraph",
        version: 1,
        direction: "ltr",
        format: "start",
        indent: 0,
    };

    return {
        type: USFM_NESTED_DECORATOR_TYPE,
        cuid: token.cuid,
        version: 1,
        marker: token.marker ?? "",
        sid: token.sid ?? undefined,
        usfmType: token.type,
        level: token.level ?? undefined,
        inPara: token.inPara ?? undefined,
        attributes: token.attributes ?? {},
        // Serialize children of this token into a nested editor state
        editorState: {
            root: {
                children: [serializedPara],
                direction: "ltr",
                format: "",
                indent: 0,
                type: "root",
                version: 1,
            },
        },
    };
}

export function $isUSFMNestedEditorNode(
    node: unknown,
): node is USFMNestedEditorNode {
    return node instanceof USFMNestedEditorNode;
}
export function getChildrenFromNestedEditorNode(node: USFMNestedEditorNode) {
    return node.__editorState.root.children;
}
