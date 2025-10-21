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
  TOKENS_TO_LOCK_FROM_EDITING,
  USFM_TEXT_NODE_TYPE,
  UsfmTokenTypes,
} from "@/app/data/editor";
import {
  idState,
  inCharsState,
  inParaState,
  isMutableState,
  lintErrorsState,
  markerState,
  showState,
  sidState,
  tokenTypeState,
} from "@/app/domain/editor/states";
import {isValidParaMarker} from "@/core/data/usfm/tokens";
import {
  arraysEqualByKey,
  everyArrayItemInEach,
} from "@/core/data/utils/generic";
import type {LintError} from "@/core/domain/usfm/parse";

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
  show: boolean;
  isMutable: boolean;
  marker?: string;
  lexicalType: typeof USFM_TEXT_NODE_TYPE;
  lexicalKey?: string;
  inPara?: string;
  id: string;
  lintErrors?: LintError[];
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
        {flat: true, stateConfig: lintErrorsState},
        {flat: true, stateConfig: inCharsState},
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
      show: this.getShow(),
      isMutable: this.getMutable(),
      lintErrors: this.getLintErrors(),
      sid: this.getSid(),
      inPara: this.getInPara(),
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
  getInChars(): Array<string> {
    return $getState(this.getLatest(), inCharsState);
  }

  getAllScalarStates(): {
    id: string;
    tokenType: string;
    show: boolean;
    isMutable: boolean;
    sid?: string;
    inPara?: string;
    marker?: string;
    // inChars?: Array<string>;
    // lintClassNames?: Array<string>;
    isPara?: boolean;
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

  setLintErrors(lintErrors: LintError[]) {
    $setState(this.getWritable(), lintErrorsState, lintErrors);
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
    if (states.marker && isValidParaMarker(states.marker)) {
      element.classList.add("isParaMarker");
    }
    return element;
  }
  updateDOM(
    prevNode: USFMTextNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    // super.updateDOM returns true if the text content or format has changed.
    let needsUpdate = super.updateDOM(prevNode as this, dom, config);
    [
      // inCharsState,
      inParaState,
      isMutableState,
      // lintErrorsState,
      markerState,
      showState,
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
    const prevInChars = prevNode.getInChars();
    const currentInChars = this.getInChars();
    if (!everyArrayItemInEach(prevInChars, currentInChars)) {
      needsUpdate = true;
    }
    const prevLintErrors = prevNode.getLintErrors();
    const currentLintErrors = this.getLintErrors();
    if (!arraysEqualByKey(prevLintErrors, currentLintErrors, "message")) {
      needsUpdate = true;
    }

    // since object references are different, have to manual check the arrays:

    return needsUpdate;
  }
  // functions for lock / unlock
  remove(_preserveEmptyParent?: boolean): void {
    const isLockable = $isToggleableUSFMTextNode(this);
    const isShowing = $getState(this, showState);
    if (isLockable || !isShowing) {
      const isMutable = $getState(this, isMutableState);
      if (isMutable === false) {
        return;
      }
    }
    super.remove();
  }
  // setTextContent(text: string): this {
  //   // --- Decide if we should block the update ---
  //   const isLockableTextNode = $isToggleableUSFMTextNode(this);
  //   if (isLockableTextNode) {
  //     const isMutable = $getState(this, isMutableState);

  //     // If the node is lockable AND the editor is in "immutable" mode,
  //     // block the update by exiting immediately.. This does prevent copying
  //     if (isMutable === false) {
  //       return this;
  //     }
  //   }e
  //   super.setTextContent(text);
  //   return this;
  // }

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

  // misc functionality:
  classNamesNeedUpdate(newClassNames: LintError[]) {
    const current = this.getLintErrors().map((c) => c.message);
    const incomingMessages = newClassNames.map((c) => c.message);
    // if either set is not fully contained in the other, then we need to update
    return (
      !current.every((c) => incomingMessages.includes(c)) ||
      !incomingMessages.every((c) => current.includes(c))
    );
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
export function $isLockedUSFMTextNode(node: LexicalNode | null | undefined) {
  return $isUSFMTextNode(node) && node.getMutable() === false;
}
export function $isVerseRangeTextNode(
  node: LexicalNode | null | undefined
): node is USFMTextNode {
  return (
    $isUSFMTextNode(node) && node.getTokenType() === UsfmTokenTypes.numberRange
  );
}
export function isSerializedUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  return node.type === USFM_TEXT_NODE_TYPE;
}
export function isSerializedToggleShowUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  const isSerializedUsfmNode = isSerializedUSFMTextNode(node);
  if (!isSerializedUsfmNode) return false;
  const isToggleable = TOKEN_TYPES_CAN_TOGGLE_HIDE.has(node.tokenType ?? "");
  return isToggleable;
}
export function isSerializedToggleMutableUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  const isSerializedUsfmNode = isSerializedUSFMTextNode(node);
  if (!isSerializedUsfmNode) return false;
  // @ts-expect-error: tokenType is a string and checking set inclusion
  const isToggleable = TOKENS_TO_LOCK_FROM_EDITING.has(node.tokenType ?? "");
  return isToggleable;
}
export function isSerializedPlainTextUSFMTextNode(
  node: SerializedLexicalNode
): node is SerializedUSFMTextNode {
  const isSerializedUsfmNode = isSerializedUSFMTextNode(node);
  if (!isSerializedUsfmNode) return false;
  return node.tokenType === UsfmTokenTypes.text;
}

/* CREATES */
export function $createUSFMTextNode(
  text: string,
  metadata: {
    id: string;
    sid?: string;
    inPara: string;
    tokenType?: string;
    show?: boolean;
    marker?: string;
    lintErrors?: LintError[];
    isMutable?: boolean;
  }
): USFMTextNode {
  const node = $create(USFMTextNode).setTextContent(text);
  const writable = node.getWritable();
  $setState(writable, idState, metadata.id);

  metadata.sid && $setState(writable, sidState, metadata.sid);
  $setState(writable, inParaState, metadata.inPara);

  const show =
    metadata.show ?? !TOKEN_TYPES_CAN_TOGGLE_HIDE.has(metadata.tokenType ?? "");
  const isMutable = metadata.isMutable ?? true;
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
  if (metadata.lintErrors) {
    $setState(writable, lintErrorsState, metadata.lintErrors);
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
  lintErrors?: LintError[];
  isMutable?: boolean;
};
export function createSerializedUSFMTextNode(
  params: CreateSerializedUSFMTextNodeParams
): SerializedUSFMTextNode {
  const show =
    params.show || !TOKEN_TYPES_CAN_TOGGLE_HIDE.has(params.tokenType ?? "");
  // We always need this to be true initialy for setTextContent. We can lock them after initial render I think;
  // const isMutable = true;
  // @ts-expect-error: set inclusion check is fine
  const isMutable =
    params.isMutable || !TOKENS_TO_LOCK_FROM_EDITING.has(params.tokenType);
  return {
    // yes, type and lexicalType are the same, but I like deserializing to explicty lexicalType vs parsed token type, and lexical create the node internall via it's regualar "type";
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    id: params.id,
    sid: params.sid,
    inPara: params.inPara,
    tokenType: params.tokenType,
    marker: params.marker,
    isMutable: isMutable,
    lintErrors: params.lintErrors,
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
