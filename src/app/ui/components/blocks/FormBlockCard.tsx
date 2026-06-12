// FormBlockCard.tsx
//
// React component rendered by FormBlockNode for one paragraph-class
// block. Switches on the block's kind to apply per-kind treatment:
//
//   - implicit (chapter prelude framing): renders the "Chapter N" badge
//   - rule (\b, \pb): renders null (invisible — wrapper has display:none)
//   - heading (\s, \s1-4, etc.): heading-styled rows
//   - paragraph / poetry / list: the standard card with rows inside
//
// Visual layout per row mirrors the designer's spec: a 3-column grid
// [rail | field | add-after]. Indent ◀▶ arrows live in the per-row
// rail (hover-revealed). The right rail has a `+` that opens an
// insert-marker menu. The field carries a sunken slate background
// with verse number + textarea inside. Verse labels render as their
// own row above each verse-start row.
//
// Block-level chrome: a single hover-revealed trash button top-right
// of the card (deletes the whole block / paragraph). No block-level
// indent arrows — those moved to per-row.

import { Menu } from "@base-ui/react/menu";
import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import {
  AlertCircle,
  FoldVertical,
  IndentDecrease,
  IndentIncrease,
  Plus,
  SplitSquareVertical,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  Fragment,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { decorateFindingInert } from "@/app/domain/editor/annotations/decorators/decorateFinding.tsx";
import { lintIssuesToFindings } from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
  consumePendingFocus,
  deriveBlockKind,
  extractFragmentsFromBlock,
  type FormBlockKind,
  type FormVerseFragment,
  findChapterNumber,
  peekPendingFocus,
  replaceFragmentText,
} from "@/app/domain/editor/utils/formModeBlockTree.ts";
import { emptyVerseSyntheticIssue } from "@/app/domain/editor/utils/formModeSyntheticLint.ts";
import { AnnotationPopover } from "@/app/ui/components/blocks/AnnotationPopover.tsx";
import { AutoTextarea } from "@/app/ui/components/primitives/AutoTextarea/AutoTextarea.tsx";
import {
  FORM_ROW_KEY_ATTR,
  FORM_ROW_SID_ATTR,
} from "@/app/ui/contexts/FormFocusContext.tsx";
import { useFormFocus } from "@/app/ui/contexts/useFormFocus.ts";
import { getLocalizedUsfmMarkerLabel } from "@/app/ui/i18n/usfmMarkerLocalization.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";

import * as styles from "./formBlock.css.ts";

/**
 * Markers offered by the `+` insert menu. Form mode intentionally
 * constrains the palette: verse, paragraph, poetry-1, poetry-2 only.
 * `\m`, `\q3+`, `\b`, `\pb` are preserved when imported from source
 * but never user-pickable here.
 *
 * `v` is special: inserting a verse appends a `\v N` fragment to the
 * current block (no new sibling block). Other markers create a fresh
 * empty block of that kind.
 *
 * `q2` is gated: only offered when the predecessor block is `q1`.
 */
const INSERT_MARKERS = ["v", "p", "q1", "q2"] as const;

/**
 * Indent levels mapped to USFM markers. The new form-mode cycle is
 * just three steps: paragraph → poetry 1 → poetry 2. `\m` is no
 * longer in the cycle; existing `\m` blocks are preserved on
 * round-trip but never offered as an indent target.
 */
const INDENT_LEVEL_MARKERS = ["p", "q1", "q2"] as const;
type IndentLevel = 0 | 1 | 2;

/**
 * Derive the indent level for a block kind. Bare `\q` is treated as
 * `\q1`. Deeper poetry markers (`\q3`, `\q4`, `\qm3`) cap at level 2
 * for the cycle UI but keep their underlying marker.
 */
function indentLevelForKind(kind: FormBlockKind): IndentLevel {
  if (kind.variant !== "poetry") return 0;
  switch (kind.marker) {
    case "q2":
    case "qm2":
      return 2;
    case "q3":
    case "q4":
    case "qm3":
      return 2;
    default:
      return 1;
  }
}

