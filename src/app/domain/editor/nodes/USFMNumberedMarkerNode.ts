import {
    $create,
    $getNodeByKey,
    $getSelection,
    $getState,
    $isRangeSelection,
    $isTextNode,
    $setState,
    COMMAND_PRIORITY_LOW,
    CONTROLLED_TEXT_INSERTION_COMMAND,
    createState,
    DELETE_CHARACTER_COMMAND,
    type EditorConfig,
    KEY_ARROW_LEFT_COMMAND,
    KEY_ARROW_RIGHT_COMMAND,
    KEY_SPACE_COMMAND,
    type LexicalEditor,
    SELECTION_CHANGE_COMMAND,
    type TextNode,
} from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    type SerializedUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    idState,
    inParaState,
    markerState,
    sidState,
    tokenTypeState,
} from "@/app/domain/editor/states.ts";

export const USFM_NUMBERED_MARKER_NODE_TYPE =
    "usfm-numbered-marker-node" as const;

/** Token type carried by numbered-marker nodes — see UsfmTokenTypes. */
export const NUMBERED_MARKER_TOKEN_TYPE = UsfmTokenTypes.numberedMarker;

// --- Node-specific NodeState ---
// These states exist only on numbered-marker nodes, so they live here rather
// than in the shared states.ts.

/**
 * The opening marker's bytes verbatim, including its absorbed required
 * delimiter (e.g. "\\v " or "\\vp "). Never part of the editable text.
 */
const openBytesState = createState("openBytes", {
    parse: (value) => (typeof value === "string" ? value : ""),
});

/**
 * End-marker bytes as given by the lexer (e.g. "\\vp*"), or null when the
 * marker family never closes (\c, \v, \cp) or the close was absent in the
 * file. Whether a close is *expected* is a catalog question
 * (closingBehavior), not stored here.
 */
const closeBytesState = createState("closeBytes", {
    parse: (value) => (typeof value === "string" ? value : null),
});

/** Original token id of the opening marker token. */
const openIdState = createState("openId", {
    parse: (value) => (typeof value === "string" ? value : ""),
});

/** Original token id of the endMarker token, when one exists. */
const closeIdState = createState("closeId", {
    parse: (value) => (typeof value === "string" ? value : null),
});

export type SerializedUSFMNumberedMarkerNode = SerializedUSFMTextNode & {
    openBytes: string;
    closeBytes: string | null;
    openId: string;
    closeId: string | null;
};

/**
 * Inline node for the marker+number-payload family (\c, \v, \cp, \ca, \va,
 * \vp — catalog `payload: "numberRange"`).
 *
 * The marker's bytes live in NodeState (`openBytes`/`closeBytes`); only the
 * Number token's source is editable text. The caret therefore cannot reach
 * marker bytes at the model level — the hidden-editable-bytes failure class
 * is unrepresentable rather than repaired.
 *
 * `textContent` is the Number token source VERBATIM: any excess leading
 * whitespace the lexer parked forward, plus the number's own trailing
 * argument-terminator space. It may be "" — a legitimate transient bad state
 * (surfaced by lint, never silently repaired).
 *
 * Token identity: the node's base `id` is the Number token's id (findings
 * anchor to the visible content); `openId`/`closeId` retain the marker and
 * endMarker token ids so findings on those tokens survive round-trips.
 *
 * Emission is shape-derived: open marker token · Number token ·
 * [endMarker token iff closeBytes != null].
 */
export class USFMNumberedMarkerNode extends USFMTextNode {
    static getType(): string {
        return USFM_NUMBERED_MARKER_NODE_TYPE;
    }

    $config() {
        return this.config(USFM_NUMBERED_MARKER_NODE_TYPE, {
            extends: USFMTextNode,
            stateConfigs: [
                { flat: true, stateConfig: openBytesState },
                { flat: true, stateConfig: closeBytesState },
                { flat: true, stateConfig: openIdState },
                { flat: true, stateConfig: closeIdState },
            ],
        });
    }

