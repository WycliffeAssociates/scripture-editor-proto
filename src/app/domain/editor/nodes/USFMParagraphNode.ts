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
    isStructuralEmptyState,
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
    isStructuralEmpty?: boolean;
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
                { flat: true, stateConfig: isStructuralEmptyState },
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
        $setState(
            writable,
            isStructuralEmptyState,
            json.isStructuralEmpty ?? false,
        );
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
            isStructuralEmpty: this.getIsStructuralEmpty(),
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

    getIsStructuralEmpty(): boolean {
        return $getState(this.getLatest(), isStructuralEmptyState);
    }

    private static getAllStatesFromNode(node: USFMParagraphNode): {
        id: string;
        tokenType: string;
        sid?: string;
        inPara?: string;
        marker?: string;
        isStructuralEmpty?: boolean;
    } {
        // IMPORTANT: In updateDOM, `prevNode` represents a previous snapshot.
        // Read state from the node instance itself (not via `getLatest()`),
        // otherwise prev/next comparisons collapse.
        const id = $getState(node, idState);
        const tokenType = $getState(node, tokenTypeState);
        const sid = $getState(node, sidState) || undefined;
        const inPara = $getState(node, inParaState);
        const marker = $getState(node, markerState);
        const isStructuralEmpty = $getState(node, isStructuralEmptyState)
            ? true
            : undefined;

        return {
            id,
            tokenType,
            sid,
            inPara,
            marker,
            isStructuralEmpty,
        };
    }
    getAllStates(): {
        id: string;
        tokenType: string;
        sid?: string;
        inPara?: string;
        marker?: string;
        isStructuralEmpty?: boolean;
    } {
        return USFMParagraphNode.getAllStatesFromNode(this.getLatest());
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

    setIsStructuralEmpty(isStructuralEmpty: boolean): this {
        $setState(
            this.getWritable(),
            isStructuralEmptyState,
            isStructuralEmpty,
        );
        return this;
    }
    getInPara(): string | undefined {
        return $getState(this.getLatest(), inParaState);
    }

    createDOM(_config: EditorConfig) {
        const el = document.createElement("div");
        el.classList.add("usfm-para-container");
        const ds = el.dataset;
        const states = USFMParagraphNode.getAllStatesFromNode(this);
        if (states.isStructuralEmpty) {
            el.classList.add("is-structural-empty");
        }
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
        // NOTE: With Lexical NodeState, "prevNode" isn't a reliable source of prior state
        // during DOM reconciliation; treat the DOM/dataset as the prior surface of truth.
        void prevNode;

        const next = this.getAllStates();
        const ds = dom.dataset as unknown as Record<string, string>;

        if (next.isStructuralEmpty) {
            dom.classList.add("is-structural-empty");
        } else {
            dom.classList.remove("is-structural-empty");
        }

        (Object.keys(next) as Array<keyof typeof next>).forEach((key) => {
            const nextVal = next[key];
            const dsKey = key as unknown as string;

            if (nextVal == null || nextVal === "") {
                if (ds[dsKey] != null) {
                    delete ds[dsKey];
                }
                return;
            }

            const target = String(nextVal);
            if (ds[dsKey] !== target) {
                ds[dsKey] = target;
            }
        });

        // Returning false tells Lexical it can keep the existing DOM element.
        return false;
    }
    canBeEmpty(): boolean {
        return true;
    }
    remove(preserveEmptyParent?: boolean): void {
        super.remove(preserveEmptyParent);
    }
}

/* type guards */

export function $isUSFMParagraphNode(
    node: LexicalNode | null | undefined,
): node is USFMParagraphNode {
    return node instanceof USFMParagraphNode;
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
    // Canonical whitespace placement: keep markerText free of trailing horizontal whitespace.
    // Any required separator whitespace should live on the first child token as leading whitespace.
    $setState(
        writable,
        markerTextState,
        params.markerText ?? `\\${params.marker}`,
    );
    return node;
}
