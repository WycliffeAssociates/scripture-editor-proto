import type {
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { DecoratorNode } from "lexical";

import { BookFrontmatterForm } from "@/app/ui/components/blocks/BookFrontmatterForm.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";

export const BOOK_FRONTMATTER_FORM_NODE_TYPE = "book-frontmatter-form";

export type BookFrontmatterFormNodeJSON = Spread<
  {
    type: typeof BOOK_FRONTMATTER_FORM_NODE_TYPE;
    version: 1;
    id: string;
    direction: LanguageDirection;
    tokens: SerializedLexicalNode[];
  },
  SerializedLexicalNode
>;

/**
 * Chapter 0 in regular mode is edited as one structured form instead of as
 * paragraph containers. This node keeps that UI atomic while still carrying the
 * flat serialized token list needed by save, lint, diff, and history.
 */
export class BookFrontmatterFormNode extends DecoratorNode<React.ReactNode> {
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
    return BOOK_FRONTMATTER_FORM_NODE_TYPE;
  }

  static clone(node: BookFrontmatterFormNode): BookFrontmatterFormNode {
    return new BookFrontmatterFormNode(
      node.__id,
      node.__direction,
      node.__tokens,
      node.__key,
    );
  }

  static importJSON(
    json: BookFrontmatterFormNodeJSON,
  ): BookFrontmatterFormNode {
    return new BookFrontmatterFormNode(
      json.id,
      json.direction ?? "ltr",
      json.tokens ?? [],
    );
  }

  exportJSON(): BookFrontmatterFormNodeJSON {
    return {
      ...super.exportJSON(),
      type: BOOK_FRONTMATTER_FORM_NODE_TYPE,
      version: 1,
      id: this.__id,
      direction: this.__direction,
      tokens: this.__tokens,
    };
  }

  createDOM(): HTMLElement {
    const el = document.createElement("div");
    el.classList.add("book-frontmatter-form");
    return el;
  }

  updateDOM(
    prevNode: BookFrontmatterFormNode,
    _dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    return (
      prevNode.__tokens !== this.__tokens ||
      prevNode.__direction !== this.__direction
    );
  }

  isInline(): boolean {
    return false;
  }

  getId(): string {
    return this.__id;
  }

  getDirection(): LanguageDirection {
    return this.__direction;
  }

  getTokens(): SerializedLexicalNode[] {
    return this.__tokens;
  }

  setTokens(tokens: SerializedLexicalNode[]) {
    this.getWritable().__tokens = tokens;
  }

  decorate(editor: LexicalEditor): React.ReactNode {
    return (
      <BookFrontmatterForm
        id={this.__id}
        direction={this.__direction}
        tokens={this.__tokens}
        onChange={(nextTokens) => {
          editor.update(() => {
            this.getWritable().__tokens = nextTokens;
          });
        }}
      />
    );
  }
}

export function createSerializedBookFrontmatterFormNode(args: {
  direction: LanguageDirection;
  tokens: SerializedLexicalNode[];
  id?: string;
}): BookFrontmatterFormNodeJSON {
  return {
    type: BOOK_FRONTMATTER_FORM_NODE_TYPE,
    version: 1,
    id: args.id ?? guidGenerator(),
    direction: args.direction,
    tokens: args.tokens,
  };
}

export function isSerializedBookFrontmatterFormNode(
  node: SerializedLexicalNode | null | undefined,
): node is BookFrontmatterFormNodeJSON {
  return node?.type === BOOK_FRONTMATTER_FORM_NODE_TYPE;
}