    exportJSON(): SerializedUSFMNumberedMarkerNode {
        return {
            ...super.exportJSON(),
            lexicalType:
                USFM_NUMBERED_MARKER_NODE_TYPE as unknown as SerializedUSFMTextNode["lexicalType"],
            openBytes: this.getOpenBytes(),
            closeBytes: this.getCloseBytes(),
            openId: this.getOpenId(),
            closeId: this.getCloseId(),
        };
    }

    // --- Getters / setters ---
    getOpenBytes(): string {
        return $getState(this.getLatest(), openBytesState);
    }
    getCloseBytes(): string | null {
        return $getState(this.getLatest(), closeBytesState);
    }
    getOpenId(): string {
        return $getState(this.getLatest(), openIdState);
    }
    getCloseId(): string | null {
        return $getState(this.getLatest(), closeIdState);
    }
    setOpenBytes(openBytes: string): this {
        $setState(this.getWritable(), openBytesState, openBytes);
        return this;
    }
    setCloseBytes(closeBytes: string | null): this {
        $setState(this.getWritable(), closeBytesState, closeBytes);
        return this;
    }

    /**
     * The bytes this node contributes to the serialized stream:
     * openBytes · number source · closeBytes.
     */
    getUsfmBytes(): string {
        return (
            this.getOpenBytes() +
            this.getTextContent() +
            (this.getCloseBytes() ?? "")
        );
    }

    /**
     * Marker bytes can never split off — they aren't in the text — but a
     * split would fragment the Number token into number + spurious text
     * siblings (created as plain text nodes by Lexical's splitText), breaking
     * token fidelity. Numbered nodes refuse to split; range operations clamp
     * to whole-content semantics instead.
     *
     * Known consequence: callers that index into the split result
     * (formatText) would misbehave — the scripture editor dispatches no text
     * format commands, and the playground swallows FORMAT_TEXT_COMMAND.
     */
    splitText(..._splitOffsets: number[]): TextNode[] {
        return [this.getLatest()];
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);
        element.classList.add("usfm-numbered-marker");
        if (this.getTextContent() === "") {
            element.dataset.empty = "true";
        }
        return element;
    }

    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
        // data-empty rides on the DOM element; recreate it when emptiness
        // flips so the empty-state affordance stays in sync. `prevNode` is a
        // previous snapshot — read its text directly, NOT via getters (they
        // call getLatest(), collapsing the prev/next comparison).
        const wasEmpty = prevNode.__text === "";
        const isEmpty = this.__text === "";
        if (wasEmpty !== isEmpty) return true;
        return super.updateDOM(prevNode, dom, config);
    }
}

export function $isUSFMNumberedMarkerNode(
    node: unknown,
): node is USFMNumberedMarkerNode {
    return node instanceof USFMNumberedMarkerNode;
}

export type USFMNumberedMarkerNodeMetadata = {
    /** Number token id — becomes the node's base id (findings anchor). */
    numberId: string;
    openId: string;
    closeId?: string | null;
    openBytes: string;
    closeBytes?: string | null;
    marker: string;
    sid?: string;
    inPara?: string;
};

export function $createUSFMNumberedMarkerNode(
    /** Number token source verbatim (may be "" for an unpaired marker). */
    numberText: string,
    metadata: USFMNumberedMarkerNodeMetadata,
): USFMNumberedMarkerNode {
    const node = $create(USFMNumberedMarkerNode).setTextContent(numberText);
    const writable = node.getWritable();
    $setState(writable, idState, metadata.numberId);
    $setState(writable, openIdState, metadata.openId);
    $setState(writable, closeIdState, metadata.closeId ?? null);
    $setState(writable, openBytesState, metadata.openBytes);
    $setState(writable, closeBytesState, metadata.closeBytes ?? null);
    $setState(writable, markerState, metadata.marker);
    $setState(writable, tokenTypeState, NUMBERED_MARKER_TOKEN_TYPE);
    if (metadata.sid) $setState(writable, sidState, metadata.sid);
    $setState(writable, inParaState, metadata.inPara);
    return node;
}

/**
 * Serialized-JSON factory for the pairing waist (which runs over serialized
 * trees with no Lexical editor in scope). Mirrors what exportJSON of a
 * $createUSFMNumberedMarkerNode-built node produces, so paired-at-load and
 * round-tripped nodes are indistinguishable.
 */
