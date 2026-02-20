import { parseSid, sortListBySidCanonical } from "@/core/data/bible/bible.ts";
import {
    dedupeErrorMessagesList,
    type LintError,
} from "@/core/data/usfm/lint.ts";

export function replaceLintErrorsForBook(
    prevMessages: LintError[],
    book: string,
    newErrors: LintError[],
): LintError[] {
    const targetBook = book.toUpperCase();
    const filtered = prevMessages.filter((m) => {
        const sid = parseSid(m.sid);
        if (!sid) return true;
        return sid.book !== targetBook;
    });
    return sortListBySidCanonical(
        dedupeErrorMessagesList([...filtered, ...newErrors]),
    );
}

export function replaceLintErrorsForChapter(
    prevMessages: LintError[],
    book: string,
    chapter: number,
    newErrors: LintError[],
): LintError[] {
    const targetBook = book.toUpperCase();
    const filtered = prevMessages.filter((m) => {
        const sid = parseSid(m.sid);
        if (!sid) return true;
        return sid.book !== targetBook || sid.chapter !== chapter;
    });
    return sortListBySidCanonical(
        dedupeErrorMessagesList([...filtered, ...newErrors]),
    );
}
