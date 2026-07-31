import { Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CloudDownload,
  FileArchive,
  FolderOpen,
  Lightbulb,
  Search,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/index.ts";
import { useConsolidatedCatalog } from "@/app/ui/hooks/useConsolidatedCatalog.ts";
import * as styles from "@/app/ui/styles/modules/sourcePicker.css.ts";
import {
  type ConsolidatedRepo,
  getZipUrl,
} from "@/core/domain/project/import/LanguageApiImporter.ts";
import {
  parseWacsRepoUrl,
  probeWacsRepo,
  type WacsRepoProbeResult,
} from "@/core/domain/project/import/wacsRepoProbe.ts";

/** Which column the free-text search matches against. */
type SearchField = "language" | "code" | "user" | "repo";

const DEFAULT_FIELD: SearchField = "language";

/** Curated source-text owner that floats to the top within a language group. */
const WA_CATALOG_USER = "wa-catalog";

export type SourcePickerProps = {
  /** Resolve a chosen catalog repo to an archive URL and import it. */
  onDownload: (zipUrl: string) => void;
  /** True while an import/download the parent owns is in flight. */
  isBusy?: boolean;
  /** Import-from-device affordances (current input/native-picker mechanism). */
  onDirectoryAction?: () => void;
  onZipAction?: () => void;
  onDirectorySelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onZipSelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  directoryInputRef?: React.RefObject<HTMLInputElement | null>;
  zipInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Configured gitea host. Enables pasting a WACS repo link into the search. */
  giteaHostBaseUrl?: string | null;
  /** Render the centered page hero (title + subtitle). Modals pass false. */
  showHero?: boolean;
};

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function languageLabel(repo: ConsolidatedRepo) {
  return repo.language_english_name || repo.language_name;
}

/** The text a given search field matches against for one repo. */
function fieldHaystack(repo: ConsolidatedRepo, field: SearchField): string {
  switch (field) {
    case "language":
      return `${repo.language_english_name} ${repo.language_name}`;
    case "code":
      return repo.language_ietf;
    case "user":
      return repo.username;
    case "repo":
      return `${repo.repo_name} ${repo.title ?? ""}`;
  }
}

function repoId(repo: ConsolidatedRepo) {
  return `${repo.username}/${repo.repo_name}`;
}

export function SourcePicker(props: SourcePickerProps) {
  const { t } = useLingui();
  const showHero = props.showHero ?? true;

  const { repos, isLoading, isError, errorMessage } = useConsolidatedCatalog();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const error =
    downloadError ??
    (isError ? (errorMessage ?? t`Failed to fetch projects`) : null);
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>(DEFAULT_FIELD);
  const [downloadingRepoId, setDownloadingRepoId] = useState<string | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);

  const fieldItems = useMemo(
    () => [
      { value: "language", label: t`Language` },
      { value: "code", label: t`Code` },
      { value: "user", label: t`User` },
      { value: "repo", label: t`Repository` },
    ],
    [t],
  );

  const normalizedQuery = normalize(query);

  // Default ordering is alphabetical by language name, then WA-Catalog first
  // within a language (so the curated source text leads), then by repo name.
  const sortedRepos = useMemo(() => {
    if (!repos) return [];
    return [...repos].sort((a, b) => {
      const byLanguage = languageLabel(a).localeCompare(languageLabel(b));
      if (byLanguage !== 0) return byLanguage;
      // Skip the WA-Catalog bump when searching by owner — reordering
      // owners under an explicit owner search is confusing.
      if (field !== "user") {
        const aWa = normalize(a.username) === WA_CATALOG_USER;
        const bWa = normalize(b.username) === WA_CATALOG_USER;
        if (aWa !== bWa) return aWa ? -1 : 1;
      }
      return a.repo_name.localeCompare(b.repo_name);
    });
  }, [repos, field]);

  const filtered = useMemo(() => {
    if (normalizedQuery.length === 0) return sortedRepos;
    return sortedRepos.filter((repo) =>
      normalize(fieldHaystack(repo, field)).includes(normalizedQuery),
    );
  }, [sortedRepos, field, normalizedQuery]);

  // Virtualize the full result set — we fetch the whole catalog upfront, so
  // windowing keeps the DOM small without a row cap.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => styles.ROW_HEIGHT,
    overscan: 10,
  });

  const downloadRepo = useCallback(
    async (repo: ConsolidatedRepo) => {
      const id = repoId(repo);
      try {
        setDownloadingRepoId(id);
        setDownloadError(null);
        const zipUrl = await getZipUrl(repo);
        props.onDownload(zipUrl);
      } catch (cause) {
        setDownloadError(
          cause instanceof Error
            ? cause.message
            : t`Failed to prepare download`,
        );
      } finally {
        setDownloadingRepoId(null);
      }
    },
    [props, t],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setField(DEFAULT_FIELD);
  }, []);

  // When the query is a repo URL under the configured gitea host, switch from
  // catalog search into "probe this specific repo" mode.
  const hostBaseUrl = props.giteaHostBaseUrl ?? null;
  const wacsTarget = useMemo(
    () => (hostBaseUrl ? parseWacsRepoUrl(hostBaseUrl, query) : null),
    [hostBaseUrl, query],
  );
  const [probeResult, setProbeResult] = useState<WacsRepoProbeResult | null>(
    null,
  );
  const [isProbing, setIsProbing] = useState(false);

  useEffect(() => {
    if (!hostBaseUrl || !wacsTarget) {
      setProbeResult(null);
      setIsProbing(false);
      return;
    }
    const controller = new AbortController();
    setIsProbing(true);
    setProbeResult(null);
    const handle = setTimeout(() => {
      void probeWacsRepo({
        hostBaseUrl,
        target: wacsTarget,
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setProbeResult(result);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsProbing(false);
        });
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [hostBaseUrl, wacsTarget]);

  const canImportFromDevice = Boolean(
    props.onDirectoryAction || props.onZipAction,
  );

  return (
    <section
      className={styles.root}
      data-testid={TESTING_IDS.language.apiImporter}
    >
      {showHero ? (
        <header className={styles.hero}>
          <h1 className={styles.heroTitle}>
            <Trans>Load Project</Trans>
          </h1>
          {canImportFromDevice ? (
            <p className={styles.heroSubtitle}>
              <Trans>
                Use the search bar to find a project to work on, or you can{" "}
                <button
                  type="button"
                  className={styles.inlineLink}
                  onClick={() => setImportOpen((open) => !open)}
                >
                  load one from a file
                </button>
                .
              </Trans>
            </p>
          ) : null}
        </header>
      ) : null}

      {importOpen && canImportFromDevice ? (
        <div className={styles.importPanel}>
          {props.onDirectoryAction ? (
            <Button
              variant="secondary"
              leftIcon={<FolderOpen size={16} />}
              onClick={props.onDirectoryAction}
              disabled={props.isBusy}
            >
              <Trans>Folder</Trans>
            </Button>
          ) : null}
          {props.onZipAction ? (
            <Button
              variant="secondary"
              leftIcon={<FileArchive size={16} />}
              onClick={props.onZipAction}
              disabled={props.isBusy}
            >
              <Trans>ZIP</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}

      {props.onDirectorySelected ? (
        <input
          data-testid={TESTING_IDS.import.dirImporter}
          ref={props.directoryInputRef}
          type="file"
          webkitdirectory="true"
          multiple
          className={styles.hiddenInput}
          onChange={props.onDirectorySelected}
          disabled={props.isBusy}
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
          disabled={props.isBusy}
        />
      ) : null}

      <div className={styles.searchRow}>
        <div className={styles.searchBar}>
          <div className={styles.searchInputWrap}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t`Search language, code, or users...`}
              className={styles.searchInput}
              aria-label={t`Search projects`}
            />
            {query.trim().length > 0 ? (
              <IconTooltip label={t`Clear search`}>
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => setQuery("")}
                  aria-label={t`Clear search`}
                  data-testid={TESTING_IDS.language.importerClear}
                >
                  <X size={18} />
                </button>
              </IconTooltip>
            ) : null}
          </div>
          <div className={styles.fieldDivider} aria-hidden />
          <div className={styles.fieldWrap}>
            <SelectPrimitive
              items={fieldItems}
              value={field}
              onValueChange={(value) =>
                setField((value as SearchField) ?? DEFAULT_FIELD)
              }
              className={styles.fieldSelect}
            />
          </div>
        </div>
      </div>

      {error ? <div className={styles.errorState}>{error}</div> : null}

      {wacsTarget ? (
        <div className={styles.tableWrap}>
          <WacsProbeNotice
            target={wacsTarget}
            result={isProbing ? null : probeResult}
            isBusy={props.isBusy}
            onDownload={props.onDownload}
          />
        </div>
      ) : (
        <div ref={scrollRef} className={styles.tableWrap}>
          <div className={styles.headerRow}>
            <div className={styles.headerCell}>
              <Trans>Language</Trans>
            </div>
            <div className={styles.headerCell}>
              <Trans>Code</Trans>
            </div>
            <div className={styles.headerCell}>
              <Trans>User</Trans>
            </div>
            <div className={styles.headerCell}>
              <Trans>Repository</Trans>
            </div>
            <div className={styles.headerCell} aria-hidden />
          </div>

          {isLoading && !repos ? (
            <div className={styles.stateWrap}>
              <p className={styles.stateText}>
                <Trans>Loading projects...</Trans>
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.stateWrap}>
              {normalizedQuery.length > 0 ? (
                <>
                  <h2 className={styles.stateTitle}>
                    <Trans>No results for "{query}"</Trans>
                  </h2>
                  <p className={styles.stateText}>
                    <Trans>
                      Double-check your spelling, or try removing any active
                      filters to broaden your search.
                    </Trans>
                  </p>
                  <div className={styles.stateActions}>
                    <Button variant="secondary" onClick={clearSearch}>
                      <Trans>Remove Filters</Trans>
                    </Button>
                  </div>
                  <div className={styles.callout}>
                    <p className={styles.calloutTitle}>
                      <Lightbulb size={16} />
                      <Trans>Did you know?</Trans>
                    </p>
                    <p className={styles.calloutText}>
                      <Trans>
                        You can paste a repository link from WACS directly into
                        the search bar.
                      </Trans>
                    </p>
                  </div>
                </>
              ) : (
                <p className={styles.stateText}>
                  <Trans>No projects are available right now.</Trans>
                </p>
              )}
            </div>
          ) : (
            <div
              className={styles.listInner}
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const repo = filtered[virtualRow.index];
                const id = repoId(repo);
                return (
                  <div
                    key={id}
                    className={styles.row}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className={styles.langCell}>{languageLabel(repo)}</div>
                    <div className={styles.cell}>{repo.language_ietf}</div>
                    <div className={styles.cell}>{repo.username}</div>
                    <div className={styles.cell}>{repo.repo_name}</div>
                    <div className={styles.actionCell}>
                      <IconTooltip label={t`Download ${languageLabel(repo)}`}>
                        <button
                          type="button"
                          className={styles.downloadButton}
                          onClick={() => void downloadRepo(repo)}
                          disabled={props.isBusy || downloadingRepoId === id}
                          aria-label={t`Download ${languageLabel(repo)}`}
                          data-testid={TESTING_IDS.language.importerDownload}
                        >
                          <CloudDownload size={20} />
                        </button>
                      </IconTooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Verdict card shown when a WACS repo URL is pasted into the search bar. */
function WacsProbeNotice(props: {
  target: { owner: string; repo: string };
  result: WacsRepoProbeResult | null;
  isBusy?: boolean;
  onDownload: (zipUrl: string) => void;
}) {
  const repoLabel = `${props.target.owner}/${props.target.repo}`;

  if (!props.result) {
    return (
      <div className={styles.stateWrap}>
        <p className={styles.stateText}>
          <Trans>Checking {repoLabel}…</Trans>
        </p>
      </div>
    );
  }

  switch (props.result.kind) {
    case "importable":
      return (
        <div className={styles.stateWrap}>
          <h2 className={styles.stateTitle}>
            <Trans>This repository can be imported</Trans>
          </h2>
          <p className={styles.stateText}>{repoLabel}</p>
          <div className={styles.stateActions}>
            <Button
              variant="primary"
              leftIcon={<CloudDownload size={16} />}
              disabled={props.isBusy}
              onClick={() => {
                if (props.result?.kind === "importable") {
                  props.onDownload(props.result.archiveUrl);
                }
              }}
            >
              <Trans>Download</Trans>
            </Button>
          </div>
        </div>
      );
    case "not-consolidated":
      return (
        <div className={styles.stateWrap}>
          <h2 className={styles.stateTitle}>
            <Trans>This repository can't be imported</Trans>
          </h2>
          <p className={styles.stateText}>
            <Trans>
              {repoLabel} isn't tagged "consolidated", so it isn't available to
              import here.
            </Trans>
          </p>
        </div>
      );
    case "not-found":
      return (
        <div className={styles.stateWrap}>
          <h2 className={styles.stateTitle}>
            <Trans>Repository not found</Trans>
          </h2>
          <p className={styles.stateText}>
            <Trans>Couldn't find a public repository at this link.</Trans>
          </p>
        </div>
      );
    default:
      return (
        <div className={styles.stateWrap}>
          <h2 className={styles.stateTitle}>
            <Trans>Couldn't check this link</Trans>
          </h2>
          <p className={styles.stateText}>{props.result.message}</p>
        </div>
      );
  }
}