export function createSerializedUSFMNumberedMarkerNode(
    numberText: string,
    metadata: USFMNumberedMarkerNodeMetadata,
): SerializedUSFMNumberedMarkerNode {
    return {
        type: USFM_NUMBERED_MARKER_NODE_TYPE,
        lexicalType:
            USFM_NUMBERED_MARKER_NODE_TYPE as unknown as SerializedUSFMTextNode["lexicalType"],
        version: 1,
        text: numberText,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        id: metadata.numberId,
        openId: metadata.openId,
        closeId: metadata.closeId ?? null,
        openBytes: metadata.openBytes,
        closeBytes: metadata.closeBytes ?? null,
        marker: metadata.marker,
        tokenType: NUMBERED_MARKER_TOKEN_TYPE,
        sid: metadata.sid ?? "",
        inPara: metadata.inPara,
    };
}

export function isSerializedUSFMNumberedMarkerNode(
    node: { type?: string } | null | undefined,
): node is SerializedUSFMNumberedMarkerNode {
    return node?.type === USFM_NUMBERED_MARKER_NODE_TYPE;
}

/**
 * Two-stage delete for numbered-marker nodes (one synchronous command guard;
 * no timers, no async caret moves):
 *
 * 1. A deletion entirely within one numbered node that would leave no number
 *    content (whitespace-only counts as none — the content carries the
 *    number's argument-terminator space) empties the node instead. The caret
 *    stays inside the still-number-typed node, so typing the replacement
 *    digit immediately renders as a number.
 * 2. A delete on an already-empty node removes it whole — structure,
 *    delimiter and all, in one gesture.
 *
 * Everything else falls through to default Lexical behavior: offset-0
 * backspace reaches the previous sibling (no hidden bytes to eat), and
 * multi-node range deletes remove visibly-selected nodes whole.
 *
 * Stage 1's @0 placement is an affinity-armed position like the arrow
 * stops' — without arming, ingestion would normalize the caret out of the
 * just-emptied node and the replacement digit would land in the previous
 * text node.
 */
function registerDeletion(
    editor: LexicalEditor,
    setAffinity: (key: string | null) => void,
) {
    return editor.registerCommand<boolean>(
        DELETE_CHARACTER_COMMAND,
        (isBackward) => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return false;
            const anchorNode = selection.anchor.getNode();
            if (!$isUSFMNumberedMarkerNode(anchorNode)) return false;

            const text = anchorNode.getTextContent();

            // Stage 2: the node is already empty — remove it whole.
            if (selection.isCollapsed() && text === "") {
                const prev = anchorNode.getPreviousSibling();
                const parent = anchorNode.getParent();
                const index = anchorNode.getIndexWithinParent();
                setAffinity(null);
                anchorNode.remove();
                if ($isTextNode(prev)) {
                    prev.selectEnd();
                } else if (parent?.isAttached()) {
                    parent.select(index, index);
                }
                return true;
            }

            // Determine the span this delete would remove, and require it to
            // sit entirely within this node.
            let start: number;
            let end: number;
            if (selection.isCollapsed()) {
                const offset = selection.anchor.offset;
                if (isBackward) {
                    if (offset === 0) return false; // boundary → default
                    start = offset - 1;
                    end = offset;
                } else {
                    if (offset >= text.length) return false;
                    start = offset;
                    end = offset + 1;
                }
            } else {
                const focusNode = selection.focus.getNode();
                if (focusNode !== anchorNode) return false; // multi-node → default
                start = Math.min(
                    selection.anchor.offset,
                    selection.focus.offset,
                );
                end = Math.max(selection.anchor.offset, selection.focus.offset);
            }

            const remaining = text.slice(0, start) + text.slice(end);
            if (remaining.trim() !== "") return false; // digits survive → default

            // Stage 1: the last number content is going — clear the whole
            // content (terminator space included) and keep the caret inside.
            anchorNode.setTextContent("");
            anchorNode.select(0, 0);
            setAffinity(anchorNode.getKey());
            return true;
        },
        COMMAND_PRIORITY_LOW,
    );
}

