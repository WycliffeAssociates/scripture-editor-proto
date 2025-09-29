import { createId } from "@paralleldrive/cuid2";
import {
    DecoratorNode,
    type EditorConfig,
    type NodeKey,
    type SerializedLexicalNode,
} from "lexical";
import { USFMDecorator } from "@/ui/components/ui/UsfmDecoratorNode";
import { ParsedToken } from "@/lib/parse";

export const USFM_DECORATOR_TYPE = "usfm-decorator" as const;
export type USFMDecoratorNodeJSON = SerializedLexicalNode & {
    type: typeof USFM_DECORATOR_TYPE;
    cuid: string;
    version: 1;
    text: string;
    marker?: string;
    sid?: string;
    usfmType?: string;
    level?: string;
    inPara?: string;
    attributes?: Record<string, string>;
};

export class USFMDecoratorNode extends DecoratorNode<React.ReactNode> {
    __text: string;
    __cuid: string;
    __marker?: string;
    __sid?: string;
    __usfmType?: string;
    __level?: string;
    __inPara?: string;
    __attributes: Record<string, string>;

    static getType(): string {
        return USFM_DECORATOR_TYPE;
    }

    static clone(node: USFMDecoratorNode): USFMDecoratorNode {
        return new USFMDecoratorNode(
            node.__text,
            {
                cuid: node.__cuid,
                marker: node.__marker,
                sid: node.__sid,
                usfmType: node.__usfmType,
                level: node.__level,
                inPara: node.__inPara,
                attributes: node.__attributes,
            },
            node.__key,
        );
    }

    constructor(
        text: string,
        opts: {
            cuid: string;
            marker?: string;
            sid?: string;
            usfmType?: string;
            level?: string;
            inPara?: string;
            attributes?: Record<string, string>;
        } = {
            cuid: createId(),
        },
        key?: NodeKey,
    ) {
        super(key);
        this.__text = text;
        this.__cuid = opts.cuid;
        this.__marker = opts.marker;
        this.__sid = opts.sid;
        this.__usfmType = opts.usfmType;
        this.__level = opts.level;
        this.__inPara = opts.inPara;
        this.__attributes = opts.attributes ?? {};
    }

    createDOM(_config: EditorConfig) {
        return document.createElement("span");
    }

    updateDOM(_prevNode: USFMDecoratorNode, _dom: HTMLElement): boolean {
        // always recreate via React decorator — no DOM update needed
        return false;
    }
    setText(text: string) {
        const writable = this.getWritable();
        writable.__text = text;
        return writable;
    }

    decorate(): React.ReactNode {
        return (
            <USFMDecorator
                setText={(text) => this.setText(text)}
                marker={this.__marker}
                sid={this.__sid}
                usfmType={this.__usfmType}
                level={this.__level}
                inPara={this.__inPara}
                attributes={this.__attributes}
                text={this.__text}
                nodeKey={this.__key}
            />
        );
    }

    static importJSON(
        serializedNode: USFMDecoratorNodeJSON,
    ): USFMDecoratorNode {
        return new USFMDecoratorNode(serializedNode.text, {
            cuid: serializedNode.cuid,
            marker: serializedNode.marker,
            sid: serializedNode.sid,
            usfmType: serializedNode.usfmType,
            level: serializedNode.level,
            inPara: serializedNode.inPara,
            attributes: serializedNode.attributes,
        }).updateFromJSON(serializedNode);
    }
    remove() {
        return false;
    }

    exportDOM() {
        const element = document.createElement("span");
        element.setAttribute("data-lexical-node", USFM_DECORATOR_TYPE);
        element.textContent = ` ${this.__text} `;
        return { element };
    }
    importDOM() {
        const element = document.createElement("span");
        element.setAttribute("data-lexical-node", USFM_DECORATOR_TYPE);
        element.textContent = ` ${this.__text} `;
        return { element };
    }

    exportJSON(): USFMDecoratorNodeJSON {
        return {
            type: USFM_DECORATOR_TYPE,
            cuid: this.__cuid,
            version: 1,
            text: this.__text,
            marker: this.__marker,
            sid: this.__sid,
            usfmType: this.__usfmType,
            level: this.__level,
            inPara: this.__inPara,
            attributes: this.__attributes,
        };
    }
    getSid(): string | undefined {
        return this.__sid;
    }
    getOptions() {
        return {
            marker: this.__marker,
            sid: this.__sid,
            usfmType: this.__usfmType,
            level: this.__level,
            inPara: this.__inPara,
            attributes: this.__attributes,
            text: this.__text,
        };
    }
    // prevents selection, but not deletion
    // isIsolated() {
    //   return true;
    // }
}

export function $createUSFMDecoratorNode(
    text: string,
    opts: {
        cuid: string;
        marker?: string;
        sid?: string;
        usfmType?: string;
        level?: string;
        inPara?: string;
        attributes?: Record<string, string>;
    } = {
        cuid: createId(),
    },
): USFMDecoratorNode {
    return new USFMDecoratorNode(text, opts);
}

export function $isUSFMDecoratorNode(node: unknown): node is USFMDecoratorNode {
    return node instanceof USFMDecoratorNode;
}

export function getSerializedDecoratorNode(
    token: ParsedToken,
): USFMDecoratorNodeJSON {
    return {
        type: USFM_DECORATOR_TYPE,
        cuid: token.cuid,
        version: 1,
        text: token.text,
        marker: token.marker,
        sid: token.sid,
        usfmType: token.type,
        level: token.level,
        inPara: token.inPara,
        attributes: token.attributes ?? {},
    };
}
