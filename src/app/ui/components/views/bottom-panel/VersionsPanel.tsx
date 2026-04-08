import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Clock3, GitCommitHorizontal, History, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { prefetchVersionPreview } from "@/app/ui/hooks/save/versionQueries.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";

const HOVER_PREFETCH_DELAY_MS = 25;
const INITIAL_PREFETCH_COUNT = 3;

export function VersionsPanelContent() {
    const { actions, loadedProject, save } = useWorkspaceContext();
    const { gitProvider, settingsManager, usfmOnionService } =
        useRouter().options.context;
    const queryClient = useQueryClient();
    const editorMode = settingsManager.get("editorMode");

    useEffect(() => {
        void save.versions.ensureLoaded();
    }, [save.versions.ensureLoaded, save.versions]);

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
        for (const commitHash of versionsToWarm) {
            void prefetchVersionPreview({
                queryClient,
                projectPath: loadedProject.projectPath,
                commitHash,
                loadedProject,
                gitProvider,
                editorMode,
                usfmOnionService,
            });
        }
    }, [
        editorMode,
        gitProvider,
        loadedProject,
        queryClient,
        usfmOnionService,
        versionsToWarm,
    ]);

    if (save.versions.isLoading && !save.versions.entries.length) {
        return (
            <div className={styles.bottomPanelContent}>
                <div className={styles.bottomPanelEmptyState}>
                    Loading versions…
                </div>
            </div>
        );
    }

    if (!save.versions.entries.length) {
        return (
            <div className={styles.bottomPanelContent}>
                <div className={styles.bottomPanelEmptyState}>
                    Save changes to create additional versions.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.versionsPanelHeader}>
                <div className={styles.versionsPanelHeaderText}>
                    <div className={styles.versionsPanelTitle}>History</div>
                    <div className={styles.versionsPanelSubtitle}>
                        {save.versions.entries.length} versions loaded
                    </div>
                </div>
                <div className={styles.versionsPanelActions}>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                            void save.versions.backToLatest(
                                actions.saveCurrentDirtyLexical,
                            )
                        }
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
                </div>
            </div>
            <div className={styles.versionsList}>
                {save.versions.entries.map((entry) => (
                    <VersionRow
                        key={entry.hash}
                        hash={entry.hash}
                        subject={entry.subject}
                        authorName={entry.authorName}
                        authoredAtIso={entry.authoredAtIso}
                        chapterSummary={entry.chapterSummary ?? []}
                        isLatest={entry.hash === save.versions.latestHash}
                        isSelected={entry.hash === save.versions.selectedHash}
                        isSwitching={save.versions.isSwitching}
                        onSelect={() =>
                            void save.versions.select(
                                entry.hash,
                                actions.saveCurrentDirtyLexical,
                            )
                        }
                        onPrefetch={() =>
                            prefetchVersionPreview({
                                queryClient,
                                projectPath: loadedProject.projectPath,
                                commitHash: entry.hash,
                                loadedProject,
                                gitProvider,
                                editorMode,
                                usfmOnionService,
                            })
                        }
                    />
                ))}
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
    const authoredAtLabel = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(props.authoredAtIso));

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
                props.isSelected ? styles.versionRowSelected : styles.versionRow
            }
            data-testid={TESTING_IDS.versions.row}
            onClick={props.onSelect}
            disabled={props.isSwitching}
            onPointerEnter={schedulePrefetch}
            onPointerLeave={cancelPrefetchTimer}
            onFocus={schedulePrefetch}
            onBlur={cancelPrefetchTimer}
        >
            <div className={styles.versionRowHeader}>
                <div className={styles.versionRowSubject}>{props.subject}</div>
                <div className={styles.versionRowBadges}>
                    {props.isLatest ? (
                        <span className={styles.versionBadge}>Latest</span>
                    ) : null}
                    {props.isSelected ? (
                        <span className={styles.versionBadge}>Selected</span>
                    ) : null}
                </div>
            </div>
            <div className={styles.versionRowMetaLine}>
                <span className={styles.versionMetaItem}>
                    <UserRound size={12} />
                    {props.authorName}
                </span>
                <span className={styles.versionMetaItem}>
                    <Clock3 size={12} />
                    {authoredAtLabel}
                </span>
                <span className={styles.versionMetaItem}>
                    <GitCommitHorizontal size={12} />
                    {props.hash.slice(0, 8)}
                </span>
            </div>
            {props.chapterSummary.length ? (
                <div className={styles.versionRowChapterSummary}>
                    <History size={12} />
                    <span>{props.chapterSummary.join(", ")}</span>
                </div>
            ) : null}
        </button>
    );
}
