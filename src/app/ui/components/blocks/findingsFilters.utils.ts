import type { FlatFinding } from "@/app/state/findingsSelectors.ts";
import { localizeFindingCodeLabel } from "@/app/ui/i18n/findingCodeLabels.ts";
import { sortListByBookCanonical } from "@/core/data/bible/bible.ts";

const ALL_FILTER_VALUE = "all";

export type FindingsFilterOption = { value: string; label: string };

export type FindingsFilterLabels = {
  all: string;
  none: string;
};

export function isOptionChecked(
  option: FindingsFilterOption,
  activeValues: string[],
  options: FindingsFilterOption[],
): boolean {
  if (option.value === ALL_FILTER_VALUE) {
    return activeValues.length === options.length - 1;
  }
  return activeValues.includes(option.value);
}

export function toggleSelection(
  current: string[],
  options: FindingsFilterOption[],
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
  options: FindingsFilterOption[],
  labels: FindingsFilterLabels,
) {
  const allCount = options.length - 1;
  if (selected.length === allCount) return labels.all;
  if (selected.length === 0) return labels.none;
  return `${selected.length}`;
}

export function buildFindingCodeOptions(
  entries: FlatFinding[],
  labels: FindingsFilterLabels,
): FindingsFilterOption[] {
  const codeSet = new Set<string>();
  for (const entry of entries) {
    if (entry.finding.code) codeSet.add(entry.finding.code);
  }
  const uniqueCodes = Array.from(codeSet).sort((left, right) =>
    left.localeCompare(right),
  );

  return [
    { value: ALL_FILTER_VALUE, label: labels.all },
    ...uniqueCodes.map((code) => ({
      value: code,
      label: localizeFindingCodeLabel(code),
    })),
  ];
}

export function buildFindingBookOptions(
  entries: FlatFinding[],
  localizeBook: (input: { bookCode: string }) => string,
  labels: FindingsFilterLabels,
): FindingsFilterOption[] {
  // Book comes from the store address (the commit's authoritative scope),
  // not from re-parsing sids.
  const uniqueBooks = Array.from(
    new Set(entries.map((entry) => entry.bookCode)),
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
