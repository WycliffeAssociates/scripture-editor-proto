import { useLingui } from "@lingui/react/macro";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

interface SearchResultItemProps {
    result: SearchResult;
    isActive: boolean;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
    onPick: () => void;
    sourceProjectName?: string;
    currentProjectName?: string;
    targetResult?: SearchResult;
    canReplace?: boolean;
    defaultReplaceTerm?: string;
    onReplace?: (replacement: string) => Promise<void> | void;
}

export function SearchResultItem(props: SearchResultItemProps) {
    const {
        result,
        isActive,
        searchTerm,
        onPick,
        sourceProjectName,
        currentProjectName,
        targetResult,
        canReplace = false,
        defaultReplaceTerm = "",
        onReplace,
    } = props;
    const { t } = useLingui();
    const [replacement, setReplacement] = useState(defaultReplaceTerm);
    const [hasCustomReplacement, setHasCustomReplacement] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const locationLabel = formatResultLocationLabel(result, t);
    const isGrouped = Boolean(sourceProjectName && currentProjectName);

    useEffect(() => {
        if (hasCustomReplacement) return;
        setReplacement(defaultReplaceTerm);
    }, [defaultReplaceTerm, hasCustomReplacement]);

    return (
        <div
            className={`${styles.searchResultItem} ${isActive ? styles.searchResultItemActive : ""}`}
            data-testid={TESTING_IDS.searchResultItem}
            data-search-sid={result.sid}
            data-search-book={result.bibleIdentifier}
            data-search-chapter={String(result.chapNum)}
        >
            <div className={styles.searchResultHeader}>
                <span className={styles.searchResultLocation}>
                    {locationLabel}
                </span>
                <button
                    type="button"
                    className={styles.searchResultNavigate}
                    onClick={onPick}
                    aria-label={t`Navigate to ${locationLabel}`}
                    title={t`Navigate to ${locationLabel}`}
                >
                    <ArrowRight size={14} />
                </button>
            </div>

            {/** biome-ignore lint/a11y/noStaticElementInteractions: <todo fix> */}
            <div
                className={styles.searchResultPreview}
                onClick={onPick}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        onPick();
                    }
                }}
            >
                {isGrouped ? (
                    <div
                        className={styles.searchResultPair}
                        data-search-row-type="grouped"
                    >
                        <div className={styles.searchResultPairBlock}>
                            <span
                                className={styles.searchResultProjectLabel}
                                data-project-label="source"
                            >
                                {sourceProjectName}
                            </span>
                            <div className={styles.searchResultPairText}>
                                {renderSearchPreview(
                                    result.text,
                                    searchTerm,
                                    "",
                                    props.matchCase,
                                    props.matchWholeWord,
                                )}
                            </div>
                        </div>
                        <div className={styles.searchResultPairBlock}>
                            <span
                                className={styles.searchResultProjectLabel}
                                data-project-label="target"
                            >
                                {currentProjectName}
                            </span>
                            <div className={styles.searchResultPairText}>
                                {renderSearchPreview(
                                    targetResult?.text ?? "",
                                    searchTerm,
                                    replacement,
                                    props.matchCase,
                                    props.matchWholeWord,
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <span data-search-row-type="single">
                        {renderSearchPreview(
                            result.text,
                            searchTerm,
                            replacement,
                            props.matchCase,
                            props.matchWholeWord,
                        )}
                    </span>
                )}
            </div>

            {canReplace ? (
                <form
                    className={styles.searchResultReplace}
                    onSubmit={async (event) => {
                        event.preventDefault();
                        if (!replacement.trim() || !onReplace) return;
                        setIsReplacing(true);
                        try {
                            await onReplace(replacement);
                            setReplacement("");
                        } finally {
                            setIsReplacing(false);
                        }
                    }}
                >
                    <input
                        type="text"
                        className={styles.searchResultReplaceInput}
                        value={replacement}
                        onChange={(event) => {
                            setReplacement(event.currentTarget.value);
                            setHasCustomReplacement(true);
                        }}
                        placeholder={t`Replace this result`}
                        disabled={isReplacing}
                    />
                    <button
                        type="submit"
                        className={styles.searchResultReplaceButton}
                        disabled={isReplacing || !replacement.trim()}
                    >
                        {t`Replace`}
                    </button>
                </form>
            ) : null}
        </div>
    );
}

function formatResultLocationLabel(
    result: SearchResult,
    t: ReturnType<typeof useLingui>["t"],
) {
    if (result.chapNum === 0) {
        return t`Introduction`;
    }

    const parsed = result.parsedSid;
    if (!parsed) {
        return result.sid;
    }

    if (parsed.isBookChapOnly) {
        return `${parsed.book} ${parsed.chapter}`;
    }

    if (parsed.verseStart !== parsed.verseEnd) {
        return `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`;
    }

    return `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;
}

function renderSearchPreview(
    text: string,
    searchTerm: string,
    replacement: string,
    matchCase: boolean,
    matchWholeWord: boolean,
): React.ReactNode {
    if (!searchTerm) return text;

    const flags = matchCase ? "g" : "gi";
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = matchWholeWord
        ? `\\b(${escapedTerm})\\b`
        : `(${escapedTerm})`;
    const regex = new RegExp(pattern, flags);
    const parts = text.split(regex);

    return parts.map((part, index) => {
        const isMatch = matchCase
            ? part === searchTerm
            : part.toLowerCase() === searchTerm.toLowerCase();

        if (isMatch) {
            if (replacement.trim()) {
                return (
                    <span
                        key={`${index}-${part}`}
                        className={styles.searchReplacementPreview}
                    >
                        <span className={styles.searchReplacementOld}>
                            {part}
                        </span>
                        <span className={styles.searchReplacementNew}>
                            {replacement}
                        </span>
                    </span>
                );
            }
            return (
                <mark
                    key={`${index}-${part}`}
                    className={styles.searchHighlight}
                >
                    {part}
                </mark>
            );
        }
        return part;
    });
}
