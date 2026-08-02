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

import {
  USFM_TEXT_NODE_TYPE,
  type UsfmTokenType,
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
  idState,
  inCharsState,
  inParaState,
  attributeOffsetState,
  attributeSourceState,
  attributesState,
  markerState,
  sidState,
  tokenTypeState,
} from "@/app/domain/editor/states.ts";
import {
  ALL_CHAR_MARKERS,
  isValidParaMarker,
} from "@/core/domain/usfm/onionMarkers.ts";
import type { AttributeItem } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
  tokenType: UsfmTokenType;
  sid?: string;
  marker?: string;
  lexicalType: typeof USFM_TEXT_NODE_TYPE;
  lexicalKey?: string;
  inPara?: string;
  inChars?: string[];
  id: string;
  /**
   * USFM 3.1 character-marker attribute list — the `|key="value"`
   * slice on `\w`/`\rb`/`\wl`/`\jmp`/etc. opener tokens. Carried
   * through the node so the round-trip can re-emit it via
   * `tokensToUsfm` upstream. Empty/absent on tokens that don't
   * carry attributes.
   */
  attributes?: AttributeItem[];
  /** Verbatim attribute bytes and placement for untouched round-trips. */
  attributeSource?: string;
  attributeOffset?: number;
  [key: string]: unknown;
};

/**
 * Primary inline token node for the scripture editor.
 *
 * Almost every visible token in the editable scripture surface becomes one of
 * these nodes. The node carries both the user-visible text and the derived
 * metadata needed by later passes such as lint, SID syncing, marker-aware
 * cursor movement, and serialization back into a token stream.
 */
export class USFMTextNode extends TextNode {
  static getType(): string {
    return USFM_TEXT_NODE_TYPE;
  }
  /**
   * Automatically handles cloning, import/export JSON by using the modern $config API.
   * This significantly reduces boilerplate code.
   */
  $config() {
    // NodeState lets the editor keep token metadata attached directly to
    // the node so post-edit maintenance passes can mutate metadata without
    // rebuilding the whole tree.
    return this.config(USFM_TEXT_NODE_TYPE, {
      extends: TextNode,
      stateConfigs: [
        { flat: true, stateConfig: idState },
        { flat: true, stateConfig: sidState },
        { flat: true, stateConfig: inParaState },
        { flat: true, stateConfig: tokenTypeState },
        { flat: true, stateConfig: markerState },
        { flat: true, stateConfig: inCharsState },
        { flat: true, stateConfig: attributesState },
        { flat: true, stateConfig: attributeSourceState },
        { flat: true, stateConfig: attributeOffsetState },
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
      sid: this.getSid(),
      inPara: this.getInPara(),
      inChars: this.getInChars(),
      marker: this.getMarker(),
      attributes: $getState(this.getLatest(), attributesState),
      attributeSource: $getState(this.getLatest(), attributeSourceState),
      attributeOffset: $getState(this.getLatest(), attributeOffsetState),
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

  getInPara(): string | undefined {
    return $getState(this.getLatest(), inParaState);
  }

  getTokenType(): UsfmTokenType {
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
    tokenType: UsfmTokenType;
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

  setSid(sid: string): this {
    $setState(this.getWritable(), sidState, sid);
    return this;
  }

  setInPara(inPara: string | undefined): this {
    $setState(this.getWritable(), inParaState, inPara);
    return this;
  }

  setTokenType(tokenType: UsfmTokenType): this {
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
    const inChars = this.getInChars();
    Object.entries(states).forEach(([k, v]) => {
      if (typeof v === "boolean") {
        ds[k] = v.toString();
      } else if (v) {
        ds[k] = v;
      }
    });
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
    // Any NodeState change means the CSS/data-attribute surface the rest of
    // the app reads from may have changed, so we ask Lexical to refresh the
    // DOM even when plain text content stayed the same.
    // super.updateDOM returns true if the text content or format has changed.
    let needsUpdate = super.updateDOM(prevNode as this, dom, config);
    [inCharsState, inParaState, markerState, sidState, tokenTypeState].forEach(
      (s) => {
        // biome-ignore lint/suspicious/noExplicitAny: don't care about mixed types returned from state change, just want to know if it changed
        if ($getStateChange(this, prevNode, s as any)) {
          needsUpdate = true;
        }
      },
    );
    // if any scalar states changed, we need to update the DOM
    if (needsUpdate) return true;
    // const prevInChars = prevNode.getInChars();
    // const currentInChars = this.getInChars();
    // if (!everyArrayItemInEach(prevInChars, currentInChars)) {
    //   needsUpdate = true;
    // }
    return needsUpdate;
  }
}

/* type guards */
export function $isUSFMTextNode(
  node: LexicalNode | null | undefined,
): node is USFMTextNode {
  return node instanceof USFMTextNode;
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
  tokenType?: UsfmTokenType;
  marker?: string;
  attributes?: AttributeItem[];
  attributeSource?: string;
  attributeOffset?: number;
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
  if (metadata.inChars) {
    $setState(writable, inCharsState, metadata.inChars);
  }
  $setState(writable, attributesState, metadata.attributes);
  $setState(writable, attributeSourceState, metadata.attributeSource);
  $setState(writable, attributeOffsetState, metadata.attributeOffset);
  return node;
}
type CreateSerializedUSFMTextNodeParams = {
  text: string;
  id: string;
  sid: string;
  tokenType: UsfmTokenType;
  inPara?: string;
  inChars?: string[];
  marker?: string;
  /**
   * USFM 3.1 attribute list captured by the parser for opener
   * marker tokens (`\w`/`\rb`/`\wl`/`\jmp`/...). Pass through
   * unmodified so the round-trip serializer can re-emit it.
   */
  attributes?: AttributeItem[];
  attributeSource?: string;
  attributeOffset?: number;
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
    attributes: params.attributes,
    attributeSource: params.attributeSource,
    attributeOffset: params.attributeOffset,
    version: 1,
    text: params.text,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
  };
}
