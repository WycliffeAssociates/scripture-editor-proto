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
import * as styles from "@/app/ui/styles/modules/projectImportHub.css.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
    fetchConsolidatedRepos,
    getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type SourceFilter = "all" | "catalog" | "cloud";

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
    sessionUsername: string | null;
    repos: RemoteRepoSummary[];
    isLoadingCloudRepos: boolean;
    isImporting: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    isOwnedOnly: boolean;
    loginUsername: string;
    loginPassword: string;
    loginOtp: string;
    error: string | null;
    hasLoadedCloudRepos: boolean;
    hasNextPage: boolean;
    onLoginUsernameChange: (value: string) => void;
    onLoginPasswordChange: (value: string) => void;
    onLoginOtpChange: (value: string) => void;
    onConnect: () => void;
    onRefresh: () => void;
    onDisconnect: () => void;
    onLoadMore: () => void;
    onOwnedOnlyChange: (value: boolean) => void;
    onCloneRepo: (repo: RemoteRepoSummary) => void;
};

type CatalogRow = {
    kind: "catalog";
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    sourceLabel: string;
    repo: ConsolidatedRepo;
};

type CloudRow = {
    kind: "cloud";
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    sourceLabel: string;
    repo: RemoteRepoSummary;
};

function normalize(value: string) {
    return value.toLowerCase().trim();
}

function matchesTerm(value: string | undefined, term: string) {
    if (!value) return false;
    return normalize(value).includes(term);
}

export function ProjectImportHub(props: ProjectImportHubProps) {
    const { t } = useLingui();
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [catalogRepos, setCatalogRepos] = useState<ConsolidatedRepo[] | null>(
        null,
    );
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [downloadingRepoId, setDownloadingRepoId] = useState<string | null>(
        null,
    );

    const hasFetchedCatalog = catalogRepos !== null;
    const normalizedSearch = normalize(searchTerm);

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
                return (
                    matchesTerm(repo.language_ietf, normalizedSearch) ||
                    matchesTerm(repo.language_name, normalizedSearch) ||
                    matchesTerm(repo.language_english_name, normalizedSearch) ||
                    matchesTerm(repo.username, normalizedSearch) ||
                    matchesTerm(repo.repo_name, normalizedSearch) ||
                    matchesTerm(repo.title ?? undefined, normalizedSearch)
                );
            })
            .slice(0, 80)
            .map((repo) => ({
                kind: "catalog" as const,
                id: `${repo.username}/${repo.repo_name}`,
                title: repo.language_english_name || repo.language_name,
                subtitle: repo.title || repo.repo_name,
                meta: repo.username,
                sourceLabel: t`Downloadable`,
                repo,
            }));
        return rows;
    }, [catalogRepos, normalizedSearch, t]);

    const cloudRows = useMemo<CloudRow[]>(() => {
        return props.repos
            .filter((repo) => {
                if (sourceFilter === "catalog") return false;
                if (normalizedSearch.length === 0) return true;
                return (
                    matchesTerm(repo.name, normalizedSearch) ||
                    matchesTerm(repo.owner, normalizedSearch) ||
                    matchesTerm(repo.defaultBranch, normalizedSearch)
                );
            })
            .map((repo) => ({
                kind: "cloud" as const,
                id: String(repo.id),
                title: repo.name,
                subtitle: repo.owner,
                meta: repo.defaultBranch,
                sourceLabel: props.isOwnedOnly ? t`Mine` : t`Remote`,
                repo,
            }));
    }, [normalizedSearch, props.isOwnedOnly, props.repos, sourceFilter, t]);

    const rows = useMemo(() => {
        if (sourceFilter === "catalog") {
            return catalogRows;
        }
        if (sourceFilter === "cloud") {
            return cloudRows;
        }
        return [...catalogRows, ...cloudRows];
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
        { value: "all", label: t`All projects` },
        { value: "catalog", label: t`Downloadable` },
        { value: "cloud", label: t`Remote` },
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
                            Download a copy, connect to a remote project you can
                            push and pull, or import a local folder or ZIP.
                        </Trans>
                    </p>
                    <p className={styles.sourceHint}>
                        <Trans>
                            Downloadable projects get copied onto your disk.
                            Remote projects stay linked to Gitea so changes can
                            sync back when you have access. Only mine shows the
                            repos owned by your Gitea account.
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
                        value={searchTerm}
                        onFocus={() => {
                            if (sourceFilter !== "cloud") {
                                void loadCatalogRepos();
                            }
                        }}
                        onChange={(event) => {
                            const next = event.currentTarget.value;
                            setSearchTerm(next);
                            if (next.trim().length > 0) {
                                void loadCatalogRepos();
                            }
                        }}
                        placeholder={t`Search language, title, owner, or repo name...`}
                        className={styles.searchInput}
                        disabled={props.isDownloadDisabled || props.isImporting}
                        aria-label={t`Search projects`}
                    />
                    {searchTerm.trim().length > 0 ? (
                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={() => setSearchTerm("")}
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
                                    checked={props.isOwnedOnly}
                                    onChange={(event) =>
                                        props.onOwnedOnlyChange(
                                            event.currentTarget.checked,
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
                                onClick={props.onRefresh}
                                disabled={
                                    props.isLoadingCloudRepos ||
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
                                    props.isLoadingCloudRepos ||
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
                                    <UserRound size={18} />
                                    <Trans>Where it lives</Trans>
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
                                <td className={styles.td} colSpan={4}>
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
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Loading downloadable projects...
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : sourceFilter === "cloud" &&
                          props.isLoadingCloudRepos &&
                          !props.hasLoadedCloudRepos ? (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Loading remote projects...
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        {sourceFilter === "cloud" ? (
                                            props.sessionUsername ? (
                                                props.isOwnedOnly ? (
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
                                        <span className={styles.sourceBadge}>
                                            {row.sourceLabel}
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
                                                props.isLoadingCloudRepos ||
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
                                                    <Trans>Copy to disk</Trans>
                                                )
                                            ) : (
                                                <Trans>Get copy</Trans>
                                            )}
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {props.sessionUsername && props.hasNextPage ? (
                <div className={styles.footerActions}>
                    <Button
                        variant="secondary"
                        onClick={props.onLoadMore}
                        disabled={
                            props.isLoadingCloudRepos ||
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
