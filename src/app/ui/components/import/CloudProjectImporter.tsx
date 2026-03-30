import { Trans } from "@lingui/react/macro";
import { Cloud, RefreshCw, UserRound } from "lucide-react";
import * as styles from "@/app/ui/styles/modules/newProjectSearch.css.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type CloudProjectImporterProps = {
    sessionUsername: string | null;
    repos: RemoteRepoSummary[];
    isLoading: boolean;
    isImporting: boolean;
    error: string | null;
    hasLoaded: boolean;
    hasNextPage: boolean;
    onRefresh: () => void;
    onLoadMore: () => void;
    onCloneRepo: (repo: RemoteRepoSummary) => void;
};

/**
 * Session-aware cloud project picker on the create route.
 *
 * This is the UI surface for cloning writable cloud repos into managed storage.
 * It stays presentation-only: session lookup, paging, and clone orchestration
 * live in the route above.
 */
export function CloudProjectImporter(props: CloudProjectImporterProps) {
    return (
        <div className={styles.shell}>
            <div className={styles.topBar}>
                <div>
                    <h2 className={styles.topBarTitle}>
                        <Trans>From my cloud projects</Trans>
                    </h2>
                    <div className={styles.sectionSubtext}>
                        {props.sessionUsername ? (
                            <>
                                <UserRound size={16} />
                                <Trans>
                                    Connected as {props.sessionUsername}
                                </Trans>
                            </>
                        ) : (
                            <Trans>
                                No cloud account is connected on this device
                                yet.
                            </Trans>
                        )}
                    </div>
                </div>

                {props.sessionUsername ? (
                    <div className={styles.inlineActions}>
                        <button
                            type="button"
                            className={styles.topActionButton}
                            onClick={props.onRefresh}
                            disabled={props.isLoading || props.isImporting}
                        >
                            <RefreshCw size={18} />
                            <Trans>Refresh</Trans>
                        </button>
                    </div>
                ) : null}
            </div>

            {props.error ? (
                <div className={styles.errorState}>{props.error}</div>
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
                                    <Trans>Owner</Trans>
                                </span>
                            </th>
                            <th className={`${styles.th} ${styles.thDivider}`}>
                                <span className={styles.thInner}>
                                    <Trans>Branch</Trans>
                                </span>
                            </th>
                            <th className={styles.th} aria-hidden />
                        </tr>
                    </thead>

                    <tbody>
                        {!props.sessionUsername ? (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            Connect an account to import
                                            projects from the cloud.
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : props.isLoading && !props.hasLoaded ? (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>Loading cloud projects...</Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : props.repos.length === 0 ? (
                            <tr>
                                <td className={styles.td} colSpan={4}>
                                    <div className={styles.emptyState}>
                                        <Trans>
                                            No cloud projects are available for
                                            this account yet.
                                        </Trans>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            props.repos.map((repo) => (
                                <tr key={repo.id} className={styles.tbodyRow}>
                                    <td className={styles.td}>
                                        <span className={styles.projectCell}>
                                            {repo.name}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.mutedCell}>
                                            {repo.owner}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.mutedCell}>
                                            {repo.defaultBranch}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <button
                                            type="button"
                                            className={styles.addButton}
                                            onClick={() =>
                                                props.onCloneRepo(repo)
                                            }
                                            disabled={
                                                props.isImporting ||
                                                props.isLoading
                                            }
                                        >
                                            <Trans>Add</Trans>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {props.sessionUsername && props.hasNextPage ? (
                <div className={styles.footerActions}>
                    <button
                        type="button"
                        className={styles.topActionButton}
                        onClick={props.onLoadMore}
                        disabled={props.isLoading || props.isImporting}
                    >
                        <Trans>Load more</Trans>
                    </button>
                </div>
            ) : null}
        </div>
    );
}
