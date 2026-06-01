// bookTitle.ts
//
// Resolving a book's display title from its USFM code is plain lookup over the
// project's book list — no workspace state, no React. A standalone tested
// function so the many consumers (toolbar, pickers, diff/lint views, search)
// share one implementation; WorkspaceContext keeps just a thin wrapper.

/** The only fields title resolution needs — kept structural so this doesn't
 * depend on the full project/book model. */
type TitledBook = { bookCode: string; title: string };

/**
 * Map a book code to its project-localized title.
 *
 * - No matching book → return the code unchanged (callers render a usable label
 *   rather than blanking out).
 * - `replaceCodeInString` → substitute the title for the code inside that string
 *   (e.g. turning a raw SID like `"GEN 1:1"` into `"Genesis 1:1"`), which is why
 *   callers pass a whole reference string rather than just the code.
 */
export function bookCodeToTitle(
    books: ReadonlyArray<TitledBook>,
    {
        bookCode,
        replaceCodeInString,
    }: { bookCode: string; replaceCodeInString?: string },
): string {
    const book = books.find((candidate) => candidate.bookCode === bookCode);
    if (!book) return bookCode;
    if (replaceCodeInString) {
        return replaceCodeInString.replace(bookCode, book.title);
    }
    return book.title;
}
