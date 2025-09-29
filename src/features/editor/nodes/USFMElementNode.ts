import { createId } from "@paralleldrive/cuid2";
import {
    type EditorConfig,
    ElementNode,
    LexicalNode,
    type NodeKey,
    type SerializedElementNode,
} from "lexical";
import type { USFMNodeJSON } from "@/lib/getEditorState";
import type { ParsedToken } from "@/lib/parse";

export type USFMElementNodeJSON = SerializedElementNode & {
    type: "usfm-element";
    cuid: string;
    marker?: string;
    inPara?: string;
    sid?: string;
    level?: string;
    attributes?: Record<string, string>;
    version: 1;
};

export class USFMElementNode extends ElementNode {
    __cuid: string;
    __marker?: string;
    __inPara?: string;
    __sid?: string;
    __level?: string;
    __attributes: Record<string, string>;

    static getType(): string {
        return "usfm-element";
    }

    static clone(node: USFMElementNode): USFMElementNode {
        return new USFMElementNode(
            {
                cuid: node.__cuid,
                marker: node.__marker,
                inPara: node.__inPara,
                sid: node.__sid,
                level: node.__level,
                attributes: { ...node.__attributes },
            },
            node.__key,
        );
    }

    constructor(
        opts: {
            cuid: string;
            marker?: string;
            inPara?: string;
            sid?: string;
            level?: string;
            attributes?: Record<string, string>;
        } = {
            cuid: createId(),
        },
        key?: NodeKey,
    ) {
        super(key);
        this.__cuid = opts.cuid;
        this.__marker = opts.marker;
        this.__inPara = opts.inPara;
        this.__sid = opts.sid;
        this.__level = opts.level;
        this.__attributes = opts.attributes || {};
    }

    static importJSON(json: USFMElementNodeJSON): USFMElementNode {
        return new USFMElementNode({
            cuid: json.cuid,
            marker: json.marker,
            inPara: json.inPara,
            sid: json.sid,
            level: json.level,
            attributes: json.attributes,
        });
    }

    exportJSON(): USFMElementNodeJSON {
        return {
            ...super.exportJSON(),
            type: "usfm-element",
            cuid: this.__cuid,
            marker: this.__marker,
            inPara: this.__inPara,
            sid: this.__sid,
            level: this.__level,
            attributes: this.__attributes,
            version: 1,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        // choose DOM tag based on marker
        const el =
            this.__marker === "p"
                ? document.createElement("p")
                : document.createElement("span");

        el.className = `usfm usfm-${this.__marker || "generic"}`;
        if (this.__inPara) el.dataset.inPara = this.__inPara;
        if (this.__sid) el.dataset.sid = this.__sid;
        if (this.__level) el.dataset.level = this.__level;

        return el;
    }

    updateDOM(prevNode: USFMElementNode, dom: HTMLElement): boolean {
        let needsUpdate = false;

        if (this.__marker !== prevNode.__marker) {
            dom.className = `usfm usfm-${this.__marker || "generic"}`;
            needsUpdate = true;
        }
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
    getMarker(): string | undefined {
        return this.__marker;
    }
    getSid(): string | undefined {
        return this.__sid;
    }
}

export function $createUSFMElementNode(opts?: {
    cuid: string;
    marker?: string;
    inPara?: string;
    sid?: string;
    level?: string;
    attributes?: Record<string, string>;
}): USFMElementNode {
    return new USFMElementNode(opts);
}
export function nodeIsUsfmElementNode(
    node: LexicalNode,
): node is USFMElementNode {
    return node.getType() === "usfm-element";
}

export function createSerializedUSFMElementNode(
    opts: ParsedToken,
    childrenCb: () => USFMNodeJSON[],
): USFMElementNodeJSON {
    return {
        type: "usfm-element",
        cuid: opts.cuid,
        marker: opts.marker,
        inPara: opts.inPara,
        sid: opts.sid,
        level: opts.level,
        attributes: opts.attributes ?? {},
        version: 1,
        children: childrenCb(),
        direction: "ltr",
        indent: 0,
        format: "start",
    };
}
