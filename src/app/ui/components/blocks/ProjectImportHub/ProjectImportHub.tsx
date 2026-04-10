import { Trans, useLingui } from "@lingui/react/macro";
import {
    Cloud,
    FileArchive,
    FolderOpen,
    RefreshCw,
    Search,
    UserRound,
    X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ToggleGroup } from "@/app/ui/components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useGiteaApi } from "@/app/ui/hooks/useGiteaApi.ts";
import * as styles from "@/app/ui/styles/modules/projectImportHub.css.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
    fetchConsolidatedRepos,
    getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type SourceFilter = "catalog" | "cloud";

type ProjectImportHubProps = {
    onDownload: (zipUrl: string) => void;
    isDownloadDisabled: boolean;
    onDirectoryAction: () => void;
    onZipAction: () => void;
    onDirectorySelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onZipSelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    directoryInputRef?: React.RefObject<HTMLInputElement | null>;
    zipInputRef?: React.RefObject<HTMLInputElement | null>;
    hostBaseUrl: string | null;
    remoteRepoTopic?: string;
    sessionUsername: string | null;
    isImporting: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    loginUsername: string;
    loginPassword: string;
    loginOtp: string;
    error: string | null;
    projectsService: {
        listWritableRemoteRepos: (args: {
            page: number;
            pageSize: number;
            topic?: string;
            searchQuery?: string;
        }) => Promise<{
            repos: RemoteRepoSummary[];
            nextPage: number | null;
            rawResultCount: number;
        }>;
        listOwnedRemoteRepos: (args: {
            page: number;
            pageSize: number;
            topic?: string;
            searchQuery?: string;
        }) => Promise<{
            repos: RemoteRepoSummary[];
            nextPage: number | null;
            rawResultCount: number;
        }>;
    };
    onLoginUsernameChange: (value: string) => void;
    onLoginPasswordChange: (value: string) => void;
    onLoginOtpChange: (value: string) => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onCloneRepo: (repo: RemoteRepoSummary) => void;
};

type CatalogRow = {
    kind: "catalog";
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    repo: ConsolidatedRepo;
};

type CloudRow = {
    kind: "cloud";
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    repo: RemoteRepoSummary;
};

function normalize(value: string) {
    return value.toLowerCase().trim();
}

function matchesTerm(value: string | undefined, term: string) {
    if (!value) return false;
    return normalize(value).includes(term);
}

function matchesVisibleRowText(args: {
    title: string;
    subtitle: string;
    meta: string;
    term: string;
}) {
    if (args.term.length === 0) return true;
    return (
        matchesTerm(args.title, args.term) ||
        matchesTerm(args.subtitle, args.term) ||
        matchesTerm(args.meta, args.term)
    );
}

