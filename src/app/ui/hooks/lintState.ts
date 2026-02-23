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
        if (m.sid === "unknown location") return false;
        const sid = parseSid(m.sid);
        if (!sid) return false; // if it's invalid sid, clean it up
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
        if (m.sid === "unknown location") return false;
        const sid = parseSid(m.sid);
        if (!sid) return true;
        return sid.book !== targetBook || sid.chapter !== chapter;
    });
    return sortListBySidCanonical(
        dedupeErrorMessagesList([...filtered, ...newErrors]),
    );
}
