import type {
    EditorConfig,
    LexicalNode,
    SerializedLexicalNode,
    SerializedTextNode,
} from "lexical";
import {
    $create,
    $getState,
    $getStateChange,
    $setState,
    TextNode,
} from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    idState,
    inCharsState,
    inParaState,
    lintErrorsState,
    markerState,
    sidState,
    tokenTypeState,
} from "@/app/domain/editor/states.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import {
    ALL_CHAR_MARKERS,
    isValidParaMarker,
} from "@/core/data/usfm/tokens.ts";

// make more similar to core domina, or map betwee, but I think more similar, except "content"; attribute we've nto currently used;
export type SerializedUSFMTextNode = SerializedTextNode & {
    /*
  SerializedTextNOde is:
  detail: number;
      format: number;
      mode: TextModeType;
      style: string;
      text: string;
  */
    tokenType: string;
    sid?: string;
    marker?: string;
    lexicalType: typeof USFM_TEXT_NODE_TYPE;
    lexicalKey?: string;
    inPara?: string;
    inChars?: string[];
    id: string;
    lintErrors?: LintError[];
    [key: string]: unknown;
};

export class USFMTextNode extends TextNode {
    static getType(): string {
        return USFM_TEXT_NODE_TYPE;
    }
    /**
     * Automatically handles cloning, import/export JSON by using the modern $config API.
     * This significantly reduces boilerplate code.
     */
    $config() {
        return this.config(USFM_TEXT_NODE_TYPE, {
            extends: TextNode,
            stateConfigs: [
                { flat: true, stateConfig: idState },
                { flat: true, stateConfig: sidState },
                { flat: true, stateConfig: inParaState },
                { flat: true, stateConfig: tokenTypeState },
                { flat: true, stateConfig: markerState },
                { flat: true, stateConfig: lintErrorsState },
                { flat: true, stateConfig: inCharsState },
            ],
        });
    }

    // idk why $config not working for auto serialize
    exportJSON(): SerializedUSFMTextNode {
        return {
            ...super.exportJSON(),
            lexicalKey: this.getKey(),
            lexicalType: USFM_TEXT_NODE_TYPE,
            tokenType: this.getTokenType(),
            id: this.getId(),
            lintErrors: [], //todo: decide do we want to serialize lint errors
            sid: this.getSid(),
            inPara: this.getInPara(),
            inChars: this.getInChars(),
            marker: this.getMarker(),
        };
    }
    // getters and setters
    // --- Getters ---
    getId(): string {
        return $getState(this.getLatest(), idState);
    }

    getLintErrors(): LintError[] {
        return $getState(this.getLatest(), lintErrorsState);
    }

    getSid(): string {
        return $getState(this.getLatest(), sidState);
    }

    getInPara(): string | undefined {
        return $getState(this.getLatest(), inParaState);
    }

    getTokenType(): string {
        return $getState(this.getLatest(), tokenTypeState);
    }

    getMarker(): string | undefined {
        return $getState(this.getLatest(), markerState);
    }
    getInChars(): Array<string> {
        return $getState(this.getLatest(), inCharsState);
    }

