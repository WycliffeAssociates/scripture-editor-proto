import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Filter } from "lucide-react";
import * as buttonStyles from "@/app/ui/components/primitives/Button/button.css.ts";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { parseSid, sortListByBookCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

const ALL_FILTER_VALUE = "all";

export type LintFilterOption = { value: string; label: string };

export type LintFilterLabels = {
    all: string;
    none: string;
};

const lintIssueBookCodeCache = new Map<string, string>();

function isOptionChecked(
    option: LintFilterOption,
    activeValues: string[],
    options: LintFilterOption[],
): boolean {
    if (option.value === ALL_FILTER_VALUE) {
        return activeValues.length === options.length - 1;
    }
    return activeValues.includes(option.value);
}

export function LintFilterMenu(props: {
    label: string;
    options: LintFilterOption[];
    activeValues: string[];
    summary: string;
    onToggle: (value: string) => void;
}) {
    const triggerClassName = [
        buttonStyles.buttonBase,
        buttonStyles.buttonVariants.secondary,
        buttonStyles.buttonSizes.xs,
        styles.lintFilterTrigger,
    ].join(" ");

    return (
        <Menu.Root>
            <Menu.Trigger className={triggerClassName}>
                <span className={styles.lintFilterTriggerLabel}>
                    <Filter size={14} />
                    {props.label}
                </span>
                <span className={styles.lintFilterTriggerValue}>
                    {props.summary}
                </span>
                <ChevronDown size={14} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    alignOffset={0}
                    className={styles.lintFilterMenuPositioner}
                >
                    <Menu.Popup className={styles.lintFilterMenuPopup}>
                        <div className={styles.lintFilterMenuList}>
                            {props.options.map((option) => {
                                const checked = isOptionChecked(
                                    option,
                                    props.activeValues,
                                    props.options,
                                );
                                return (
                                    <Menu.CheckboxItem
                                        key={option.value}
                                        className={styles.lintFilterMenuItem}
                                        checked={checked}
                                        onCheckedChange={() =>
                                            props.onToggle(option.value)
                                        }
                                    >
                                        <span
                                            className={
                                                styles.lintFilterMenuIndicator
                                            }
                                            aria-hidden="true"
                                        >
                                            {checked ? (
                                                <Check size={14} />
                                            ) : null}
                                        </span>
                                        <span>{option.label}</span>
                                    </Menu.CheckboxItem>
                                );
                            })}
                        </div>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

export function toggleSelection(
    current: string[],
    options: LintFilterOption[],
    value: string,
) {
    const allValues = options
        .filter((option) => option.value !== ALL_FILTER_VALUE)
        .map((option) => option.value);
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
    const uniqueCodes = Array.from(
        new Set(messages.map((issue) => issue.code).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));

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
