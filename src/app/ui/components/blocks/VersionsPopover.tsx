import { Popover as BasePopover } from "@base-ui/react/popover";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Clock3,
  GitCommitHorizontal,
  History,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { prefetchVersionPreview } from "@/app/ui/hooks/save/versionQueries.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as projectViewStyles from "@/app/ui/styles/modules/Projectview.css.ts";
import * as styles from "@/app/ui/styles/modules/VersionsPopover.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

const HOVER_PREFETCH_DELAY_MS = 25;
const INITIAL_PREFETCH_COUNT = 3;

// Hoisted so VersionRow rows in the virtualizer don't reallocate the formatter
// on every render. Locale-undefined falls back to navigator.language.
const VERSION_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function VersionsPopover() {
  const { t } = useLingui();
  const [opened, setOpened] = useState(false);
  const { loadedProject, save } = useWorkspaceContext();
  const { gitProvider, usfmOnionService } = useRouter().options.context;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!opened) return;
    void save.versions.ensureLoaded();
  }, [opened, save.versions]);

  const versionsToWarm = useMemo(() => {
    const selectedHash = save.versions.selectedHash;
    const prioritized = save.versions.entries
      .map((entry) => entry.hash)
      .sort((left, right) => {
        if (left === selectedHash) return -1;
        if (right === selectedHash) return 1;
        return 0;
      });
    return prioritized.slice(0, INITIAL_PREFETCH_COUNT);
  }, [save.versions.entries, save.versions.selectedHash]);

  useEffect(() => {
    if (!opened) return;
    for (const commitHash of versionsToWarm) {
      void prefetchVersionPreview({
        queryClient,
        projectPath: loadedProject.projectPath,
        commitHash,
        loadedProject,
        gitProvider,
        usfmOnionService,
      });
    }
  }, [
    opened,
    gitProvider,
    loadedProject,
    queryClient,
    usfmOnionService,
    versionsToWarm,
  ]);

  const entries = save.versions.entries;
  const isLoading = save.versions.isLoading && !entries.length;

  return (
    <BasePopover.Root open={opened} onOpenChange={setOpened}>
      <IconTooltip label={t`Previous versions`}>
        <BasePopover.Trigger
          render={
            <TriggerButton active={opened} ariaLabel={t`Previous versions`} />
          }
        />
      </IconTooltip>
      <BasePopover.Portal>
        <BasePopover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          style={{ zIndex: zLayer.popoverPositioner }}
        >
          <BasePopover.Popup className={styles.popover}>
            <div className={styles.header}>
              <div className={styles.headerText}>
                <div className={styles.title}>History</div>
                <div className={styles.subtitle}>
                  {entries.length} versions loaded
                </div>
              </div>
              <div className={styles.headerActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void save.versions.backToLatest()}
                  disabled={
                    !save.versions.isViewingOlderVersion ||
                    save.versions.isSwitching
                  }
                >
                  Back to latest
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void save.versions.loadMore()}
                  disabled={save.versions.isSwitching}
                >
                  Load more
                </Button>
                <IconTooltip label={t`Close versions`}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setOpened(false)}
                    aria-label={t`Close versions`}
                  >
                    <X size={16} />
                  </button>
                </IconTooltip>
              </div>
            </div>

            {isLoading ? (
              <div className={styles.emptyState}>Loading versions…</div>
            ) : entries.length === 0 ? (
              <div className={styles.emptyState}>
                Save changes to create additional versions.
              </div>
            ) : (
              <VirtualizedVersionsList
                entries={entries}
                latestHash={save.versions.latestHash}
                selectedHash={save.versions.selectedHash}
                isSwitching={save.versions.isSwitching}
                opened={opened}
                onSelect={(hash) => void save.versions.select(hash)}
                onPrefetch={(hash) =>
                  prefetchVersionPreview({
                    queryClient,
                    projectPath: loadedProject.projectPath,
                    commitHash: hash,
                    loadedProject,
                    gitProvider,
                    usfmOnionService,
                  })
                }
              />
            )}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

