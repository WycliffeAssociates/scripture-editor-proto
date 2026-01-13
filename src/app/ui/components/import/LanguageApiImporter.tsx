import { Trans, useLingui } from "@lingui/react/macro";
import { useDebouncedValue } from "@mantine/hooks";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    type AutocompleteGroup,
    AutocompleteInput,
    type AutocompleteItem,
} from "@/app/ui/components/import/AutoCompleteInput.tsx";
import * as styles from "@/app/ui/styles/modules/projectCreate.css.ts";
import {
    type ConsolidatedRepo,
    fetchConsolidatedRepos,
    formatRepoDisplay,
    getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";

interface LanguageApiImporterProps {
    onDownload: (zipUrl: string) => void;
    isDownloadDisabled: boolean;
}

interface AutocompleteRepoItem extends AutocompleteItem {
    repo: ConsolidatedRepo;
}

const LanguageApiImporter: React.FC<LanguageApiImporterProps> = (props) => {
    const { t } = useLingui();
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm] = useDebouncedValue(searchTerm, 300);
    const [fetchedRepos, setFetchedRepos] = useState<ConsolidatedRepo[] | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRepo, setSelectedRepo] = useState<ConsolidatedRepo | null>(
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

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchTerm(value);
            if (!hasFetched && value.length > 0) {
                handleFetch();
            }
        },
        [hasFetched, handleFetch],
    );

    const filteredResults = useMemo<AutocompleteGroup[]>(() => {
        if (!fetchedRepos) return [];

        const term = debouncedSearchTerm.toLowerCase();
        const filtered = fetchedRepos.filter(
            (repo) =>
                repo.language_ietf.toLowerCase().includes(term) ||
                repo.language_name.toLowerCase().includes(term) ||
                repo.language_english_name.toLowerCase().includes(term),
        );

        // Group by language_english_name
        const groups: Record<string, ConsolidatedRepo[]> = {};
        for (const repo of filtered) {
            const lang = repo.language_english_name;
            if (!groups[lang]) groups[lang] = [];
            groups[lang].push(repo);
        }

        return Object.entries(groups).map(([group, repos]) => ({
            group,
            items: repos.map((repo) => ({
                id: `${repo.username}/${repo.repo_name}`,
                name: formatRepoDisplay(repo, repos),
                repo,
            })),
        }));
    }, [fetchedRepos, debouncedSearchTerm]);

    const handleSelect = useCallback((item: AutocompleteItem | null) => {
        if (!item) {
            setSelectedRepo(null);
            setSearchTerm("");
            return;
        }
        const repoItem = item as AutocompleteRepoItem;
        setSelectedRepo(repoItem.repo);
        setSearchTerm(repoItem.name);
    }, []);

    const selectedItem = useMemo<AutocompleteRepoItem | null>(() => {
        if (!selectedRepo || !fetchedRepos) return null;
        return {
            id: `${selectedRepo.username}/${selectedRepo.repo_name}`,
            name: formatRepoDisplay(selectedRepo, fetchedRepos),
            repo: selectedRepo,
        };
    }, [selectedRepo, fetchedRepos]);

    const handleDownload = useCallback(async () => {
        if (!selectedRepo) return;

        try {
            const zipUrl = await getZipUrl(selectedRepo);
            props.onDownload(zipUrl);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to get download URL",
            );
        }
    }, [selectedRepo, props]);

    return (
        <div data-testid={TESTING_IDS.language.apiImporter}>
            <AutocompleteInput
                label={t`Search by language`}
                placeholder={t`Type to search for a language...`}
                searchTerm={searchTerm}
                setSearchTerm={handleSearchChange}
                results={filteredResults}
                onSelect={handleSelect}
                selectedItem={selectedItem}
                showAvatar={false}
                isLoading={isLoading}
                isError={!!error}
                errorMessage={error || undefined}
                showOnFocus={true}
                isDisabled={props.isDownloadDisabled}
            />

            <button
                type="button"
                data-testid={TESTING_IDS.language.importerDownload}
                onClick={handleDownload}
                disabled={props.isDownloadDisabled || !selectedRepo}
                className={styles.downloadButton}
            >
                <Trans>Download repository</Trans>
            </button>
        </div>
    );
};

export default LanguageApiImporter;
