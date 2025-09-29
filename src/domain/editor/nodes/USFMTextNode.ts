// import {createId} from "@paralleldrive/cuid2";
import {
    type EditorConfig,
    type NodeKey,
    SerializedLexicalNode,
    type SerializedTextNode,
    TextNode,
} from "lexical";
import { allParaTokens } from "@/lib/lex";
import type { ParsedToken } from "@/lib/parse";

export type USFMTextNodeJSON = SerializedTextNode & {
    type: "usfm-text";
    cuid: string;
    marker?: string;
    usfmType?: string;
    inPara?: string;
    sid?: string;
    level?: string;
    attributes?: Record<string, string>;
    version: 1;
};

export class USFMTextNode extends TextNode {
    __inPara?: string;
    __sid?: string;
    __marker?: string;
    __cuid: string;
    __level?: string;
    __usfmType?: string;
    __attributes: Record<string, string>;

    static getType(): string {
        return "usfm-text";
    }

    static clone(node: USFMTextNode): USFMTextNode {
        return new USFMTextNode(
            node.getTextContent(),
            node.__cuid,
            {
                inPara: node.__inPara,
                usfmType: node.__usfmType,
                sid: node.__sid,
                marker: node.__marker,
                level: node.__level,
                attributes: { ...node.__attributes },
            },
            node.__key,
        );
    }

    constructor(
        text: string,
        cuid: string,
        opts?: {
            marker?: string;
            usfmType?: string;
            inPara?: string;
            sid?: string;
            level?: string;
            attributes?: Record<string, string>;
        },
        key?: NodeKey,
    ) {
        super(text, key);
        this.__cuid = cuid;
        this.__inPara = opts?.inPara;
        this.__sid = opts?.sid;
        this.__marker = opts?.marker;
        this.__level = opts?.level;
        this.__attributes = opts?.attributes || {};
    }

    static importJSON(json: USFMTextNodeJSON): USFMTextNode {
        return new USFMTextNode(json.text, json.cuid, {
            inPara: json.inPara,
            usfmType: json.usfmType,
            sid: json.sid,
            marker: json.marker,
            level: json.level,
            attributes: json.attributes,
        });
    }

    exportJSON(): USFMTextNodeJSON {
        return {
            ...super.exportJSON(),
            type: "usfm-text",
            cuid: this.__cuid,
            inPara: this.__inPara,
            usfmType: this.__usfmType,
            sid: this.__sid,
            marker: this.__marker,
            level: this.__level,
            attributes: this.__attributes,
            version: 1,
        };
    }

    createDOM(config: EditorConfig): HTMLElement {
        const el = super.createDOM(config);
        if (this.__inPara) el.dataset.inPara = this.__inPara;
        if (this.__sid) el.dataset.sid = this.__sid;
        if (this.__marker) el.dataset.marker = this.__marker;
        if (this.__level) el.dataset.level = this.__level;
        if (this.__usfmType) el.dataset.usfmType = this.__usfmType;
        if (this.__marker && allParaTokens.has(this.__marker))
            el.dataset.category = "para";
        el.dataset.lexicalNode = "usfm-text";
        return el;
    }

    updateDOM(
        prevNode: USFMTextNode,
        dom: HTMLElement,
        config: EditorConfig,
    ): boolean {
        let needsUpdate = super.updateDOM(prevNode as this, dom, config);

        if (this.__inPara !== prevNode.__inPara) {
            if (this.__inPara) dom.dataset.inPara = this.__inPara;
            else delete dom.dataset.inPara;
            needsUpdate = true;
        }
        if (this.__sid !== prevNode.__sid) {
            if (this.__sid) dom.dataset.sid = this.__sid;
            else delete dom.dataset.sid;
            needsUpdate = true;
        }

        return needsUpdate;
    }
    getOptions() {
        return {
            inPara: this.__inPara,
            usfmType: this.__usfmType,
            sid: this.__sid,
            marker: this.__marker,
            level: this.__level,
            attributes: this.__attributes,
        };
    }
    getSid(): string | undefined {
        return this.__sid;
    }
}

export function $createUSFMTextNode(
    text: string,
    cuid: string,
    opts?: {
        marker?: string;
        usfmType?: string;
        inPara?: string;
        sid?: string;
        level?: string;
        attributes?: Record<string, string>;
    },
): USFMTextNode {
    return new USFMTextNode(text, cuid, opts);
}
export function isSerializedUSFMTextNode(
    node: SerializedLexicalNode,
): node is USFMTextNodeJSON {
    return node.type === "usfm-text";
}

export function getSerializedTextNode(token: ParsedToken): USFMTextNodeJSON {
    return {
        type: "usfm-text",
        cuid: token.cuid,
        usfmType: token.type,
        marker: token.marker,
        inPara: token.inPara,
        sid: token.sid,
        level: token.level,
        attributes: token.attributes ?? {},
        version: 1,
        text: token.text ?? "",
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
    };
}