export function ProjectImportHub(props: ProjectImportHubProps) {
    const { t } = useLingui();
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("catalog");
    const [catalogRepos, setCatalogRepos] = useState<ConsolidatedRepo[] | null>(
        null,
    );
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [downloadingRepoId, setDownloadingRepoId] = useState<string | null>(
        null,
    );
    const gitea = useGiteaApi({
        sessionUsername: props.sessionUsername,
        projectsService: props.projectsService,
        topic: props.remoteRepoTopic,
    });

    const hasFetchedCatalog = catalogRepos !== null;
    const normalizedSearch = normalize(gitea.query);

    const loadCatalogRepos = useCallback(async () => {
        if (hasFetchedCatalog || catalogLoading) return;
        setCatalogLoading(true);
        setCatalogError(null);
        try {
            const repos = await fetchConsolidatedRepos();
            setCatalogRepos(repos);
        } catch (error) {
            setCatalogError(
                error instanceof Error
                    ? error.message
                    : t`Failed to fetch projects`,
            );
        } finally {
            setCatalogLoading(false);
        }
    }, [catalogLoading, hasFetchedCatalog, t]);

    useEffect(() => {
        if (sourceFilter === "cloud") return;
        if (normalizedSearch.length === 0) return;
        void loadCatalogRepos();
    }, [loadCatalogRepos, normalizedSearch.length, sourceFilter]);

    const catalogRows = useMemo<CatalogRow[]>(() => {
        if (!catalogRepos) return [];
        const rows = catalogRepos
            .filter((repo) => {
                if (normalizedSearch.length === 0) return false;
                if (gitea.scope === "owned") return false;

                const title = repo.language_english_name || repo.language_name;
                const subtitle = repo.title || repo.repo_name;
                const meta = repo.username;
                return matchesVisibleRowText({
                    title,
                    subtitle,
                    meta,
                    term: normalizedSearch,
                });
            })
            .slice(0, 80)
            .map((repo) => ({
                kind: "catalog" as const,
                id: `${repo.username}/${repo.repo_name}`,
                title: repo.language_english_name || repo.language_name,
                subtitle: repo.title || repo.repo_name,
                meta: repo.username,
                repo,
            }));
        return rows;
    }, [catalogRepos, gitea.scope, normalizedSearch]);

    const cloudRows = useMemo<CloudRow[]>(() => {
        return gitea.repos
            .filter((repo) => {
                if (sourceFilter === "catalog") return false;
                return matchesVisibleRowText({
                    title: repo.name,
                    subtitle: repo.owner,
                    meta: repo.defaultBranch,
                    term: normalizedSearch,
                });
            })
            .map((repo) => ({
                kind: "cloud" as const,
                id: String(repo.id),
                title: repo.name,
                subtitle: repo.owner,
                meta: repo.defaultBranch,
                repo,
            }));
    }, [gitea.repos, normalizedSearch, sourceFilter]);

    const rows = useMemo(() => {
        return sourceFilter === "cloud" ? cloudRows : catalogRows;
    }, [catalogRows, cloudRows, sourceFilter]);

    const downloadCatalogRepo = useCallback(
        async (repo: ConsolidatedRepo) => {
            const repoId = `${repo.username}/${repo.repo_name}`;
            try {
                setDownloadingRepoId(repoId);
                const zipUrl = await getZipUrl(repo);
                props.onDownload(zipUrl);
            } catch (error) {
                setCatalogError(
                    error instanceof Error
                        ? error.message
                        : t`Failed to prepare download`,
                );
            } finally {
                setDownloadingRepoId(null);
            }
        },
        [props, t],
    );

    const sourceItems = [
        { value: "catalog", label: t`Download only` },
        { value: "cloud", label: t`Linked cloud` },
    ];

    const showCloudLogin = sourceFilter === "cloud" && !props.sessionUsername;

    return (
        <section className={styles.shell}>
            <header className={styles.header}>
                <div className={styles.headerCopy}>
                    <h2 className={styles.title}>
                        <Trans>Choose a source</Trans>
                    </h2>
                    <p className={styles.description}>
                        <Trans>
                            Import a linked cloud project, download an unlinked
                            copy, or import a local folder or ZIP.
                        </Trans>
                    </p>
                    <p className={styles.sourceHint}>
                        <Trans>
                            Linked cloud projects import with their Gitea
                            connection so changes can sync back. Download-only
                            projects copy files onto this device and start
                            unlinked.
                        </Trans>
                    </p>
                    <p className={styles.sourceHint}>
                        <Trans>
                            Some projects may appear in both lists. Linked cloud
                            keeps the Gitea connection. Download only imports a
                            separate local copy.
                        </Trans>
                    </p>
                    <div className={styles.steps}>
                        <span className={styles.step}>
                            <span className={styles.stepIndex}>1</span>
                            <Trans>Pick a source</Trans>
                        </span>
                        <span className={styles.step}>
                            <span className={styles.stepIndex}>2</span>
                            <Trans>Search or log in</Trans>
                        </span>
                        <span className={styles.step}>
                            <span className={styles.stepIndex}>3</span>
                            <Trans>Add it</Trans>
                        </span>
                    </div>
                </div>

                <div className={styles.headerControls}>
                    <ToggleGroup
                        items={sourceItems}
                        value={sourceFilter}
                        onValueChange={(value) =>
                            setSourceFilter(value as SourceFilter)
                        }
                        className={styles.sourceToggle}
                    />
                    <div className={styles.actionButtons}>
                        <Button
                            variant="secondary"
                            leftIcon={<FolderOpen size={16} />}
                            onClick={props.onDirectoryAction}
                            disabled={props.isImporting}
                        >
                            <Trans>Folder</Trans>
                        </Button>
                        <Button
                            variant="secondary"
                            leftIcon={<FileArchive size={16} />}
                            onClick={props.onZipAction}
                            disabled={props.isImporting}
                        >
                            <Trans>ZIP</Trans>
                        </Button>
                    </div>
                </div>
            </header>

            {props.onDirectorySelected ? (
                <input
                    data-testid={TESTING_IDS.import.dirImporter}
                    ref={props.directoryInputRef}
                    type="file"
                    webkitdirectory="true"
                    multiple
                    className={styles.hiddenInput}
                    onChange={props.onDirectorySelected}
                    disabled={props.isImporting}
                />
            ) : null}

            {props.onZipSelected ? (
                <input
                    data-testid={TESTING_IDS.import.importer}
                    ref={props.zipInputRef}
                    type="file"
                    accept=".zip"
                    className={styles.hiddenInput}
                    onChange={props.onZipSelected}
                    disabled={props.isImporting}
                />
            ) : null}

            <div className={styles.toolbar}>
                <div className={styles.searchField}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        type="text"
                        value={gitea.query}
                        onFocus={() => {
                            if (sourceFilter !== "cloud") {
                                void loadCatalogRepos();
                            }
                        }}
                        onChange={(event) => {
                            const next = event.currentTarget.value;
                            gitea.setQuery(next);
                            if (
                                sourceFilter !== "cloud" &&
                                next.trim().length > 0
                            ) {
                                void loadCatalogRepos();
                            }
                        }}
                        placeholder={t`Search language, title, owner, or repo name...`}
                        className={styles.searchInput}
                        disabled={props.isDownloadDisabled || props.isImporting}
                        aria-label={t`Search projects`}
                    />
                    {gitea.query.trim().length > 0 ? (
                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={() => gitea.setQuery("")}
                            aria-label={t`Clear search`}
                        >
                            <X size={18} />
                        </button>
                    ) : null}
                </div>

                <div className={styles.toolbarActions}>
                    {props.sessionUsername ? (
                        <>
                            <label className={styles.checkboxPill}>
                                <input
                                    type="checkbox"
                                    checked={gitea.scope === "owned"}
                                    onChange={(event) =>
                                        gitea.setScope(
                                            event.currentTarget.checked
                                                ? "owned"
                                                : "all",
                                        )
                                    }
                                    className={styles.checkbox}
                                />
                                <span>
                                    <Trans>Only mine</Trans>
                                </span>
                            </label>
                            <Button
                                variant="secondary"
                                leftIcon={<RefreshCw size={16} />}
                                onClick={() => {
                                    void gitea.refresh();
                                }}
                                disabled={
                                    gitea.isLoading ||
                                    props.isImporting ||
                                    props.isDisconnecting
                                }
                            >
                                <Trans>Refresh</Trans>
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={props.onDisconnect}
                                disabled={
                                    gitea.isLoading ||
                                    props.isImporting ||
                                    props.isDisconnecting
                                }
                            >
                                <Trans>
                                    {props.isDisconnecting
                                        ? "Logging out..."
                                        : "Log out"}
                                </Trans>
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            {props.error ? (
                <div className={styles.errorState}>{props.error}</div>
            ) : null}
            {gitea.error ? (
                <div className={styles.errorState}>{gitea.error}</div>
            ) : null}
            {catalogError ? (
                <div className={styles.errorState}>{catalogError}</div>
            ) : null}

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead className={styles.thead}>
                        <tr>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <Cloud size={18} />
                                    <Trans>Project</Trans>
                                </span>
                            </th>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <Trans>Details</Trans>
                                </span>
                            </th>
                            <th className={styles.th} aria-hidden />
                        </tr>
                    </thead>
                    <tbody className={styles.tbody}>
                        {showCloudLogin ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.loginPanel}>
                                        <p className={styles.loginCopy}>
                                            {props.hostBaseUrl ? (
                                                <Trans>
                                                    Connect to{" "}
                                                    {props.hostBaseUrl}
                                                    to browse remote projects
                                                    you can push and pull.
                                                </Trans>
                                            ) : (
                                                <Trans>
                                                    Remote login is not
                                                    configured for this build
                                                    yet.
                                                </Trans>
                                            )}
                                        </p>
                                        {props.hostBaseUrl ? (
                                            <div className={styles.loginGrid}>
                                                <label
                                                    className={
                                                        styles.loginField
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            styles.loginLabel
                                                        }
                                                    >
                                                        <Trans>Username</Trans>
                                                    </span>
                                                    <input
                                                        type="text"
                                                        aria-label="Remote username"
                                                        value={
                                                            props.loginUsername
                                                        }
                                                        onInput={(event) =>
                                                            props.onLoginUsernameChange(
                                                                (
                                                                    event.target as HTMLInputElement
                                                                ).value,
                                                            )
                                                        }
                                                        className={
                                                            styles.loginInput
                                                        }
                                                    />
                                                </label>
                                                <label
                                                    className={
                                                        styles.loginField
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            styles.loginLabel
                                                        }
                                                    >
                                                        <Trans>Password</Trans>
                                                    </span>
                                                    <input
                                                        type="password"
                                                        aria-label="Remote password"
                                                        value={
                                                            props.loginPassword
                                                        }
                                                        onInput={(event) =>
                                                            props.onLoginPasswordChange(
                                                                (
                                                                    event.target as HTMLInputElement
                                                                ).value,
                                                            )
                                                        }
                                                        className={
                                                            styles.loginInput
                                                        }
                                                    />
                                                </label>
                                                <label
                                                    className={
                                                        styles.loginField
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            styles.loginLabel
                                                        }
                                                    >
                                                        <Trans>
                                                            One-time code
                                                        </Trans>
                                                    </span>
                                                    <input
                                                        type="text"
                                                        aria-label="Remote one-time code"
                                                        value={props.loginOtp}
                                                        onInput={(event) =>
                                                            props.onLoginOtpChange(
                                                                (
                                                                    event.target as HTMLInputElement
                                                                ).value,
                                                            )
                                                        }
                                                        className={
                                                            styles.loginInput
                                                        }
                                                    />
                                                </label>
                                                <div
                                                    className={
                                                        styles.loginActions
                                                    }
                                                >
                                                    <Button
                                                        variant="primary"
                                                        onClick={
                                                            props.onConnect
                                                        }
                                                        disabled={
                                                            props.isConnecting
                                                        }
                                                        leftIcon={
                                                            <UserRound
                                                                size={16}
                                                            />
                                                        }
                                                    >
                                                        <Trans>
                                                            {props.isConnecting
                                                                ? "Connecting..."
                                                                : "Connect account"}
                                                        </Trans>
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </td>
                            </tr>
                        ) : catalogLoading &&
                          sourceFilter !== "cloud" &&
                          !hasFetchedCatalog ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Loading downloadable projects...
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : sourceFilter === "cloud" &&
                          gitea.isLowSignalSearch &&
                          rows.length === 0 ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Please enter a more specific search
                                            term.
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : sourceFilter === "cloud" &&
                          gitea.hasOnlyIncompatibleResults &&
                          rows.length === 0 ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        <div>
                                            <Trans>
                                                No linked cloud projects matched
                                                this search.
                                            </Trans>
                                        </div>
                                        <div>
                                            <Trans>
                                                Your search returned results,
                                                but none were cloud projects for
                                                this app. Try a more specific
                                                search term.
                                            </Trans>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : sourceFilter === "cloud" &&
                          rows.length === 0 &&
                          gitea.query.trim().length < gitea.minSearchLength ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        {gitea.query.trim().length > 0 ? (
                                            <Trans>
                                                Type at least{" "}
                                                {gitea.minSearchLength}{" "}
                                                characters to search linked
                                                cloud projects.
                                            </Trans>
                                        ) : (
                                            <Trans>
                                                Type at least{" "}
                                                {gitea.minSearchLength}{" "}
                                                characters to search linked
                                                cloud projects.
                                            </Trans>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : sourceFilter === "cloud" &&
                          (gitea.isInitialLoading ||
                              (gitea.isSearchMode &&
                                  gitea.isLoading &&
                                  rows.length === 0)) ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        {gitea.isSearchMode ? (
                                            <Trans>
                                                Searching linked cloud
                                                projects...
                                            </Trans>
                                        ) : (
                                            <Trans>
                                                Loading remote projects...
                                            </Trans>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td className={styles.td} colSpan={3}>
                                    <div className={styles.emptyState}>
                                        {sourceFilter === "cloud" ? (
                                            props.sessionUsername ? (
                                                gitea.isLowSignalSearch ? (
                                                    <Trans>
                                                        Please enter a more
                                                        specific search term.
                                                    </Trans>
                                                ) : gitea.hasOnlyIncompatibleResults ? (
                                                    <>
                                                        <div>
                                                            <Trans>
                                                                No linked cloud
                                                                projects matched
                                                                this search.
                                                            </Trans>
                                                        </div>
                                                        <div>
                                                            <Trans>
                                                                Your search
                                                                returned
                                                                results, but
                                                                none were cloud
                                                                projects for
                                                                this app. Try a
                                                                more specific
                                                                search term.
                                                            </Trans>
                                                        </div>
                                                    </>
                                                ) : gitea.query.trim().length >=
                                                  gitea.minSearchLength ? (
                                                    <Trans>
                                                        No linked cloud projects
                                                        matched this search.
                                                    </Trans>
                                                ) : gitea.query.trim().length <
                                                  gitea.minSearchLength ? (
                                                    <Trans>
                                                        Type at least{" "}
                                                        {gitea.minSearchLength}{" "}
                                                        characters to search
                                                        linked cloud projects.
                                                    </Trans>
                                                ) : gitea.scope === "owned" ? (
                                                    <Trans>
                                                        No repos you own are
                                                        visible in this list
                                                        yet.
                                                    </Trans>
                                                ) : (
                                                    <Trans>
                                                        No remote projects are
                                                        available for this
                                                        account yet.
                                                    </Trans>
                                                )
                                            ) : (
                                                <Trans>
                                                    Select a source to continue.
                                                </Trans>
                                            )
                                        ) : normalizedSearch.length > 0 ? (
                                            <Trans>No matching projects</Trans>
                                        ) : (
                                            <Trans>
                                                Search a language, title, owner,
                                                or repo name to see projects.
                                            </Trans>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.id} className={styles.tbodyRow}>
                                    <td className={styles.td}>
                                        <span className={styles.projectCell}>
                                            {row.title}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.mutedCell}>
                                            {row.subtitle}
                                            {" · "}
                                            {row.meta}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <Button
                                            variant="tertiary"
                                            onClick={() => {
                                                if (row.kind === "catalog") {
                                                    void downloadCatalogRepo(
                                                        row.repo,
                                                    );
                                                } else {
                                                    props.onCloneRepo(row.repo);
                                                }
                                            }}
                                            disabled={
                                                props.isImporting ||
                                                gitea.isLoading ||
                                                downloadingRepoId === row.id ||
                                                (row.kind === "catalog"
                                                    ? props.isDownloadDisabled
                                                    : false)
                                            }
                                        >
                                            {row.kind === "catalog" ? (
                                                downloadingRepoId === row.id ? (
                                                    <Trans>Preparing...</Trans>
                                                ) : (
                                                    <Trans>
                                                        Download local copy
                                                    </Trans>
                                                )
                                            ) : (
                                                <Trans>
                                                    Import linked copy
                                                </Trans>
                                            )}
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {sourceFilter === "cloud" && gitea.isBackgroundFetching ? (
                <div className={styles.footerActions}>
                    <span className={styles.sourceHint}>
                        {gitea.isFetchingMore ? (
                            <Trans>Loading more linked cloud projects...</Trans>
                        ) : gitea.isSearchMode ? (
                            <Trans>Searching linked cloud projects...</Trans>
                        ) : (
                            <Trans>Refreshing linked cloud projects...</Trans>
                        )}
                    </span>
                </div>
            ) : null}

            {props.sessionUsername &&
            sourceFilter !== "catalog" &&
            gitea.hasNextPage ? (
                <div className={styles.footerActions}>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            void gitea.loadMore();
                        }}
                        disabled={
                            gitea.isLoading ||
                            props.isImporting ||
                            props.isDisconnecting
                        }
                    >
                        <Trans>Load more</Trans>
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
