// FormBlockNode.tsx
//
// Lexical decorator node for one paragraph-class block in form mode.
//
// Node is paragarph/discourse first. each block is one paragraph-class
// container (\p, \q1, \s1, \b, ...) and may hold multiple verse
// fragments inside.  This is because verses in paragraph are th orthogonal. What most parsers are going to group things as a tree by paragraph, And technically speaking versus are merely milestones. So even though verse to verse is helpful for thinking about semantics and diff, for typesetting we think first in terms of paragraphs. The kind is derived from the leading token rather
// than persisted, so updates to `tokens` always recompute kind on the
// next render and never drift.

import type {
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { DecoratorNode } from "lexical";

import {
  buildEmptyBlockTokens,
  buildVerseFragmentTokens,
  canCombineCardWithPrevious,
  computeFramingEnd,
  deriveBlockKind,
  extractFragmentsFromBlock,
  type FormVerseFragment,
  findLastVerseSid,
  insertVerseAtCursor,
  insertVerseFragmentBeforeFragment,
  markBlockPendingFocus,
  nextVerseSidFrom,
  removeFragmentFromBlock,
  setBlockMarker,
  splitBlockAtCursor,
  splitBlockAtFragment,
} from "@/app/domain/editor/utils/formModeBlockTree.ts";
import { FormBlockCard } from "@/app/ui/components/blocks/FormBlockCard.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";

function kindClassName(tokens: SerializedLexicalNode[]): string | null {
  const kind = deriveBlockKind(tokens);
  if (kind.variant === "implicit") return null;
  return `kind-${kind.marker}`;
}

function blockCategory(tokens: SerializedLexicalNode[]): string {
  return deriveBlockKind(tokens).variant;
}

export const FORM_BLOCK_NODE_TYPE = "form-block-node";

export type FormBlockNodeJSON = Spread<
  {
    type: typeof FORM_BLOCK_NODE_TYPE;
    version: 1;
    id: string;
    direction: LanguageDirection;
    tokens: SerializedLexicalNode[];
  },
  SerializedLexicalNode
>;

export class FormBlockNode extends DecoratorNode<React.ReactNode> {
  __id: string;
  __direction: LanguageDirection;
  __tokens: SerializedLexicalNode[];

  constructor(
    id: string,
    direction: LanguageDirection,
    tokens: SerializedLexicalNode[],
    key?: NodeKey,
  ) {
    super(key);
    this.__id = id;
    this.__direction = direction;
    this.__tokens = tokens;
  }

  static getType(): string {
    return FORM_BLOCK_NODE_TYPE;
  }

  static clone(node: FormBlockNode): FormBlockNode {
    return new FormBlockNode(
      node.__id,
      node.__direction,
      node.__tokens,
      node.__key,
    );
  }

  static importJSON(json: FormBlockNodeJSON): FormBlockNode {
    return new FormBlockNode(
      json.id,
      json.direction ?? "ltr",
      json.tokens ?? [],
    );
  }

  exportJSON(): FormBlockNodeJSON {
    return {
      ...super.exportJSON(),
      type: FORM_BLOCK_NODE_TYPE,
      version: 1,
      id: this.__id,
      direction: this.__direction,
      tokens: this.__tokens,
    };
  }

  createDOM(): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("form-block-node");
    const cls = kindClassName(this.__tokens);
    if (cls) el.classList.add(cls);
    el.dataset.blockCategory = blockCategory(this.__tokens);
    return el;
  }

  updateDOM(
    prevNode: FormBlockNode,
    dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    const tokensChanged = prevNode.__tokens !== this.__tokens;
    if (tokensChanged) {
      const prevCls = kindClassName(prevNode.__tokens);
      const nextCls = kindClassName(this.__tokens);
      if (prevCls && prevCls !== nextCls) dom.classList.remove(prevCls);
      if (nextCls) dom.classList.add(nextCls);
      dom.dataset.blockCategory = blockCategory(this.__tokens);
    }
    return tokensChanged || prevNode.__direction !== this.__direction;
  }

  isInline(): boolean {
    return false;
  }

  getId(): string {
    return this.__id;
  }

  getTokens(): SerializedLexicalNode[] {
    return this.__tokens;
  }

  setTokens(tokens: SerializedLexicalNode[]): void {
    this.getWritable().__tokens = tokens;
  }

  decorate(editor: LexicalEditor): React.ReactNode {
    const ownKind = deriveBlockKind(this.__tokens);
    const previousVisible = findPreviousVisibleBlock(this);
    const previousVisibleKind =
      previousVisible !== null
        ? deriveBlockKind(previousVisible.__tokens)
        : null;
    const canCombineWithPrevious = canCombineCardWithPrevious(
      ownKind,
      previousVisibleKind,
    );
    return (
      <FormBlockCard
        id={this.__id}
        direction={this.__direction}
        tokens={this.__tokens}
        inheritedSid={findLastVerseSidWalkingBackwards(this, true)}
        canCombineWithPrevious={canCombineWithPrevious}
        previousVisibleKind={previousVisibleKind}
        readOnly={!editor.isEditable()}
        onChange={(nextTokens) => {
          editor.update(() => {
            this.getWritable().__tokens = nextTokens;
          });
        }}
        onDelete={() => {
          editor.update(() => {
            this.remove();
          });
        }}
        onCombineWithPrevious={() => {
          editor.update(() => {
            // Combine merges this block's content into the
            // previous *visible* sibling. Skips rule
            // blocks (invisible). Refuses implicit and
            // heading predecessors — merging into either
            // would lose content or corrupt structure.
            // The callers gate this too, but defending in
            // the handler keeps the invariant local.
            const prev = findPreviousVisibleBlock(this);
            if (!prev) return;
            const prevKind = deriveBlockKind(prev.__tokens);
            if (
              prevKind.variant === "implicit" ||
              prevKind.variant === "heading"
            ) {
              return;
            }
            const framingEnd = computeFramingEnd(this.__tokens);
            const tail = this.__tokens.slice(framingEnd);
            // Land focus on the freshly-merged tail of `prev` after
            // reconciliation. Without this, the click on the outdent
            // button momentarily focuses body when this block is
            // removed, which lets the browser scroll the viewport
            // wherever it wants (typically the top of the chapter).
            // The FragmentCard's mount-only effect picks up the
            // pending position and focuses with `preventScroll: true`,
            // pinning the user's scroll position where it was.
            markBlockPendingFocus(prev.__id, "last");
            prev.getWritable().__tokens = [...prev.__tokens, ...tail];
            this.remove();
          });
        }}
        onInsertBelow={(marker) => {
          editor.update(() => {
            if (marker === "v") {
              // Verses don't get auto-wrapped in a `\p` — they
              // append into the current block as a new fragment.
              // The next verse number is derived from this
              // block's (or a preceding block's) last verse SID.
              //
              // We rebuild this block by `replace()`-ing it
              // with a fresh FormBlockNode carrying the same
              // id but extended tokens. Mutating __tokens on a
              // captured `this` was unreliable: in observed
              // bugs the tokens ended up overwriting *other*
              // siblings' content. Replacement goes through
              // Lexical's reconciler unambiguously.
              // Always read through getLatest() — the
              // captured `this` can be a snapshot from a
              // previous reconciliation pass.
              const live = this.getLatest();
              const anchorSid = findLastVerseSidWalkingBackwards(live);
              if (!anchorSid) return;
              const next = nextVerseSidFrom(anchorSid);
              if (!next) return;
              const verseTokens = buildVerseFragmentTokens(
                next.sid,
                next.number,
              );
              const replacement = new FormBlockNode(
                live.__id,
                live.__direction,
                [...live.__tokens, ...verseTokens],
              );
              markBlockPendingFocus(live.__id, "last");
              live.replace(replacement);
              return;
            }
            const tokens = buildEmptyBlockTokens(marker);
            const newId = guidGenerator();
            markBlockPendingFocus(newId, "last");
            const nextNode = new FormBlockNode(newId, this.__direction, tokens);
            this.insertAfter(nextNode);
          });
        }}
        onChangeBlockMarker={(marker: string) => {
          editor.update(() => {
            const next = setBlockMarker(this.__tokens, marker);
            if (next) {
              this.getWritable().__tokens = next;
            }
          });
        }}
        onDeleteFragment={(fragment: FormVerseFragment) => {
          editor.update(() => {
            const next = removeFragmentFromBlock(this.__tokens, fragment);
            this.getWritable().__tokens = next;
          });
        }}
        onInsertVerseBeforeFragment={(fragment) => {
          editor.update(() => {
            const live = this.getLatest();
            // Anchor sid: prefer the fragment immediately
            // preceding the insertion point. If there is
            // none (insertion at block start), fall back to
            // walking previous siblings — same logic as the
            // trailing slot.
            const fragments = extractFragmentsFromBlock(
              live.__tokens,
              live.__id,
              findLastVerseSidWalkingBackwards(live, true),
            );
            const targetIdx = fragments.findIndex((f) => f.id === fragment.id);
            const prevFragment =
              targetIdx > 0 ? fragments[targetIdx - 1] : null;
            const anchorSid = prevFragment?.sid
              ? prevFragment.sid
              : findLastVerseSidWalkingBackwards(live, true);
            if (!anchorSid) return;
            const next = nextVerseSidFrom(anchorSid);
            if (!next) return;
            const verseTokens = buildVerseFragmentTokens(next.sid, next.number);
            const updated = insertVerseFragmentBeforeFragment(
              live.__tokens,
              fragment,
              verseTokens,
            );
            if (!updated) return;
            const replacement = new FormBlockNode(
              live.__id,
              live.__direction,
              updated,
            );
            // After insert, the new fragment occupies the
            // index where the target fragment used to live.
            markBlockPendingFocus(
              live.__id,
              targetIdx >= 0 ? targetIdx : "last",
            );
            live.replace(replacement);
          });
        }}
        onSplitBeforeFragment={(fragment, marker) => {
          editor.update(() => {
            const split = splitBlockAtFragment(this.__tokens, fragment, marker);
            if (!split) return;
            this.getWritable().__tokens = split.before;
            const newId = guidGenerator();
            markBlockPendingFocus(newId, "first");
            const next = new FormBlockNode(
              newId,
              this.__direction,
              split.after,
            );
            this.insertAfter(next);
          });
        }}
        onInsertVerseAtCursor={(fragment, cursorOffset) => {
          editor.update(() => {
            const live = this.getLatest();
            const anchorSid =
              fragment.sid ?? findLastVerseSidWalkingBackwards(live);
            if (!anchorSid) return;
            const next = nextVerseSidFrom(anchorSid);
            if (!next) return;
            const updated = insertVerseAtCursor(
              live.__tokens,
              fragment,
              cursorOffset,
              next.sid,
              next.number,
            );
            if (!updated) return;
            const replacement = new FormBlockNode(
              live.__id,
              live.__direction,
              updated,
            );
            // The new fragment lands one slot after the
            // truncated current fragment.
            const fragments = extractFragmentsFromBlock(
              live.__tokens,
              live.__id,
              findLastVerseSidWalkingBackwards(live, true),
            );
            const idx = fragments.findIndex((f) => f.id === fragment.id);
            markBlockPendingFocus(live.__id, idx >= 0 ? idx + 1 : "last");
            live.replace(replacement);
          });
        }}
        onSplitBlockAtCursor={(fragment, cursorOffset, marker) => {
          editor.update(() => {
            const split = splitBlockAtCursor(
              this.__tokens,
              fragment,
              cursorOffset,
              marker,
            );
            if (!split) return;
            this.getWritable().__tokens = split.before;
            const newId = guidGenerator();
            markBlockPendingFocus(newId, "first");
            const next = new FormBlockNode(
              newId,
              this.__direction,
              split.after,
            );
            this.insertAfter(next);
          });
        }}
      />
    );
  }
}

