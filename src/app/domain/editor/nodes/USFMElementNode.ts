import type {
  EditorConfig,
  LexicalNode,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  ElementNode,
  TextNode,
} from "lexical";
import {USFM_ELEMENT_NODE_TYPE, type USFMNodeJSON} from "@/app/data/editor";
import {
  classNameState,
  idState,
  inParaState,
  markerState,
  sidState,
  tokenTypeState,
} from "@/app/domain/editor/states";
import type {ParsedToken} from "@/core/data/usfm/parse";

export type USFMElementNodeJSON = SerializedElementNode & {
  type: typeof USFM_ELEMENT_NODE_TYPE;
  id: string;
  tokenType: string;
  marker?: string;
  inPara?: string;
  sid?: string;
  // attributes?: Record<string, string>;
  version: 1;
};

export class USFMElementNode extends ElementNode {
  static getType(): string {
    return USFM_ELEMENT_NODE_TYPE;
  }
  /**
   * Automatically handles cloning, import/export JSON by using the modern $config API.
   * This significantly reduces boilerplate code.
   */
  $config() {
    return this.config(USFM_ELEMENT_NODE_TYPE, {
      extends: TextNode,
      stateConfigs: [
        {flat: true, stateConfig: idState},
        {flat: true, stateConfig: sidState},
        {flat: true, stateConfig: inParaState},
        {flat: true, stateConfig: tokenTypeState},
        {flat: true, stateConfig: markerState},
        {flat: true, stateConfig: classNameState},
      ],
    });
  }

  // getters and setters
  // --- Getters ---
  getId(): string {
    return $getState(this.getLatest(), idState);
  }

  getClassNames(): string[] {
    const current = $getState(this.getLatest(), classNameState);
    return Object.entries(current)
      .filter(([_, v]) => v)
      .map(([k]) => k);
  }

  getSid(): string {
    return $getState(this.getLatest(), sidState);
  }

  getInPara(): string {
    return $getState(this.getLatest(), inParaState);
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

  setClassName(name: string, value: boolean) {
    const writable = this.getWritable();
    const current = $getState(writable, classNameState);
    $setState(writable, classNameState, {...current, [name]: value});
    return this;
  }

  setSid(sid: string): this {
    $setState(this.getWritable(), sidState, sid);
    return this;
  }

  setInPara(inPara: string): this {
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

  createDOM(config: EditorConfig) {
    const el =
      this.getMarker() === "p"
        ? document.createElement("p")
        : document.createElement("span");
    const ds = el.dataset;
    const states = this.getAllStates();
    const classNames = this.getClassNames();
    Object.entries(states).forEach(([k, v]) => {
      if (v) {
        ds[k] = v.toString();
      }
    });
    classNames.forEach((c) => {
      el.classList.add(c);
    });
    return el;
  }
  updateDOM(
    prevNode: USFMElementNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    // super.updateDOM returns true if the text content or format has changed.
    let needsUpdate = super.updateDOM(prevNode as this, dom, config);
    [sidState, inParaState, markerState, tokenTypeState].forEach((s) => {
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
export function $isUSFMElementNode(node: LexicalNode): node is USFMElementNode {
  return node.getType() === USFM_ELEMENT_NODE_TYPE;
}
export function isSerializedElementNode(
  node: SerializedLexicalNode
): node is SerializedElementNode {
  return node.type === USFM_ELEMENT_NODE_TYPE || node.type === "paragraph";
}

// creates
export function $createUSFMElementNode(opts?: {
  id: string;
  marker?: string;
  inPara?: string;
  sid?: string;
  attributes?: Record<string, string>;
}): USFMElementNode {
  const node = $create(USFMElementNode);
  const writable = node.getWritable();
  if (opts) {
    $setState(writable, idState, opts.id);
    $setState(writable, markerState, opts.marker);
    $setState(writable, inParaState, opts.inPara ?? "");
    $setState(writable, sidState, opts.sid ?? "");
    $setState(writable, classNameState, opts.attributes ?? {});
  }
  return node;
}

export function createSerializedUSFMElementNode(
  opts: ParsedToken,
  direction: "ltr" | "rtl",
  children: USFMNodeJSON[]
): USFMElementNodeJSON {
  return {
    type: USFM_ELEMENT_NODE_TYPE,
    id: opts.id,
    tokenType: opts.type,
    marker: opts.marker,
    inPara: opts.inPara,
    sid: opts.sid,
    // attributes: opts.attributes ?? {},
    version: 1,
    children,
    direction,
    indent: 0,
    format: "start",
  };
}
