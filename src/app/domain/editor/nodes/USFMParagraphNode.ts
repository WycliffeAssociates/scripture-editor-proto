import type {
    EditorConfig,
    LexicalNode,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import {
    $getState,
    $getStateChange,
    $setState,
    ElementNode,
    TextNode,
} from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE } from "@/app/data/editor.ts";
import {
    idState,
    inParaState,
    markerState,
    sidState,
    tokenTypeState,
} from "@/app/domain/editor/states.ts";

export type USFMParagraphNodeJSON = SerializedElementNode & {
    type: typeof USFM_PARAGRAPH_NODE_TYPE;
    id: string;
    tokenType: string;
    marker?: string;
    inPara?: string;
    sid?: string;
    // attributes?: Record<string, string>;
    version: 1;
};

export class USFMParagraphNode extends ElementNode {
    static getType(): string {
        return USFM_PARAGRAPH_NODE_TYPE;
    }
    /**
     * Automatically handles cloning, import/export JSON by using the modern $config API.
     * This significantly reduces boilerplate code.
     */
    $config() {
        return this.config(USFM_PARAGRAPH_NODE_TYPE, {
            extends: TextNode,
            stateConfigs: [
                { flat: true, stateConfig: idState },
                { flat: true, stateConfig: sidState },
                { flat: true, stateConfig: inParaState },
                { flat: true, stateConfig: tokenTypeState },
                { flat: true, stateConfig: markerState },
            ],
        });
    }
    // not sure why $config not working for auto serialize
    exportJSON(): USFMParagraphNodeJSON {
        return {
            ...super.exportJSON(),
            version: 1,
            type: USFM_PARAGRAPH_NODE_TYPE,
            id: this.getId(),
            tokenType: this.getTokenType(),
            marker: this.getMarker(),
            inPara: this.getInPara(),
            sid: this.getSid(),
        };
    }

    // getters and setters
    // --- Getters ---
    getId(): string {
        return $getState(this.getLatest(), idState);
    }

    getSid(): string {
        return $getState(this.getLatest(), sidState);
    }

    getTokenType(): string {
        return $getState(this.getLatest(), tokenTypeState);
    }

    getMarker(): string | undefined {
        return $getState(this.getLatest(), markerState);
    }
    getAllStates(): {
        id: string;
        tokenType: string;
        sid?: string;
        inPara?: string;
        marker?: string;
    } {
        return {
            id: this.getId(),
            tokenType: this.getTokenType(),
            sid: this.getSid(),
            inPara: this.getInPara(),
            marker: this.getMarker(),
        };
    }

    // --- Setters ---

    setId(id: string): this {
        $setState(this.getWritable(), idState, id);
        return this;
    }

    setSid(sid: string): this {
        $setState(this.getWritable(), sidState, sid);
        return this;
    }

    setTokenType(tokenType: string): this {
        $setState(this.getWritable(), tokenTypeState, tokenType);
        return this;
    }

    setMarker(marker: string | undefined): this {
        $setState(this.getWritable(), markerState, marker);
        return this;
    }
    getInPara(): string | undefined {
        return $getState(this.getLatest(), inParaState);
    }

    createDOM(_config: EditorConfig) {
        const el = document.createElement("div");
        const ds = el.dataset;
        const states = this.getAllStates();
        Object.entries(states).forEach(([k, v]) => {
            if (v) {
                ds[k] = v.toString();
            }
        });
        return el;
    }
    updateDOM(
        prevNode: USFMParagraphNode,
        dom: HTMLElement,
        config: EditorConfig,
    ): boolean {
        // super.updateDOM returns true if the text content or format has changed.
        let needsUpdate = super.updateDOM(prevNode as this, dom, config);
        [sidState, inParaState, markerState, tokenTypeState].forEach((s) => {
            // biome-ignore lint/suspicious/noExplicitAny: <we dont' care about generic return of getStateChange which is mixed passed in from array
            if ($getStateChange(this, prevNode, s as any)) {
                needsUpdate = true;
            }
        });
        return needsUpdate;
    }
    canBeEmpty(): boolean {
        return true;
    }
    remove() {
        return false;
    }
}

/* type guards */

export function $isUSFMParagraphNode(
    node: LexicalNode | null | undefined,
): node is USFMParagraphNode {
    return node instanceof USFMParagraphNode;
}

export function isSerializedParagraphNode(
    node: SerializedLexicalNode,
): node is SerializedElementNode {
    return (
        node.type === USFM_PARAGRAPH_NODE_TYPE ||
        // Back-compat for current serialized states and nested editor wrappers.
        node.type === "paragraph" ||
        node.type === "usfm-element-node"
    );
}