    getAllScalarStates(): {
        id: string;
        tokenType: string;
        sid?: string;
        inPara?: string;
        marker?: string;
        isPara?: boolean;
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

    setLintErrors(lintErrors: LintError[]) {
        $setState(this.getWritable(), lintErrorsState, lintErrors);
        return this;
    }

    setSid(sid: string): this {
        $setState(this.getWritable(), sidState, sid);
        return this;
    }

    setInPara(inPara: string | undefined): this {
        $setState(this.getWritable(), inParaState, inPara);
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
    setInChars(inChars: Array<string>): this {
        $setState(this.getWritable(), inCharsState, inChars);
        return this;
    }

    createDOM(config: EditorConfig) {
        const element = super.createDOM(config);
        const ds = element.dataset;
        const states = this.getAllScalarStates();
        const lintErrors = this.getLintErrors();
        const inChars = this.getInChars();
        Object.entries(states).forEach(([k, v]) => {
            if (typeof v === "boolean") {
                ds[k] = v.toString();
            } else if (v) {
                ds[k] = v;
            }
        });
        if (lintErrors.length) {
            element.classList.add("lint-error");
            ds.isLintError = "true";
            lintErrors.forEach((c) => {
                element.classList.add(c.msgKey);
            });
        }
        inChars.forEach((c) => {
            element.classList.add(`inChar-${c}`);
        });
        if (states.marker) {
            if (isValidParaMarker(states.marker)) {
                element.classList.add("isParaMarker");
            }
            if (ALL_CHAR_MARKERS.has(states.marker)) {
                element.classList.add("isCharMarker");
            }
        }
        if (states.tokenType === UsfmTokenTypes.endMarker) {
            element.classList.add("isCharCloseMarker");
        }
        // if (states.tokenType === UsfmTokenTypes.numberRange) {
        //   element.dir = "ltr";
        // }

        return element;
    }
    updateDOM(
        prevNode: USFMTextNode,
        dom: HTMLElement,
        config: EditorConfig,
    ): boolean {
        // super.updateDOM returns true if the text content or format has changed.
        let needsUpdate = super.updateDOM(prevNode as this, dom, config);
        [
            inCharsState,
            inParaState,
            lintErrorsState,
            markerState,
            sidState,
            tokenTypeState,
        ].forEach((s) => {
            // biome-ignore lint/suspicious/noExplicitAny: don't care about mixed types returned from state change, just want to know if it changed
            if ($getStateChange(this, prevNode, s as any)) {
                needsUpdate = true;
            }
        });
        // if any scalar states changed, we need to update the DOM
        if (needsUpdate) return true;
        // const prevInChars = prevNode.getInChars();
        // const currentInChars = this.getInChars();
        // if (!everyArrayItemInEach(prevInChars, currentInChars)) {
        //   needsUpdate = true;
        // }
        // const stateChange = $getStateChange(this, prevNode, lintErrorsState);
        // if (stateChange) {
        //   needsUpdate = true;
        // }
        // const prevLintErrors = prevNode.getLintErrors();

        // since object references are different, have to manual check the arrays:

        return needsUpdate;
    }
    // misc functionality:
    lintErrorsDoNeedUpdate(newLintErrors: LintError[]) {
        const current = this.getLintErrors().map((c) => c.message);
        const incomingMessages = newLintErrors.map((c) => c.message);
        // if either set is not fully contained in the other, then we need to update
        if (newLintErrors.length !== current.length) return true;
        return !current.every((c) => incomingMessages.includes(c));
    }
}

/* type guards */
export function isSerializedNumberOrPlainTextUSFMTextNode(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return (
        isSerializedUSFMTextNode(node) &&
        (node.tokenType === UsfmTokenTypes.numberRange ||
            node.tokenType === UsfmTokenTypes.text)
    );
}
export function $isUSFMTextNode(
    node: LexicalNode | null | undefined,
): node is USFMTextNode {
    return node instanceof USFMTextNode;
}
export function $isVerseRangeTextNode(
    node: LexicalNode | null | undefined,
): node is USFMTextNode {
    return (
        $isUSFMTextNode(node) &&
        node.getTokenType() === UsfmTokenTypes.numberRange
    );
}
export function isSerializedUSFMTextNode(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return node.type === USFM_TEXT_NODE_TYPE;
}
export function isSerializedPlainTextUSFMTextNode(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    const isSerializedUsfmNode = isSerializedUSFMTextNode(node);
    if (!isSerializedUsfmNode) return false;
    return node.tokenType === UsfmTokenTypes.text;
}

/* CREATES */
export type USFMTextNodeMetadata = {
    id: string;
    sid?: string;
    inPara?: string;
    inChars?: string[];
    tokenType?: string;
    marker?: string;
    lintErrors?: LintError[];
    [key: string]: unknown;
};
export function $createUSFMTextNode(
    text: string,
    metadata: USFMTextNodeMetadata,
): USFMTextNode {
    const node = $create(USFMTextNode).setTextContent(text);
    const writable = node.getWritable();
    $setState(writable, idState, metadata.id);

    metadata.sid && $setState(writable, sidState, metadata.sid);
    $setState(writable, inParaState, metadata.inPara);

    if (metadata.tokenType) {
        $setState(writable, tokenTypeState, metadata.tokenType);
    }
    if (metadata.marker) {
        $setState(writable, markerState, metadata.marker);
    }
    if (metadata.lintErrors) {
        $setState(writable, lintErrorsState, metadata.lintErrors);
    }
    if (metadata.inChars) {
        $setState(writable, inCharsState, metadata.inChars);
    }
    return node;
}
type CreateSerializedUSFMTextNodeParams = {
    text: string;
    id: string;
    sid: string;
    tokenType: string;
    inPara?: string;
    inChars?: string[];
    marker?: string;
    lintErrors?: LintError[];
    [key: string]: unknown;
};
export function createSerializedUSFMTextNode(
    params: CreateSerializedUSFMTextNodeParams,
): SerializedUSFMTextNode {
    return {
        // yes, type and lexicalType are the same, but I like deserializing to explicty lexicalType vs parsed token type, and lexical create the node internall via it's regualar "type";
        type: USFM_TEXT_NODE_TYPE,
        lexicalType: USFM_TEXT_NODE_TYPE,
        id: params.id,
        sid: params.sid,
        inPara: params.inPara,
        tokenType: params.tokenType,
        inChars: params.inChars,
        marker: params.marker,
        lintErrors: params.lintErrors,
        version: 1,
        text: params.text,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
    };
}

// update in place for serialized /json nodes
function updateSerializedToggleableUSFMTextNode(
    node: SerializedUSFMTextNode,
    nodeUpdate: Partial<SerializedUSFMTextNode>,
): SerializedUSFMTextNode {
    return {
        ...node,
        ...nodeUpdate,
    };
}
