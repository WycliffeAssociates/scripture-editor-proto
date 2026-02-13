import { Trans, useLingui } from "@lingui/react/macro";
import { FileText, Globe, Search, UserRound, X } from "lucide-react";
import type React from "react";
import { useCallback, useId, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import * as styles from "@/app/ui/styles/modules/newProjectSearch.css.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
    fetchConsolidatedRepos,
    getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";

interface LanguageApiImporterProps {
    onDownload: (zipUrl: string) => void;
    isDownloadDisabled: boolean;
    headerActions?: React.ReactNode;
}

const LanguageApiImporter: React.FC<LanguageApiImporterProps> = (props) => {
    const { t } = useLingui();
    const searchInputId = useId();
    const [searchTerm, setSearchTerm] = useState("");
    const [fetchedRepos, setFetchedRepos] = useState<ConsolidatedRepo[] | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRepo, setSelectedRepo] = useState<ConsolidatedRepo | null>(
        null,
    );
    const [downloadingRepoId, setDownloadingRepoId] = useState<string | null>(
        null,
    );

    const hasFetched = fetchedRepos !== null;

    const handleFetch = useCallback(async () => {
        if (hasFetched) return;

        setIsLoading(true);
        setError(null);

        try {
            const repos = await fetchConsolidatedRepos();
            setFetchedRepos(repos);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to fetch repos",
            );
        } finally {
            setIsLoading(false);
        }
    }, [hasFetched]);

    const filteredRepos = useMemo(() => {
        if (!fetchedRepos || searchTerm.trim().length === 0) return [];

        const term = searchTerm.toLowerCase().trim();
        const filtered = fetchedRepos.filter(
            (repo) =>
                repo.language_ietf.toLowerCase().includes(term) ||
                repo.language_name.toLowerCase().includes(term) ||
                repo.language_english_name.toLowerCase().includes(term) ||
                repo.username.toLowerCase().includes(term) ||
                repo.repo_name.toLowerCase().includes(term) ||
                repo.title?.toLowerCase().includes(term),
        );

        return filtered.slice(0, 80);
    }, [fetchedRepos, searchTerm]);

    const hasResults = filteredRepos.length > 0;

    const downloadRepo = useCallback(
        async (repo: ConsolidatedRepo) => {
            const repoId = `${repo.username}/${repo.repo_name}`;
            try {
                setDownloadingRepoId(repoId);
                setError(null);
                setSelectedRepo(repo);
                const zipUrl = await getZipUrl(repo);
                props.onDownload(zipUrl);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to get download URL",
                );
            } finally {
                setDownloadingRepoId(null);
            }
        },
        [props],
    );

    return (
        <div
            className={styles.shell}
            data-testid={TESTING_IDS.language.apiImporter}
        >
            <div className={styles.topBar}>
                <h2 className={styles.topBarTitle}>
                    <Trans>Search Projects</Trans>
                </h2>

                <div className={styles.topBarRight}>
                    <div className={styles.searchField}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            id={searchInputId}
                            type="text"
                            value={searchTerm}
                            onFocus={() => {
                                if (
                                    !hasFetched &&
                                    searchTerm.trim().length > 0
                                ) {
                                    void handleFetch();
                                }
                            }}
                            onChange={(event) => {
                                const next = event.currentTarget.value;
                                setSearchTerm(next);
                                if (!hasFetched && next.trim().length > 0) {
                                    void handleFetch();
                                }
                            }}
                            placeholder={t`Search for projects or authors...`}
                            className={styles.searchInput}
                            disabled={props.isDownloadDisabled}
                            aria-label={t`Search projects`}
                        />

                        {searchTerm.trim().length > 0 && (
                            <button
                                type="button"
                                className={styles.clearButton}
                                onClick={() => {
                                    setSearchTerm("");
                                    setSelectedRepo(null);
                                }}
                                aria-label={t`Clear search`}
                                data-testid={TESTING_IDS.language.importerClear}
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {props.headerActions}
                </div>
            </div>

            {error && <div className={styles.errorState}>{error}</div>}

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead className={styles.thead}>
                        <tr>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <Globe size={18} />
                                    <Trans>Project</Trans>
                                </span>
                            </th>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <FileText size={18} />
                                    <Trans>Resource</Trans>
                                </span>
                            </th>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <UserRound size={18} />
                                    <Trans>Author</Trans>
                                </span>
                            </th>
                            <th className={styles.th} aria-hidden />
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>Loading...</Trans>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {!isLoading && searchTerm.trim().length === 0 && (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Search a language to see projects.
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {!isLoading &&
                            searchTerm.trim().length > 0 &&
                            hasFetched &&
                            !hasResults && (
                                <tr>
                                    <td className={styles.td} colSpan={4}>
                                        <div className={styles.emptyState}>
                                            <Trans>No matching projects</Trans>
                                        </div>
                                    </td>
                                </tr>
                            )}

                        {!isLoading &&
                            filteredRepos.map((repo) => {
                                const repoId = `${repo.username}/${repo.repo_name}`;
                                const isSelected =
                                    selectedRepo?.username === repo.username &&
                                    selectedRepo?.repo_name === repo.repo_name;
                                const isDownloading =
                                    downloadingRepoId === repoId;

                                return (
                                    <tr
                                        key={repoId}
                                        className={`${styles.tbodyRow} ${isSelected ? styles.selectedRow : ""}`}
                                        onClick={() => setSelectedRepo(repo)}
                                    >
                                        <td className={styles.td}>
                                            <span
                                                className={styles.projectCell}
                                            >
                                                {repo.language_english_name}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={styles.mutedCell}>
                                                {repo.title || repo.repo_name}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={styles.mutedCell}>
                                                {repo.username}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <button
                                                type="button"
                                                className={styles.addButton}
                                                disabled={
                                                    props.isDownloadDisabled ||
                                                    Boolean(downloadingRepoId)
                                                }
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void downloadRepo(repo);
                                                }}
                                                data-testid={
                                                    isSelected
                                                        ? TESTING_IDS.language
                                                              .importerDownload
                                                        : undefined
                                                }
                                                aria-label={t`Add project`}
                                            >
                                                <Trans>
                                                    {isDownloading
                                                        ? "Adding..."
                                                        : "Add"}
                                                </Trans>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LanguageApiImporter;