export function createSerializedFormBlockNode(args: {
  direction: LanguageDirection;
  tokens: SerializedLexicalNode[];
  id?: string;
}): FormBlockNodeJSON {
  return {
    type: FORM_BLOCK_NODE_TYPE,
    version: 1,
    id: args.id ?? guidGenerator(),
    direction: args.direction,
    tokens: args.tokens,
  };
}

export function isSerializedFormBlockNode(
  node: SerializedLexicalNode | null | undefined,
): node is FormBlockNodeJSON {
  return node?.type === FORM_BLOCK_NODE_TYPE;
}

/**
 * Walk previous siblings, skipping invisible rule blocks (`\b`,
 * `\pb`), and return the first FormBlockNode encountered. Used by
 * the Combine affordance to find the "visual predecessor" — horizontal rule
 * blocks render as nothing in form mode, so the user perceives the
 * block *before* the rule as the immediate predecessor.
 */
function findPreviousVisibleBlock(node: FormBlockNode): FormBlockNode | null {
  let cursor = node.getPreviousSibling();
  while (cursor) {
    if (cursor instanceof FormBlockNode) {
      const kind = deriveBlockKind(cursor.__tokens);
      if (kind.variant !== "rule") return cursor;
    }
    cursor = cursor.getPreviousSibling();
  }
  return null;
}

/**
 * Find the most recent verse SID by walking from `node` backwards.
 * `skipSelf=false` (default) checks `node`'s tokens first, then walks
 * to preceding siblings — used by verse-insert to anchor the new verse
 * number. `skipSelf=true` skips this node and starts at the previous
 * sibling — used to seed continuation-fragment SIDs for cross-pane
 * focus alignment.
 */
function findLastVerseSidWalkingBackwards(
  node: FormBlockNode,
  skipSelf = false,
): string | null {
  if (!skipSelf) {
    const here = findLastVerseSid(node.__tokens);
    if (here) return here;
  }
  let cursor = node.getPreviousSibling();
  while (cursor) {
    if (cursor instanceof FormBlockNode) {
      const found = findLastVerseSid(cursor.__tokens);
      if (found) return found;
    }
    cursor = cursor.getPreviousSibling();
  }
  return null;
}
