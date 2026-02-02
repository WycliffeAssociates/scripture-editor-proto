import type {
    EditorConfig,
    LexicalNode,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import { $create, $getState, $setState, ElementNode, TextNode } from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE } from "@/app/data/editor.ts";
import {
    idState,
    inParaState,
    markerState,
    markerTextState,
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
    markerText?: string; // Original text of the marker token (e.g., "\\p " or "\\p\n")
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
                { flat: true, stateConfig: markerTextState },
            ],
        });
    }
    // not sure why $config not working for auto serialize/deserialize
    static importJSON(json: USFMParagraphNodeJSON): USFMParagraphNode {
        const node = $create(USFMParagraphNode);
        const writable = node.getWritable();
        $setState(writable, idState, json.id);
        $setState(writable, sidState, json.sid ?? "");
        $setState(writable, markerState, json.marker);
        $setState(writable, inParaState, json.inPara);
        $setState(writable, tokenTypeState, json.tokenType ?? "marker");
        $setState(writable, markerTextState, json.markerText);
        return node;
    }

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
            markerText: this.getMarkerText(),
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

    getMarkerText(): string | undefined {
        return $getState(this.getLatest(), markerTextState);
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

    setMarkerText(markerText: string | undefined): this {
        $setState(this.getWritable(), markerTextState, markerText);
        return this;
    }
    getInPara(): string | undefined {
        return $getState(this.getLatest(), inParaState);
    }

    createDOM(_config: EditorConfig) {
        const el = document.createElement("div");
        el.classList.add("usfm-para-container");
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
        _config: EditorConfig,
    ): boolean {
        const prev = prevNode.getAllStates();
        const next = this.getAllStates();

        const ds = dom.dataset as unknown as Record<string, string>;

        (Object.keys(next) as Array<keyof typeof next>).forEach((key) => {
            const nextVal = next[key];
            const prevVal = prev[key];
            if (nextVal === prevVal) return;

            const dsKey = key as unknown as string;
            if (nextVal == null || nextVal === "") {
                delete ds[dsKey];
                return;
            }

            ds[dsKey] = String(nextVal);
        });

        // Returning false tells Lexical it can keep the existing DOM element.
        return false;
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

/* Factory */

export type CreateUSFMParagraphNodeParams = {
    id: string;
    marker: string;
    inPara?: string;
    tokenType?: string;
    markerText?: string;
};

export function $createUSFMParagraphNode(
    params: CreateUSFMParagraphNodeParams,
): USFMParagraphNode {
    const node = $create(USFMParagraphNode);
    const writable = node.getWritable();
    $setState(writable, idState, params.id);
    $setState(writable, markerState, params.marker);
    $setState(writable, inParaState, params.inPara);
    $setState(writable, tokenTypeState, params.tokenType ?? "marker");
    // Default markerText to "\marker " (with trailing space) for newly created paragraphs
    $setState(
        writable,
        markerTextState,
        params.markerText ?? `\\${params.marker} `,
    );
    return node;
}
