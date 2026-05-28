import { parseSid, sortListByBookCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

const ALL_FILTER_VALUE = "all";

export type LintFilterOption = { value: string; label: string };

export type LintFilterLabels = {
    all: string;
    none: string;
};

const lintIssueBookCodeCache = new Map<string, string>();

export function isOptionChecked(
    option: LintFilterOption,
    activeValues: string[],
    options: LintFilterOption[],
): boolean {
    if (option.value === ALL_FILTER_VALUE) {
        return activeValues.length === options.length - 1;
    }
    return activeValues.includes(option.value);
}

export function toggleSelection(
    current: string[],
    options: LintFilterOption[],
    value: string,
) {
    const allValues: string[] = [];
    for (const option of options) {
        if (option.value !== ALL_FILTER_VALUE) allValues.push(option.value);
    }
    if (value === ALL_FILTER_VALUE) {
        return current.length === allValues.length ? [] : allValues;
    }
    return current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
}

export function summarizeSelection(
    selected: string[],
    options: LintFilterOption[],
    labels: LintFilterLabels,
) {
    const allCount = options.length - 1;
    if (selected.length === allCount) return labels.all;
    if (selected.length === 0) return labels.none;
    return `${selected.length}`;
}

export function buildLintCodeOptions(
    messages: LintIssue[],
    labels: LintFilterLabels,
): LintFilterOption[] {
    const codeSet = new Set<string>();
    for (const issue of messages) {
        if (issue.code) codeSet.add(issue.code);
    }
    const uniqueCodes = Array.from(codeSet).sort((left, right) =>
        left.localeCompare(right),
    );

    return [
        { value: ALL_FILTER_VALUE, label: labels.all },
        ...uniqueCodes.map((code) => ({
            value: code,
            label: formatLintCodeLabel(code),
        })),
    ];
}

export function buildLintBookOptions(
    messages: LintIssue[],
    localizeBook: (input: { bookCode: string }) => string,
    labels: LintFilterLabels,
): LintFilterOption[] {
    const uniqueBooks = Array.from(
        new Set(messages.map((issue) => getLintIssueBookCode(issue))),
    );
    const canonicalBooks = sortListByBookCanonical(uniqueBooks, (book) => book);

    return [
        { value: ALL_FILTER_VALUE, label: labels.all },
        ...canonicalBooks.map((bookCode) => ({
            value: bookCode,
            label: localizeBook({ bookCode }) || bookCode,
        })),
    ];
}

function formatLintCodeLabel(code: string) {
    const words = code.replace(/[-_]/g, " ").trim();
    return words ? words[0].toUpperCase() + words.slice(1) : code;
}

export function getLintIssueBookCode(issue: LintIssue) {
    const sid = issue.sid ?? "";
    if (lintIssueBookCodeCache.has(sid)) {
        return lintIssueBookCodeCache.get(sid) ?? "UNKNOWN";
    }

    const bookCode = (sid ? parseSid(sid)?.book : null) ?? "UNKNOWN";
    lintIssueBookCodeCache.set(sid, bookCode);
    return bookCode;
}
