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
  createState,
  TextNode,
} from "lexical";
import {
  TOKEN_TYPES_CAN_TOGGLE_HIDE,
  USFM_TEXT_NODE_TYPE,
} from "@/app/data/editor";
import {
  classNameState,
  idState,
  inParaState,
  isMutableState,
  markerState,
  showState,
  sidState,
  tokenTypeState,
} from "@/app/domain/editor/states";
import {isValidParaMarker} from "@/core/data/usfm/tokens";
import {TokenMap} from "@/core/domain/usfm/lex";

export type SerializedUSFMTextNode = SerializedTextNode & {
  type: typeof USFM_TEXT_NODE_TYPE;
  id: string;
  tokenType: string;
  show: boolean;
  isMutable: boolean;
  sid?: string;
  inPara?: string;
  marker?: string;
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
        {flat: true, stateConfig: idState},
        {flat: true, stateConfig: sidState},
        {flat: true, stateConfig: inParaState},
        {flat: true, stateConfig: tokenTypeState},
        {flat: true, stateConfig: markerState},
        {flat: true, stateConfig: showState},
        {flat: true, stateConfig: isMutableState},
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
  getMutable(): boolean {
    return $getState(this.getLatest(), isMutableState);
  }
  getShow(): boolean {
    return $getState(this.getLatest(), showState);
  }
  getAllStates(): {
    id: string;
    tokenType: string;
    show: boolean;
    isMutable: boolean;
    sid?: string;
    inPara?: string;
    marker?: string;
  } {
    return {
      id: this.getId(),
      tokenType: this.getTokenType(),
      show: this.getShow(),
      isMutable: this.getMutable(),
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

  setShow(show: boolean): this {
    $setState(this.getWritable(), showState, show);
    return this;
  }
  setMutable(isMutable: boolean): this {
    $setState(this.getWritable(), isMutableState, isMutable);
    return this;
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    const ds = element.dataset;
    const states = this.getAllStates();
    const classNames = this.getClassNames();
    Object.entries(states).forEach(([k, v]) => {
      ds[k] = v.toString();
    });
    classNames.forEach((c) => {
      element.classList.add(c);
    });
    return element;
  }
  updateDOM(
    prevNode: USFMTextNode,
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
  // functions for lock / unlock
  remove(preserveEmptyParent?: boolean): void {
    const isLockable = $isToggleableUSFMTextNode(this);
    const isShowing = $getState(this, showState);
    if (isLockable || !isShowing) {
      const isMutable = $getState(this, isMutableState);
      if (isMutable === false) {
        return;
      }
    }
    super.remove(preserveEmptyParent);
  }
  setTextContent(text: string): this {
    // --- Decide if we should block the update ---
    const isLockableTextNode = $isToggleableUSFMTextNode(this);
    if (isLockableTextNode) {
      const isMutable = $getState(this, isMutableState);

      // If the node is lockable AND the editor is in "immutable" mode,
      // block the update by exiting immediately.. This does prevent copying
      if (isMutable === false) {
        return this;
      }
    }
    super.setTextContent(text);
    return this;
  }
  canInsertTextBefore(): boolean {
    const isLockable = $isToggleableUSFMTextNode(this);
    if (isLockable) {
      const isMutable = $getState(this, isMutableState);
      if (isMutable === false) {
        return false;
      }
    }
    return true;
  }

  canInsertTextAfter(): boolean {
    const isLockable = $isToggleableUSFMTextNode(this);
    if (isLockable) {
      const isMutable = $getState(this, isMutableState);
      if (isMutable === false) {
        return false;
      }
    }
    return true;
  }
}

/* type guards */
export function $isToggleableUSFMTextNode(
  node: LexicalNode
): node is USFMTextNode {
  return (
    node instanceof USFMTextNode &&
    TOKEN_TYPES_CAN_TOGGLE_HIDE.has(node.getTokenType() ?? "")
  );
}
export function $isUSFMTextNode(
  node: LexicalNode | null | undefined
): node is USFMTextNode {
  return node instanceof USFMTextNode;
}
export function isSerializedUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  return node.type === USFM_TEXT_NODE_TYPE;
}
export function isSerializedToggleableUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  const isSerializedUsfmNode = isSerializedUSFMTextNode(node);
  if (!isSerializedUsfmNode) return false;
  const isToggleable = TOKEN_TYPES_CAN_TOGGLE_HIDE.has(node.tokenType ?? "");
  return isToggleable;
}

/* CREATES */
export function $createUSFMTextNode(
  text: string,
  metadata: {
    id: string;
    sid?: string;
    inPara: string;
    tokenType?: string;
    marker?: string;
    className?: Record<string, boolean>;
    isMutable?: boolean;
  }
): USFMTextNode {
  const node = $create(USFMTextNode).setTextContent(text);
  const writable = node.getWritable();
  $setState(writable, idState, metadata.id);

  metadata.sid && $setState(writable, sidState, metadata.sid);
  $setState(writable, inParaState, metadata.inPara);

  const show = !TOKEN_TYPES_CAN_TOGGLE_HIDE.has(metadata.tokenType ?? "");
  const isMutable = true;
  // const isMutable =
  //   metadata.isMutable ??
  //   !TOKEN_TYPES_CAN_TOGGLE_HIDE.has(metadata.tokenType ?? "");
  $setState(writable, showState, show);
  $setState(writable, isMutableState, isMutable);
  if (metadata.tokenType) {
    $setState(writable, tokenTypeState, metadata.tokenType);
  }
  if (metadata.marker) {
    $setState(writable, markerState, metadata.marker);
  }
  if (metadata.className) {
    $setState(writable, classNameState, metadata.className);
  }

  return node;
}
type CreateSerializedUSFMTextNodeParams = {
  text: string;
  id: string;
  sid: string;
  tokenType: string;
  inPara?: string;
  marker?: string;
  show?: boolean;
  isMutable?: boolean;
};
export function createSerializedUSFMTextNode(
  params: CreateSerializedUSFMTextNodeParams
): SerializedUSFMTextNode {
  const show =
    params.show || !TOKEN_TYPES_CAN_TOGGLE_HIDE.has(params.tokenType ?? "");
  const isMutable = true;
  // const isMutable = !tokenTypesToHideByDefault.includes(params.tokenType ?? "");
  // debugger;
  return {
    type: USFM_TEXT_NODE_TYPE,
    id: params.id,
    sid: params.sid,
    inPara: params.inPara,
    tokenType: params.tokenType,
    marker: params.marker,
    isMutable: isMutable,
    show,
    version: 1,
    text: params.text,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
  };
}

// update in place for serialized /json nodes
export function updateSerializedToggleableUSFMTextNode(
  node: SerializedUSFMTextNode,
  nodeUpdate: Partial<SerializedUSFMTextNode>
): SerializedUSFMTextNode {
  return {
    ...node,
    ...nodeUpdate,
  };
}
export function setSerializedToggleableTextMutability(
  node: SerializedUSFMTextNode,
  isMutable: boolean
) {
  return updateSerializedToggleableUSFMTextNode(node, {
    ...node,
    isMutable,
  });
}
