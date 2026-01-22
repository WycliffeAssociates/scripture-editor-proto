# Plan: Fix Escaped Marker Parsing Bug

## Problem Description

When users type escaped USFM markers (e.g., `\\v` instead of `\v`), the lexer incorrectly parses them:
- The first `\` becomes an error token
- The second `\v` gets parsed as a marker
- This causes to `invalid syntax` error at the error token

**Example of problematic input:**
```usfm
\\v 8 8 Yahweh said to me, "Amos, what do you see?"
```

**Example of malformed input (already handled by text token):**
```usfm
no longer.v 7 This is what he showed me
```

## Technical Context

**File:** `src/core/domain/usfm/lex.ts`

**Current Lexer Structure:**
- Uses `moo` lexer with multiple states:
  - `main`: Default state
  - `expectingBookCode`: After `\id` marker
  - `expectingNumberRange`: After `\c`, `\v`, etc. markers
  - `specific`: After number range is found

**Current Issue:**
- `textRegex` uses `(?<=.)\\\\` which requires a preceding character to match `\`
- This means a standalone `\` at position 0 can't be matched as text
- `error` token catches the first `\` as unknown content
- Then `\v` gets matched as a regular marker token

**Moo Lexer Rule Order:**
Rules are matched in order - first match wins. This is key to our solution:
- If `\v` appears first in rules, it matches `\v` (correct)
- If `\\v` appears, it won't match the `\v` rule (requires exactly one `\`)
- Falls through to `escapedMarker` rule (our new rule)
- If `\\\v` appears, also falls through to `escapedMarker`

## Solution: Add Single Escaped Marker Rule

### Approach

Add ONE special lexer rule to detect escaped markers (`\\marker`, `\\\marker`, etc.) and normalize them to `\marker`.

**Requirements:**
1. Match any marker preceded by 2+ backslashes
2. Normalize to single backslash version (`\marker`)
3. Apply to ALL markers (not just verse/chapter)
4. Work anywhere during lexing (not just start of line)
5. **Come AFTER regular marker rules** (lower specificity)

### Implementation Details

#### 1. Add Escaped Marker Rule to `main` State

Add this rule **AFTER** all marker rules but **BEFORE** `text` and `error`:

```typescript
// In the lexer states, place this AFTER all marker rules
// (after idMarker, chapterMarker, verseMarker, marker, endMarker, etc.)

escapedMarker: {
    match: /\\{2,}[a-z-\d]+(?=\s+)/u,
    value(v) {
        // Normalize to single backslash: \\v -> \v, \\\v -> \v
        return v.replace(/\\+/, '\\');
    },
},
```

**Regex Pattern Explanation:**
- `/\\{2,}` matches 2 or more backslashes
- `[a-z-\d]+` matches marker name (letters, hyphens, digits)
- `(?=\s+)` positive lookahead - marker must be followed by whitespace
- `v.replace(/\\+/, '\\')` replaces all backslashes with a single one

**Placement in `main` state order:**
1. `nl` (newline)
2. `ws` (whitespace)
3. `pipe`, `attrPair` (other special tokens)
4. `idMarker` (specific marker - high specificity)
5. `chapterMarker`, `chapterAltOpen`, `chapterPublished` (specific markers)
6. `verseMarker`, `verseAltOpen`, `versePublished` (specific markers)
7. `endMarker`, `implicitClose` (closing markers)
8. `marker` (generic marker - medium specificity)
9. **`escapedMarker`** (new rule - lower specificity)
10. `text` (even lower specificity)
11. `error` (catch-all)

This order ensures:
- `\v` matches `verseMarker` (correct)
- `\\v` doesn't match `verseMarker` (too many backslashes), falls through to `escapedMarker` (correct)
- `p` matches `marker` (correct)
- `\\p` doesn't match `marker`, falls through to `escapedMarker` (correct)

#### 2. Update TokenName Union

Add new token type to the union:

```typescript
export type TokenName =
    | "nl"
    | "ws"
    | "pipe"
    | "attrPair"
    | "idMarker"
    | "bookCode"
    | "endMarker"
    | "implicitClose"
    | "marker"
    | "numberRange"
    | "text"
    | "error"
    | "escapedMarker";  // NEW