type FormBlockCardProps = {
  id: string;
  direction: LanguageDirection;
  tokens: SerializedLexicalNode[];
  /** SID of the most recent verse in *preceding* blocks (or null). */
  inheritedSid: string | null;
  /**
   * True iff this block can merge into a paragraph-rooted predecessor
   * — both sides are card-eligible AND not already in a continuation
   * relationship (paragraph→poetry continuation is the CSS layer's
   * job). When true the card renders a "Combine" pill above itself.
   */
  canCombineWithPrevious: boolean;
  /**
   * Kind of the previous block (paragraph or poetry, ignoring hidden
   * rule siblings). Used to gate `\q2` insertion and indent
   * promotions that require a preceding `\q1`/`\q2`.
   */
  previousVisibleKind: FormBlockKind | null;
  readOnly?: boolean;
  onChange: (nextTokens: SerializedLexicalNode[]) => void;
  onDelete: () => void;
  onCombineWithPrevious: () => void;
  onChangeBlockMarker: (marker: string) => void;
  onDeleteFragment: (fragment: FormVerseFragment) => void;
  onInsertBelow: (marker: string) => void;
  onSplitBeforeFragment: (fragment: FormVerseFragment, marker: string) => void;
  onInsertVerseBeforeFragment: (fragment: FormVerseFragment) => void;
  onInsertVerseAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
  ) => void;
  onSplitBlockAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
    marker: string,
  ) => void;
};

export function FormBlockCard(props: FormBlockCardProps) {
  const kind = useMemo(() => deriveBlockKind(props.tokens), [props.tokens]);
  const fragments = useMemo(
    () => extractFragmentsFromBlock(props.tokens, props.id, props.inheritedSid),
    [props.tokens, props.id, props.inheritedSid],
  );

  const handleFragmentChange = (
    fragment: FormVerseFragment,
    nextText: string,
  ) => {
    const sidHint = fragment.sid ?? "";
    const nextTokens = replaceFragmentText(
      props.tokens,
      fragment,
      nextText,
      sidHint,
    );
    props.onChange(nextTokens);
  };

  const ownMarker = kind.variant === "implicit" ? null : kind.marker;

  if (kind.variant === "implicit") {
    return <ImplicitBlock tokens={props.tokens} />;
  }
  if (kind.variant === "rule") {
    // Rule blocks are invisible — the wrapper has display:none in
    // CSS. Tokens still round-trip. Render nothing.
    return null;
  }
  if (kind.variant === "heading") {
    return <HeadingBlock fragments={fragments} direction={props.direction} />;
  }

  const indentLevel = indentLevelForKind(kind);

  return (
    <>
      {!props.readOnly && props.canCombineWithPrevious ? (
        <CombineSlot onCombine={props.onCombineWithPrevious} />
      ) : null}
      <FragmentStack
        blockId={props.id}
        kind={kind}
        indentLevel={indentLevel}
        fragments={fragments}
        direction={props.direction}
        readOnly={props.readOnly ?? false}
        ownMarker={ownMarker}
        previousVisibleKind={props.previousVisibleKind}
        onFragmentChange={handleFragmentChange}
        onDelete={props.onDelete}
        onCombineWithPrevious={props.onCombineWithPrevious}
        onChangeBlockMarker={props.onChangeBlockMarker}
        onDeleteFragment={props.onDeleteFragment}
        onSplitBeforeFragment={props.onSplitBeforeFragment}
        onInsertVerseBeforeFragment={props.onInsertVerseBeforeFragment}
        onInsertVerseAtCursor={props.onInsertVerseAtCursor}
        onSplitBlockAtCursor={props.onSplitBlockAtCursor}
        onInsertBelow={props.onInsertBelow}
      />
    </>
  );
}