function $placeCaret(
    node: TextNode,
    offset: number,
    event: KeyboardEvent,
): true {
    event.preventDefault();
    node.select(offset, offset);
    return true;
}

/**
 * Double-stop caret movement at numbered-marker boundaries.
 *
 * @0 placements need defending — Lexical canonicalizes them away in TWO
 * places, neither with a subclass hook:
 *
 * 1. DOM-selection ingestion (`resolveSelectionPointOnBoundary`) rewrites a
 *    text point at offset 0 to prevSibling@end when the previous sibling is
 *    a TextNode. After we place node@0 and the reconciler moves the DOM
 *    caret, the resulting selectionchange silently reverts the model.
 * 2. `beforeinput` (`selection.applyDOMRange(targetRange)`) re-resolves the
 *    event's target range through the same normalizer right before a text
 *    insertion — so even a surviving model placement gets reverted at the
 *    moment of typing. (Keydown-driven commands — arrows, backspace — read
 *    the model directly and don't hit this.)
 *
 * Defense: a sticky affinity key recording the node we placed the caret
 * into at @0. The SELECTION_CHANGE correction restores the placement after
 * ingestion (it converges — the re-set reconciles to a DOM position the
 * caret already occupies, so no further selectionchange fires), and a
 * CONTROLLED_TEXT_INSERTION handler (running before rich-text's inserter)
 * restores it after applyDOMRange so the keystroke lands in the placed
 * node. The affinity clears as soon as the selection genuinely moves
 * elsewhere.
 *
 * A node edge is one visual position with two model positions (prev@end ≡
 * next@0); the browser canonicalizes to prev@end, so the @0 side of a
 * numbered boundary is never reachable by default — you cannot put the caret
 * before the "2" to type "12". These handlers make BOTH sides of every
 * numbered-node edge explicit caret stops: crossing a number boundary takes
 * two presses at the same visual spot, with the caret's owning node (and
 * therefore the edit target — caret position IS the edit target, nothing
 * redirects keystrokes) flipping between the presses. CSS caret-color makes
 * the flip visible.
 *
 * Stops exist only where at least one side of the boundary is a numbered
 * node; plain-text↔plain-text seams keep default (invisible) behavior.
 * Bypassed: modified arrows (shift/alt/meta/ctrl — selection extension and
 * word/line jumps stay native), IME composition, non-collapsed selections,
 * and non-text siblings (linebreak crossing stays native; line starts don't
 * alias anyway).
 */