```

#### 3. Update TokenMap (Optional)

If needed for consistency, add to TokenMap:

```typescript
export const TokenMap = {
    horizontalWhitespace: "ws",
    verticalWhitespace: "nl",
    pipe: "pipe",
    attributePair: "attrPair",
    idMarker: "idMarker",
    bookCode: "bookCode",
    endMarker: "endMarker",
    implicitClose: "implicitClose",
    marker: "marker",
    numberRange: "numberRange",
    text: "text",
    error: "error",
    escapedMarker: "escapedMarker",  // NEW
} as const;
```

#### 4. Update Token Normalization in parseUtils.ts

In `src/core/domain/usfm/parseUtils.ts`, update `prepareLexedToken` to normalize escaped markers to `marker` type:

```typescript
function prepareLexedToken<T extends Token | LintableToken>(
    token: T,
    i: number,
): asserts token is T & LintableToken {
    const markersToUnify = new Set([
        "idMarker",
        "chapterMarker",
        "verseMarker",
        "chapterAltOpen",
        "verseAltOpen",
        "chapterPublished",
        "versePublished",
        "escapedMarker",  // NEW - normalize escaped markers to "marker"
    ]);

    // figure out the type string from either field
    let typeToUse: string = "";
    if ("tokenType" in token) {
        typeToUse = token.tokenType ?? "";
    } else if ("type" in token) {
        typeToUse = token.type ?? "";
    }

    const normalizedType = markersToUnify.has(typeToUse)
        ? TokenMap.marker
        : typeToUse;

    // use id already on token if present, else the loop index
    (token as LintableToken).id ??= String(i);
    (token as LintableToken).tokenType = normalizedType;

    // assign marker if applicable
    if (normalizedType === TokenMap.marker) {
        (token as LintableToken).marker = markerTrimNoSlash(token.text);
    }
    if (normalizedType === TokenMap.endMarker) {
        (token as LintableToken).marker = markerTrimNoSlash(
            token.text.replace("*", ""),
        );
    }
}
```

This ensures escaped markers are treated exactly like their normal counterparts in parsing.

### Testing Strategy

#### Test Cases to Cover

1. **Basic escaped markers:**
   - `\\v 8 8 text` → normalized to `\v 8 8 text`
   - `\\\v 8 8 text` → normalized to `\v 8 8 text`
   - `\\\\v 8 8 text` → normalized to `\v 8 8 text`

2. **All marker types:**
   - `\\id GEN` → normalized to `\id GEN`
   - `\\c 1` → normalized to `\c 1`
   - `\\p Text` → normalized to `\p Text`
   - `\\q1 Text` → normalized to `\q1 Text`
   - `\\s Section Title` → normalized to `\s Section Title`

3. **Mixed escaped and normal markers:**
   - `\v 1 text \\v 2 text \v 3 more text` → All should parse correctly

4. **State transitions:**
   - `\\id GEN \c 1 \v 1 text` → Should properly transition between states
   - `\\v 8 8 text \v 9 9 more text` → Multiple verse markers
   - `\\c 2 \v 1 text` → Chapter then verse transition

5. **Edge cases:**
   - `no longer.v 7 text` → Should be caught by text token (not escaped marker)
   - `\\v7 text` (no space) → Should be caught by text token
   - `\v 8 8 text \\n more text` → Normalized `\v` in middle of content

6. **Error scenarios:**
   - Verify no error tokens for properly escaped markers
   - Verify malformed input still produces appropriate errors
   - Test with the actual problematic input from the bug report

### Example Output

**Input:**
```usfm
\\v 8 8 Yahweh said to me, "Amos, what do you see?"
```

**Expected Token Stream:**
```typescript
[
    { type: "escapedMarker", text: "\\v" },
    { type: "ws", text: " " },
    { type: "numberRange", text: "8" },
    { type: "ws", text: " " },
    { type: "numberRange", text: "8" },
    { type: "ws", text: " " },
    { type: "text", text: "Yahweh said to me..." },
]
```

After normalization in `prepareLexedToken`:
```typescript
[
    { type: "marker", marker: "v", text: "\\v" },
    { type: "ws", text: " " },
    { type: "numberRange", text: "8" },
    { type: "ws", text: " " },
    { type: "numberRange", text: "8" },
    { type: "ws", text: " " },
    { type: "text", text: "Yahweh said to me..." },
]
```

### Files to Modify

1. **`src/core/domain/usfm/lex.ts`** (Main implementation)
   - Add `escapedMarker` lexer rule to `main` state
   - Update `TokenName` type union
   - Optionally update `TokenMap`

2. **`src/core/domain/usfm/parseUtils.ts`** (Normalization)
   - Update `markersToUnify` set in `prepareLexedToken`

3. **Test file** (Create new)
   - Create `src/test/core/domain/usfm/lex.test.ts`
   - Add comprehensive tests for escaped marker handling

## Trade-offs Considered

### Alternative 1: Modify textRegex
**Pros:** Simpler change
**Cons:** More complex regex, may have unintended side effects on other text matching

### Alternative 2: Multiple escaped marker types (escapedIdMarker, escapedVerseMarker, etc.)
**Pros:** More explicit
**Cons:** Code duplication, harder to maintain, violates DRY principle

### Alternative 3: Error message improvement only
**Pros:** No lexer changes
**Cons:** Doesn't actually fix the parsing, just masks the problem

### Chosen Approach: Single escaped marker rule
**Pros:**
- Simple and maintainable (one rule for all markers)
- Leverages moo lexer's order-based specificity naturally
- Minimal code changes
- Clear intent
- Easy to extend if needed

**Cons:**
- Relies on rule ordering (requires careful placement)
- Regex must handle all marker types correctly

## Questions / Open Decisions

1. Should we add lint warnings when escaped markers are detected? (Could help users learn correct syntax)
2. Should escaped markers be logged/analytics tracked to understand frequency?
3. Should we add a test specifically for the exact input from the bug report?