/**
 * "Combine" pill rendered in the gap above this card when the
 * previous card is paragraph-rooted. Merges this block's content
 * into the previous block.
 */
function CombineSlot(props: { onCombine: () => void }) {
  const { t } = useLingui();
  return (
    <div className={styles.combineSlot} contentEditable={false}>
      <button
        type="button"
        className={styles.combinePill}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onCombine();
        }}
        title={t`Combine these two paragraphs into one`}
      >
        <FoldVertical size={14} />
        {t`Combine`}
      </button>
    </div>
  );
}

/**
 * Render the chapter framing block as a non-editable "Chapter N"
 * badge. Anything else implicit (rare) is left invisible — those
 * tokens still round-trip through `block.tokens` regardless.
 */
function ImplicitBlock(props: { tokens: SerializedLexicalNode[] }) {
  const chapterNumber = useMemo(
    () => findChapterNumber(props.tokens),
    [props.tokens],
  );
  if (!chapterNumber) return null;
  return (
    <div className={styles.chapterBadge} contentEditable={false}>
      <span className={styles.chapterBadgeLabel}>Chapter</span>
      <span className={styles.chapterBadgeNumber}>{chapterNumber}</span>
    </div>
  );
}

/**
 * Heading-kind block: a single bold row, no card chrome, no indent
 * controls. MIght eventaully be Editable on the source side, but as of May 13, 2026 We're trying to impose some limitations as to the amount of structure this form can hold.
 */
function HeadingBlock(props: {
  fragments: FormVerseFragment[];
  direction: LanguageDirection;
}) {
  const { t } = useLingui();
  return (
    <div
      dir={props.direction}
      contentEditable={false}
      onKeyDownCapture={stopOuterEditorKeyEvent}
    >
      {props.fragments.map((fragment) => (
        <span key={fragment.id} className={styles.headingFragmentLabel}>
          {fragment.text || t`Section heading`}
        </span>
      ))}
    </div>
  );
}

type FragmentStackProps = {
  blockId: string;
  kind: FormBlockKind;
  indentLevel: IndentLevel;
  fragments: FormVerseFragment[];
  direction: LanguageDirection;
  readOnly: boolean;
  ownMarker: string | null;
  previousVisibleKind: FormBlockKind | null;
  onFragmentChange: (fragment: FormVerseFragment, nextText: string) => void;
  onDelete: () => void;
  onCombineWithPrevious: () => void;
  onChangeBlockMarker: (marker: string) => void;
  onDeleteFragment: (fragment: FormVerseFragment) => void;
  onSplitBeforeFragment: (fragment: FormVerseFragment, marker: string) => void;
  onInsertVerseBeforeFragment: (fragment: FormVerseFragment) => void;
  onInsertVerseAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
  ) => void;
  onSplitBlockAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
    marker: string,
  ) => void;
  onInsertBelow: (marker: string) => void;
};

/**
 * Renders the per-row stack inside a card. Each row is a 3-column
 * grid: [rail | field | add-after]. Within-card split pill appears
 * between two rows when the second row is a verse-start.
 */