export function registerNumberedMarkerBehaviors(editor: LexicalEditor) {
    // Sticky affinity: key of the node we last explicitly placed the caret
    // into at offset 0 (arrow stops AND the delete guard's stage-1 empty).
    // Cleared when the selection genuinely leaves the spot.
    let affinityKey: string | null = null;

    const $place = (
        node: TextNode,
        offset: number,
        event: KeyboardEvent,
    ): true => {
        affinityKey = offset === 0 ? node.getKey() : null;
        return $placeCaret(node, offset, event);
    };

    /**
     * Is the current collapsed selection sitting on the alias of the
     * affinity placement (prev@end whose next sibling is the placed node)?
     * Returns the placed node when so.
     */
    const $aliasedAffinityTarget = (): TextNode | null => {
        if (affinityKey === null) return null;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return null;
        }
        const node = selection.anchor.getNode();
        if (
            $isTextNode(node) &&
            selection.anchor.offset === node.getTextContentSize() &&
            node.getNextSibling()?.getKey() === affinityKey
        ) {
            const target = $getNodeByKey(affinityKey);
            return $isTextNode(target) ? target : null;
        }
        return null;
    };

    const $handle = (event: KeyboardEvent, isLeft: boolean): boolean => {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
            return false;
        }
        if (editor.isComposing()) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
        }
        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return false;
        const offset = selection.anchor.offset;
        const size = node.getTextContentSize();
        const isNumbered = $isUSFMNumberedMarkerNode(node);

        if (isLeft) {
            if (isNumbered && offset > 0) {
                // Interior move — explicit, because a default move to @0
                // would canonicalize out of the node entirely.
                return $place(node, offset - 1, event);
            }
            if (isNumbered && offset === 0) {
                const prev = node.getPreviousSibling();
                if ($isTextNode(prev)) {
                    return $place(prev, prev.getTextContentSize(), event);
                }
                return false;
            }
            const prev = node.getPreviousSibling();
            if ($isUSFMNumberedMarkerNode(prev)) {
                // Give text@0 its own stop (default would skip straight to
                // the number), then hand off to the number's end.
                if (offset === 1) return $place(node, 0, event);
                if (offset === 0) {
                    return $place(prev, prev.getTextContentSize(), event);
                }
            }
            return false;
        }

        // Rightward. Interior numbered moves are fine by default — the
        // canonical name of the end boundary is the number's own @end.
        if (offset !== size) return false;
        const next = node.getNextSibling();
        if (isNumbered && $isTextNode(next)) return $place(next, 0, event);
        if ($isUSFMNumberedMarkerNode(next)) return $place(next, 0, event);
        return false;
    };

    const $correctIngestion = (): boolean => {
        if (affinityKey === null) return false;
        const selection = $getSelection();
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const node = selection.anchor.getNode();
            // Placement intact — keep the affinity armed (typing still
            // needs it; see the beforeinput note above).
            if (
                node.getKey() === affinityKey &&
                selection.anchor.offset === 0
            ) {
                return false;
            }
            // Ingestion rewrote the placement to its alias — restore it.
            const target = $aliasedAffinityTarget();
            if (target) {
                target.select(0, 0);
                return true;
            }
        }
        // The selection genuinely moved elsewhere — affinity over.
        affinityKey = null;
        return false;
    };

    const $correctInsertionTarget = (): boolean => {
        // beforeinput's applyDOMRange has already re-canonicalized the
        // selection within this very update; put it back so rich-text's
        // inserter (next in line) lands the keystroke in the placed node.
        const target = $aliasedAffinityTarget();
        if (target) target.select(0, 0);
        return false;
    };

    /**
     * Space-at-end caret jump (the one kept interceptor from the old
     * editor, node-scoped): the number's required whitespace already
     * exists, so another space would be superfluous bytes — move the caret
     * to where typing belongs instead. Pure caret move, no byte change.
     * When the terminator is genuinely absent, the space is allowed in —
     * it IS the terminator.
     *
     * Keydown-level (KEY_SPACE_COMMAND), not CONTROLLED_TEXT_INSERTION:
     * same-node typing takes Lexical's uncontrolled fast path, which never
     * dispatches the insertion command.
     */
    const $spaceJump = (event: KeyboardEvent): boolean => {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
            return false;
        }
        if (editor.isComposing()) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
        }
        const node = selection.anchor.getNode();
        if (!$isUSFMNumberedMarkerNode(node)) return false;
        const text = node.getTextContent();
        const rest = text.slice(selection.anchor.offset);
        const terminatorPresent =
            rest.length > 0 ? /^\s+$/.test(rest) : /\s$/.test(text);
        const next = node.getNextSibling();
        if (terminatorPresent && $isTextNode(next)) {
            event.preventDefault();
            next.select(0, 0);
            affinityKey = next.getKey();
            return true; // swallow the space
        }
        return false;
    };

    const unregisterLeft = editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_LEFT_COMMAND,
        (event) => $handle(event, true),
        COMMAND_PRIORITY_LOW,
    );
    const unregisterRight = editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => $handle(event, false),
        COMMAND_PRIORITY_LOW,
    );
    const unregisterCorrection = editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        $correctIngestion,
        COMMAND_PRIORITY_LOW,
    );
    const unregisterInsertion = editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        $correctInsertionTarget,
        COMMAND_PRIORITY_LOW,
    );
    const unregisterDeletion = registerDeletion(editor, (key) => {
        affinityKey = key;
    });
    const unregisterSpace = editor.registerCommand<KeyboardEvent>(
        KEY_SPACE_COMMAND,
        $spaceJump,
        COMMAND_PRIORITY_LOW,
    );
    return () => {
        unregisterSpace();
        unregisterLeft();
        unregisterRight();
        unregisterCorrection();
        unregisterInsertion();
        unregisterDeletion();
    };
}
