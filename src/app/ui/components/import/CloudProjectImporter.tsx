import { Trans } from "@lingui/react/macro";
import { Cloud, RefreshCw, UserRound } from "lucide-react";
import { useId } from "react";

import * as styles from "@/app/ui/styles/modules/newProjectSearch.css.ts";
import type { RemoteRepoSummary } from "@/core/persistence/RemoteRepoProvider.ts";

type CloudProjectImporterProps = {
  hostBaseUrl: string | null;
  sessionUsername: string | null;
  repos: RemoteRepoSummary[];
  isLoading: boolean;
  isImporting: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isOwnedOnly: boolean;
  loginUsername: string;
  loginPassword: string;
  loginOtp: string;
  error: string | null;
  hasLoaded: boolean;
  hasNextPage: boolean;
  onLoginUsernameChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onLoadMore: () => void;
  onOwnedOnlyChange: (value: boolean) => void;
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
  const ownedOnlyId = useId();

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
                <Trans>Connected as {props.sessionUsername}</Trans>
              </>
            ) : props.hostBaseUrl ? (
              <Trans>Connect to {props.hostBaseUrl}</Trans>
            ) : (
              <Trans>Cloud login is not configured for this build yet.</Trans>
            )}
          </div>
        </div>

        {props.sessionUsername ? (
          <div className={styles.controls}>
            <label className={styles.ownedOnlyControl} htmlFor={ownedOnlyId}>
              <input
                id={ownedOnlyId}
                type="checkbox"
                checked={props.isOwnedOnly}
                onChange={(event) =>
                  props.onOwnedOnlyChange(event.currentTarget.checked)
                }
                className={styles.ownedOnlyCheckbox}
              />
              <span className={styles.ownedOnlyLabel}>
                <Trans>Only repos I own</Trans>
              </span>
            </label>
            <button
              type="button"
              className={styles.topActionButton}
              onClick={props.onRefresh}
              disabled={
                props.isLoading || props.isImporting || props.isDisconnecting
              }
            >
              <RefreshCw size={18} />
              <Trans>Refresh</Trans>
            </button>
            <button
              type="button"
              className={styles.topActionButton}
              onClick={props.onDisconnect}
              disabled={
                props.isLoading || props.isImporting || props.isDisconnecting
              }
            >
              <Trans>
                {props.isDisconnecting ? "Logging out..." : "Log out"}
              </Trans>
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
                    {props.hostBaseUrl ? (
                      <div className={styles.loginForm}>
                        <label className={styles.loginField}>
                          <span className={styles.loginLabel}>
                            <Trans>Username</Trans>
                          </span>
                          <input
                            type="text"
                            aria-label="Cloud username"
                            value={props.loginUsername}
                            onInput={(event) =>
                              props.onLoginUsernameChange(
                                (event.target as HTMLInputElement).value,
                              )
                            }
                            className={styles.loginInput}
                          />
                        </label>
                        <label className={styles.loginField}>
                          <span className={styles.loginLabel}>
                            <Trans>Password</Trans>
                          </span>
                          <input
                            type="password"
                            aria-label="Cloud password"
                            value={props.loginPassword}
                            onInput={(event) =>
                              props.onLoginPasswordChange(
                                (event.target as HTMLInputElement).value,
                              )
                            }
                            className={styles.loginInput}
                          />
                        </label>
                        <button
                          type="button"
                          className={styles.topActionButton}
                          aria-label="Connect cloud account"
                          onClick={props.onConnect}
                          disabled={props.isConnecting}
                        >
                          <Trans>
                            {props.isConnecting
                              ? "Connecting..."
                              : "Connect account"}
                          </Trans>
                        </button>
                      </div>
                    ) : (
                      <Trans>
                        Set `VITE_GITEA_WEB_HOST` to enable cloud login in this
                        web build.
                      </Trans>
                    )}
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
            ) : props.isOwnedOnly && props.repos.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  <div className={styles.emptyState}>
                    <Trans>
                      No repositories you own are visible in this list yet.
                    </Trans>
                  </div>
                </td>
              </tr>
            ) : props.repos.length === 0 ? (
              <tr>
                <td className={styles.td} colSpan={4}>
                  <div className={styles.emptyState}>
                    <Trans>
                      No cloud projects are available for this account yet.
                    </Trans>
                  </div>
                </td>
              </tr>
            ) : (
              props.repos.map((repo) => (
                <tr key={repo.id} className={styles.tbodyRow}>
                  <td className={styles.td}>
                    <span className={styles.projectCell}>{repo.name}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.mutedCell}>{repo.owner}</span>
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
                      onClick={() => props.onCloneRepo(repo)}
                      disabled={
                        props.isImporting ||
                        props.isLoading ||
                        props.isDisconnecting
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
            disabled={
              props.isLoading || props.isImporting || props.isDisconnecting
            }
          >
            <Trans>Load more</Trans>
          </button>
        </div>
      ) : null}
    </div>
  );
}
