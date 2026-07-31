// Neutral presentation contract shared by verse-result surfaces (Find today,
// STET next). It deliberately carries no search-engine nouns: a row is a verse
// location with one or two text columns, an optional highlight per column, and
// optional per-row Find affordances (occurrence stepping + replacement). STET
// rows populate columns + ranges highlight and omit `find` entirely.

/**
 * How a column's text is marked.
 *
 * - `match` — a live term matched at render time (Find). Escaping, case, and
 *   whole-word are applied by the renderer, exactly as the legacy preview did.
 * - `ranges` — precomputed `[start, end)` offsets to wrap in `<mark>` (STET).
 *   The renderer does no matching, escaping, or regex; the offsets are trusted
 *   (validated/clamped upstream).
 */
export type ResultHighlight =
  | { mode: "match"; term: string; matchCase: boolean; matchWholeWord: boolean }
  | { mode: "ranges"; ranges: Array<[number, number]> };

export type ResultColumn = {
  kind: "source" | "target";
  /** Column heading shown above the text (project / resource name). */
  label: string;
  text: string;
  /** Shown in place of blank text so absence is explicit, not "no match". */
  missingText: string;
  highlight?: ResultHighlight;
};

/**
 * Replacement affordance for a Find row. The row owns the draft input and the
 * occurrence cursor as ephemeral UI state; it hands the committed value and the
 * cycled-to occurrence back through `onCommit`. The presentational row never
 * imports the search hook or calls a replace verb directly.
 */
export type ResultRowReplacement = {
  /** Seed value for the replace input (Find's default replace term). */
  defaultValue: string;
  /**
   * When set, the match crosses hidden inline markup and cannot be replaced in
   * place — the row offers a jump to USFM mode instead of the input.
   */
  disabledReason?: "hidden-markup-gap";
  /** Commit `value` against the occurrence the row's stepper is sitting on. */
  onCommit: (value: string, occurrenceIndex: number) => Promise<void> | void;
  /** Offered instead of the input when `disabledReason` is set. */
  onEditInUsfm?: () => void;
};

export type ResultRowFind = {
  /**
   * Matches of the term in this row's editable (target) verse. Drives the
   * per-verse occurrence stepper; the row shows it only when > 1.
   */
  occurrenceCount: number;
  replacement?: ResultRowReplacement;
};

export type ResultRow = {
  key: string;
  sid: string;
  /** Human location, e.g. "Genesis 1:1" or "Introduction". */
  locationLabel: string;
  /** One column (single) or source + target (grouped); never more in V1. */
  columns: ResultColumn[];
  active: boolean;
  onNavigate: () => void;
  /**
   * When set, the row cannot be navigated (e.g. STET's HL verse is absent in
   * this project). The navigate control is disabled and explains why via
   * `navigateDisabledLabel`; it must not jump to a fallback location.
   */
  navigateDisabled?: boolean;
  navigateDisabledLabel?: string;
  /**
   * When set, this row's navigate control instead closes the side editor it
   * opened — a one-click toggle back. Only true for the row that currently
   * owns the open editor; every other row's control still just navigates.
   * `onNavigate` itself decides which behavior fires; this only drives the
   * control's rotated icon + label.
   */
  closesSideEditor?: boolean;
  /** Present only for Find rows; STET rows omit it (no stepping / replace). */
  find?: ResultRowFind;
  /**
   * Passthrough hooks so a feature can keep its existing DOM contract without
   * leaking feature nouns into this component. Find sets its test id and
   * `data-search-*` attributes here so existing e2e selectors keep working.
   */
  testId?: string;
  dataAttributes?: Record<string, string>;
};