function TriggerButton(props: {
  active: boolean;
  ariaLabel: string;
  [key: string]: unknown;
}) {
  const { active, ariaLabel, ...rest } = props;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={active}
      className={joinClassNames(
        styles.triggerButton,
        active && styles.triggerButtonActive,
      )}
      {...rest}
    >
      <History size={16} />
    </button>
  );
}

type VersionEntry = {
  hash: string;
  subject: string;
  authorName: string;
  authoredAtIso: string;
  chapterSummary?: string[] | null;
};

function VirtualizedVersionsList(props: {
  entries: VersionEntry[];
  latestHash: string | null;
  selectedHash: string | null;
  isSwitching: boolean;
  opened: boolean;
  onSelect: (hash: string) => void;
  onPrefetch: (hash: string) => Promise<void> | void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 86,
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (index) => props.entries[index]?.hash ?? index,
  });

  useEffect(() => {
    if (props.opened) virtualizer.measure();
  }, [props.opened, virtualizer]);

  return (
    <div ref={scrollRef} className={styles.listViewport}>
      <div
        className={styles.virtualInner}
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = props.entries[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={entry.hash}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={styles.virtualRow}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <VersionRow
                hash={entry.hash}
                subject={entry.subject}
                authorName={entry.authorName}
                authoredAtIso={entry.authoredAtIso}
                chapterSummary={entry.chapterSummary ?? []}
                isLatest={entry.hash === props.latestHash}
                isSelected={entry.hash === props.selectedHash}
                isSwitching={props.isSwitching}
                onSelect={() => props.onSelect(entry.hash)}
                onPrefetch={() => Promise.resolve(props.onPrefetch(entry.hash))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionRow(props: {
  hash: string;
  subject: string;
  authorName: string;
  authoredAtIso: string;
  chapterSummary: string[];
  isLatest: boolean;
  isSelected: boolean;
  isSwitching: boolean;
  onSelect: () => void;
  onPrefetch: () => Promise<void>;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authoredAtLabel = VERSION_TIMESTAMP_FORMATTER.format(
    new Date(props.authoredAtIso),
  );

  function cancelPrefetchTimer() {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function schedulePrefetch() {
    cancelPrefetchTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void props.onPrefetch();
    }, HOVER_PREFETCH_DELAY_MS);
  }

  return (
    <button
      type="button"
      className={
        props.isSelected
          ? projectViewStyles.versionRowSelected
          : projectViewStyles.versionRow
      }
      data-testid={TESTING_IDS.versions.row}
      onClick={props.onSelect}
      disabled={props.isSwitching}
      onPointerEnter={schedulePrefetch}
      onPointerLeave={cancelPrefetchTimer}
      onFocus={schedulePrefetch}
      onBlur={cancelPrefetchTimer}
    >
      <div className={projectViewStyles.versionRowHeader}>
        <div className={projectViewStyles.versionRowSubject}>
          {props.subject}
        </div>
        <div className={projectViewStyles.versionRowBadges}>
          {props.isLatest ? (
            <span className={projectViewStyles.versionBadge}>Latest</span>
          ) : null}
          {props.isSelected ? (
            <span className={projectViewStyles.versionBadge}>Selected</span>
          ) : null}
        </div>
      </div>
      <div className={projectViewStyles.versionRowMetaLine}>
        <span className={projectViewStyles.versionMetaItem}>
          <UserRound size={12} />
          {props.authorName}
        </span>
        <span className={projectViewStyles.versionMetaItem}>
          <Clock3 size={12} />
          {authoredAtLabel}
        </span>
        <span className={projectViewStyles.versionMetaItem}>
          <GitCommitHorizontal size={12} />
          {props.hash.slice(0, 8)}
        </span>
      </div>
      {props.chapterSummary.length ? (
        <div className={projectViewStyles.versionRowChapterSummary}>
          <History size={12} />
          <span>{props.chapterSummary.join(", ")}</span>
        </div>
      ) : null}
    </button>
  );
}