function FragmentStack(props: FragmentStackProps) {
  return (
    <div
      className={styles.block}
      dir={props.direction}
      contentEditable={false}
      onKeyDownCapture={stopOuterEditorKeyEvent}
      onBeforeInputCapture={stopOuterEditorEvent}
      onInputCapture={stopOuterEditorEvent}
    >
      {props.fragments.map((fragment, index) => {
        const isFirstInBlock = index === 0;
        const isLastInBlock = index === props.fragments.length - 1;
        const nextFragment = isLastInBlock ? null : props.fragments[index + 1];
        const nextIsVerseStart = nextFragment?.isFirstOfVerse;
        return (
          <Fragment key={fragment.id}>
            {fragment.isFirstOfVerse && fragment.verseNumber ? (
              <VerseLabel number={fragment.verseNumber} />
            ) : null}
            <FragmentRow
              blockId={props.blockId}
              blockKind={props.kind}
              indentLevel={props.indentLevel}
              fragment={fragment}
              nextFragment={nextFragment}
              fragmentIndex={index}
              isFirstInBlock={isFirstInBlock}
              isLastInBlock={isLastInBlock}
              readOnly={props.readOnly}
              ownMarker={props.ownMarker}
              previousVisibleKind={props.previousVisibleKind}
              onChange={props.onFragmentChange}
              onDelete={props.onDelete}
              onCombineWithPrevious={props.onCombineWithPrevious}
              onChangeBlockMarker={props.onChangeBlockMarker}
              onDeleteFragment={props.onDeleteFragment}
              onSplitBeforeFragment={props.onSplitBeforeFragment}
              onInsertVerseAtCursor={props.onInsertVerseAtCursor}
              onSplitBlockAtCursor={props.onSplitBlockAtCursor}
              onInsertBelow={props.onInsertBelow}
              onInsertVerseBeforeFragment={props.onInsertVerseBeforeFragment}
            />
            {!props.readOnly && nextIsVerseStart && nextFragment ? (
              <SplitGap
                onSplit={() => props.onSplitBeforeFragment(nextFragment, "p")}
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function VerseLabel(props: { number: string | number }) {
  const { t } = useLingui();
  return (
    <div className={styles.verseLabel} contentEditable={false}>
      {t`Verse ${props.number}`}
    </div>
  );
}

function SplitGap(props: { onSplit: () => void }) {
  const { t } = useLingui();
  return (
    <div className={styles.splitGap} contentEditable={false}>
      <button
        type="button"
        className={styles.splitPill}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onSplit();
        }}
        title={t`Split paragraph here`}
      >
        <SplitSquareVertical size={14} />
        {t`Split paragraph`}
      </button>
    </div>
  );
}

type FragmentRowProps = {
  blockId: string;
  blockKind: FormBlockKind;
  indentLevel: IndentLevel;
  fragment: FormVerseFragment;
  nextFragment: FormVerseFragment | null;
  fragmentIndex: number;
  isFirstInBlock: boolean;
  isLastInBlock: boolean;
  readOnly: boolean;
  ownMarker: string | null;
  previousVisibleKind: FormBlockKind | null;
  onChange: (fragment: FormVerseFragment, nextText: string) => void;
  onDelete: () => void;
  onCombineWithPrevious: () => void;
  onChangeBlockMarker: (marker: string) => void;
  onDeleteFragment: (fragment: FormVerseFragment) => void;
  onSplitBeforeFragment: (fragment: FormVerseFragment, marker: string) => void;
  onInsertVerseAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
  ) => void;
  onSplitBlockAtCursor: (
    fragment: FormVerseFragment,
    cursorOffset: number,
    marker: string,
  ) => void;
  onInsertBelow: (marker: string) => void;
  onInsertVerseBeforeFragment: (fragment: FormVerseFragment) => void;
};

function FragmentRow(props: FragmentRowProps) {
  const handleFragmentTextChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    if (props.readOnly) return;
    props.onChange(props.fragment, event.target.value);
  };
  const { setFocused } = useFormFocus();
  const fragmentSid = props.fragment.sid ?? "";
  const handleFocusTextarea = (
    event: React.FocusEvent<HTMLTextAreaElement>,
  ) => {
    if (!fragmentSid) return;
    const ordinal = computeSameSidOrdinal(event.currentTarget, fragmentSid);
    setFocused({ sid: fragmentSid, rowKey: String(ordinal) });
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Right-click in the textarea opens an insert-marker menu at the
  // cursor. Picking "Verse" splits the text in place — the part
  // before the cursor stays on the current verse, the after-text
  // becomes the new verse's content. Picking a paragraph-class
  // marker splits the *block* at the cursor, with the after-text
  // leading the new sibling block.
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
    cursor: number;
  } | null>(null);
  const handleContextMenu = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (props.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const cursor = event.currentTarget.selectionStart ?? 0;
    setContextMenuPos({ x: event.clientX, y: event.clientY, cursor });
  };
  const closeContextMenu = () => setContextMenuPos(null);
  const dispatchContextInsert = (marker: string) => {
    const pos = contextMenuPos;
    if (!pos) return;
    if (marker === "v") {
      props.onInsertVerseAtCursor(props.fragment, pos.cursor);
    } else {
      props.onSplitBlockAtCursor(props.fragment, pos.cursor, marker);
    }
    setContextMenuPos(null);
  };

  // Indent semantics. Arrows ONLY render on poetry rows — `\p` rows
  // have no rail. The cycle is `REMOVE → \q1 → \q2`. Converting a
  // `\p` row into poetry (or back into prose) happens through the
  // `+` menu / right-click context menu, not the rail.
  //
  // Arrows operate on the BLOCK (USFM paragraph-class semantics —
  // the marker on a paragraph applies to every verse fragment
  // inside it). Per row position:
  //   * First row in block → change THIS block's marker; the change
  //     propagates to every fragment in the block.
  //   * Not first row → split BEFORE this fragment, moving this row
  //     and the rows below it into a new block at the chosen marker.
  //     The rows above stay in the original block.
  //
  // On `\q1` the outdent button is REMOVE: it strips the paragraph
  // marker entirely and merges this block's verses into the
  // previous visible block (same operation as the Combine pill).
  // REMOVE is disabled when nothing card-eligible sits above to
  // receive the content (chapter top, or only heading/implicit
  // above). No keyboard shortcut — form mode is a mouse surface.
  const currentLevel = props.indentLevel;
  const isPoetryRow = currentLevel > 0;
  const previousLevel = rowPredecessorIndentLevel(
    props.fragmentIndex,
    props.isFirstInBlock,
    currentLevel,
    props.previousVisibleKind,
  );
  const canMergeIntoPrevious =
    props.previousVisibleKind?.variant === "paragraph" ||
    props.previousVisibleKind?.variant === "poetry" ||
    props.previousVisibleKind?.variant === "list";
  // Indent: q1 → q2 (only if the prior row is at least q1, so we
  // don't break the USFM rule that `\q2` follows `\q1`). q2 caps.
  const canIndent = currentLevel === 1 && previousLevel >= 1;
  // Outdent: q2 → q1 always; q1 → REMOVE iff something card-
  // eligible exists to absorb the content.
  const canOutdent =
    currentLevel === 2 || (currentLevel === 1 && canMergeIntoPrevious);

  const performIndentChange = (target: IndentLevel) => {
    const targetMarker = INDENT_LEVEL_MARKERS[target];
    if (props.isFirstInBlock) {
      props.onChangeBlockMarker(targetMarker);
      return;
    }
    props.onSplitBeforeFragment(props.fragment, targetMarker);
  };

  const handleIndent = () => {
    if (!canIndent) return;
    performIndentChange(2);
  };
  const handleOutdent = () => {
    if (!canOutdent) return;
    if (currentLevel === 1) {
      // REMOVE: strip this block's `\q1` marker, merging its verses
      // into the previous visible block. Same semantic as the
      // Combine pill.
      props.onCombineWithPrevious();
      return;
    }
    // currentLevel === 2: demote to q1.
    performIndentChange(1);
  };

  // Per-row delete X (inside the field). On a single-fragment block
  // delete cascades into removing the block; otherwise just the
  // fragment goes.
  const handleRowDelete = () => {
    if (props.isFirstInBlock && props.isLastInBlock) {
      // Sole fragment in this block — removing it leaves an
      // empty paragraph wrapper, so we delete the whole block.
      props.onDelete();
      return;
    }
    props.onDeleteFragment(props.fragment);
  };

  useEffect(() => {
    if (props.readOnly) return;
    const position = peekPendingFocus(props.blockId);
    if (position === null) return;
    const matches =
      typeof position === "number"
        ? position === props.fragmentIndex
        : position === "first"
          ? props.isFirstInBlock
          : props.isLastInBlock;
    if (!matches) return;
    consumePendingFocus(props.blockId);
    textareaRef.current?.focus({ preventScroll: true });
  }, [
    props.blockId,
    props.fragmentIndex,
    props.isFirstInBlock,
    props.isLastInBlock,
    props.readOnly,
  ]);

  const isInvalid =
    props.fragment.isFirstOfVerse && !props.fragment.text.trim();
  // Form mode doesn't run the lint pipeline; this is its own structural
  // check (empty verse-start). Map it to a synthetic lint issue so we reuse
  // the shared popover and its localized message. See formModeSyntheticLint.
  const [errIconEl, setErrIconEl] = useState<HTMLElement | null>(null);
  const [errHovered, setErrHovered] = useState(false);
  // The synthetic issue carries no fix, so it decorates to a message-only
  // finding (no action button) — same as it rendered under the old
  // lint-mode popover. Inert decoration: form mode's per-card affordance
  // offers no capabilities, so no ctx is assembled.
  const emptyVerseAnnotation = useMemo(() => {
    const [finding] = lintIssuesToFindings([
      emptyVerseSyntheticIssue(fragmentSid || undefined),
    ]);
    return decorateFindingInert(finding);
  }, [fragmentSid]);
  const fieldClassName = [
    styles.field,
    isInvalid ? styles.fieldInvalid : "",
    !props.fragment.isFirstOfVerse ? styles.fieldContinuation : "",
  ]
    .filter(Boolean)
    .join(" ");

  const rowClassName = [
    styles.row,
    props.indentLevel === 1 ? styles.rowIndent1 : "",
    props.indentLevel === 2 ? styles.rowIndent2 : "",
    props.isLastInBlock ? styles.rowLast : "",
  ]
    .filter(Boolean)
    .join(" ");

  const dataAttrs: Record<string, string> = {
    ...(props.readOnly ? { "data-readonly": "true" } : {}),
    [FORM_ROW_SID_ATTR]: fragmentSid,
    [FORM_ROW_KEY_ATTR]: props.fragment.id,
    "data-sid": fragmentSid,
  };

  const { t } = useLingui();
  // Outdent label: on q1 the button means REMOVE (merge into prev
  // block); on q2 it means "demote to q1". On q1 with nothing
  // card-eligible above, the button is disabled with a hint.
  const outdentTitle = canOutdent
    ? currentLevel === 1
      ? t`Remove paragraph`
      : t`Outdent`
    : currentLevel === 1
      ? t`Nothing above to merge into`
      : t`Already at left edge`;
  const indentTitle = canIndent
    ? t`Indent`
    : currentLevel === 1
      ? t`Poetry 2 must follow Poetry 1`
      : t`Already at deepest indent`;
  return (
    <div className={rowClassName} {...dataAttrs}>
      {/* Left rail is editing chrome — hidden on the read-only
       * reference pane so it visually mirrors regular-mode rendering
       * (no editable affordances), and hidden on `\p` rows because
       * paragraph rows don't participate in the indent cycle (use
       * the + menu / right-click to convert to poetry instead).
       * The empty div keeps the 3-column grid stable so
       * source/reference column alignment doesn't jump.
       */}
      <div className={styles.rail}>
        {props.readOnly || !isPoetryRow ? null : (
          <>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!canOutdent}
              onClick={handleOutdent}
              aria-label={outdentTitle}
              title={outdentTitle}
            >
              <IndentDecrease size={16} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!canIndent}
              onClick={handleIndent}
              aria-label={indentTitle}
              title={indentTitle}
            >
              <IndentIncrease size={16} />
            </button>
          </>
        )}
      </div>

      <div className={fieldClassName}>
        <span
          className={styles.verseNum}
          aria-hidden={!props.fragment.isFirstOfVerse}
        >
          {props.fragment.verseNumber ?? "·"}
        </span>
        {props.readOnly ? (
          <ReadOnlyFragmentBody fragment={props.fragment} />
        ) : (
          <AutoTextarea
            ref={textareaRef}
            className={styles.textarea}
            value={props.fragment.text}
            onChange={handleFragmentTextChange}
            onFocus={handleFocusTextarea}
            onContextMenu={handleContextMenu}
            placeholder={
              props.indentLevel === 1
                ? t`Poetry (level 1)`
                : props.indentLevel === 2
                  ? t`Poetry (level 2)`
                  : props.fragment.isFirstOfVerse
                    ? t`Enter verse text…`
                    : t`Continuation line…`
            }
            minHeightPx={props.fragment.text.length === 0 ? 0 : undefined}
          />
        )}
        {isInvalid ? (
          <>
            <button
              type="button"
              ref={setErrIconEl}
              className={styles.errIcon}
              aria-label={t`This verse has no content`}
              onMouseEnter={() => setErrHovered(true)}
              onMouseLeave={() => setErrHovered(false)}
            >
              <AlertCircle size={16} />
            </button>
            <AnnotationPopover
              anchor={errIconEl}
              annotations={errHovered ? [emptyVerseAnnotation] : null}
              onMouseEnter={() => setErrHovered(true)}
              onMouseLeave={() => setErrHovered(false)}
              side="top"
            />
          </>
        ) : null}
        {!props.readOnly ? (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger} ${styles.rowDelete}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleRowDelete();
            }}
            aria-label={
              props.isFirstInBlock && props.isLastInBlock
                ? t`Delete paragraph`
                : t`Delete line`
            }
            title={
              props.isFirstInBlock && props.isLastInBlock
                ? t`Delete paragraph`
                : t`Delete line`
            }
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {!props.readOnly ? (
        <div className={styles.rightRail}>
          <AddRowMenu
            predecessorMarker={props.ownMarker}
            onInsert={(marker) => {
              // "Add line below" semantics: every option
              // inserts content positioned AFTER this
              // row, not before. If there is a next
              // fragment in the same block, we insert
              // before *it* (which lands the new row
              // immediately after this one). If this is
              // the last fragment in the block, we
              // delegate to the block-level
              // `onInsertBelow` which appends a verse to
              // the current block or creates a fresh
              // sibling block for paragraph-class
              // markers.
              if (marker === "v") {
                if (props.nextFragment) {
                  props.onInsertVerseBeforeFragment(props.nextFragment);
                } else {
                  props.onInsertBelow("v");
                }
                return;
              }
              if (props.nextFragment) {
                props.onSplitBeforeFragment(props.nextFragment, marker);
              } else {
                props.onInsertBelow(marker);
              }
            }}
          />
        </div>
      ) : null}

      {contextMenuPos !== null ? (
        <CursorInsertMenu
          anchorPos={contextMenuPos}
          predecessorMarker={props.ownMarker}
          onSelect={dispatchContextInsert}
          onClose={closeContextMenu}
        />
      ) : null}
    </div>
  );
}

/**
 * Indent level of the row immediately above this one — used to gate
 * `\q2` promotion (which requires the prior row to already be `\q1`
 * or `\q2`). Rows inside the same block share the block's kind, so
 * the in-block case just returns `currentLevel`; for first-in-block
 * we look at the previous visible sibling.
 */
function rowPredecessorIndentLevel(
  fragmentIndex: number,
  isFirstInBlock: boolean,
  currentLevel: IndentLevel,
  previousVisibleKind: FormBlockKind | null,
): IndentLevel {
  if (!isFirstInBlock && fragmentIndex > 0) return currentLevel;
  if (!previousVisibleKind) return 0;
  return indentLevelForKind(previousVisibleKind);
}

/**
 * Insert-marker menu for the row's trailing `+`. Adds a new fragment
 * below (verse) or splits the block (paragraph/poetry).
 */
function AddRowMenu(props: {
  predecessorMarker: string | null;
  onInsert: (marker: string) => void;
}) {
  const { t } = useLingui();
  const options = INSERT_MARKERS.filter((marker) =>
    marker === "q2" ? props.predecessorMarker === "q1" : true,
  );
  return (
    <Menu.Root>
      <Menu.Trigger
        className={styles.addAfter}
        aria-label={t`Add line below`}
        title={t`Add line below`}
      >
        <Plus size={16} />
      </Menu.Trigger>
      <Menu.Portal style={{ zIndex: zLayer.editorMenuPositioner }}>
        <Menu.Positioner sideOffset={4} align="end">
          <Menu.Popup className={styles.insertMenuPopup}>
            {options.map((marker) => (
              <Menu.Item
                key={marker}
                className={styles.insertMenuItem}
                onClick={() => props.onInsert(marker)}
              >
                <span>
                  {marker === "v"
                    ? t`Verse`
                    : getLocalizedUsfmMarkerLabel(marker)}
                </span>
                <span
                  className={styles.insertMenuItemMarker}
                >{`\\${marker}`}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Insert-marker menu anchored at the cursor's screen coordinates.
 * Shares its option list with the `+` slot so the right-click flow is
 * pixel-equivalent to the explicit affordance.
 */
function CursorInsertMenu(props: {
  anchorPos: { x: number; y: number };
  predecessorMarker: string | null;
  onSelect: (marker: string) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const options = INSERT_MARKERS.filter((marker) =>
    marker === "q2" ? props.predecessorMarker === "q1" : true,
  );
  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        ({
          x: props.anchorPos.x,
          y: props.anchorPos.y,
          width: 0,
          height: 0,
          top: props.anchorPos.y,
          left: props.anchorPos.x,
          right: props.anchorPos.x,
          bottom: props.anchorPos.y,
        }) as DOMRect,
    }),
    [props.anchorPos],
  );
  return (
    <Menu.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Menu.Portal style={{ zIndex: zLayer.editorMenuPositioner }}>
        <Menu.Positioner anchor={virtualAnchor} sideOffset={4}>
          <Menu.Popup className={styles.insertMenuPopup}>
            {options.map((marker) => (
              <Menu.Item
                key={marker}
                className={styles.insertMenuItem}
                onClick={() => props.onSelect(marker)}
              >
                <span>
                  {marker === "v"
                    ? t`Verse`
                    : getLocalizedUsfmMarkerLabel(marker)}
                </span>
                <span
                  className={styles.insertMenuItemMarker}
                >{`\\${marker}`}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ReadOnlyFragmentBody(props: { fragment: FormVerseFragment }) {
  if (props.fragment.text.length > 0) {
    return <div className={styles.readOnlyText}>{props.fragment.text}</div>;
  }
  return (
    <div className={`${styles.readOnlyText} ${styles.readOnlyPlaceholder}`}>
      &nbsp;
    </div>
  );
}

/**
 * Find the focused textarea's ordinal among same-SID fragments on its
 * own pane. Used to pick the matching fragment on the *other* pane.
 */
function computeSameSidOrdinal(target: Element, sid: string): number {
  const pane = target.closest("[data-form-pane]") ?? document;
  const card = target.closest(`[${FORM_ROW_SID_ATTR}]`);
  if (!card) return 0;
  const all = pane.querySelectorAll(
    `[${FORM_ROW_SID_ATTR}="${cssEscape(sid)}"]`,
  );
  let ordinal = 0;
  all.forEach((el, idx) => {
    if (el === card) ordinal = idx;
  });
  return ordinal;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function stopOuterEditorEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Variant for keydown events that lets global shortcuts through. The
 * action palette uses Cmd/Ctrl+K — without this exception the form
 * mode swallows it before the global handler runs.
 */
function stopOuterEditorKeyEvent(event: React.KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    return;
  }
  event.stopPropagation();
}
