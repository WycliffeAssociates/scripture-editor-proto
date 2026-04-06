import { ChevronDown } from "lucide-react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

export function ProblemsPanelContent() {
    const { actions, bookCodeToProjectLocalizedTitle, lint } =
        useWorkspaceContext();

    if (!lint.messages.length) {
        return (
            <div className={styles.bottomPanelContent}>
                <div className={styles.bottomPanelEmptyState}>
                    No lint issues right now.
                </div>
            </div>
        );
    }

    const issuesByBook = groupLintIssuesByBook(lint.messages);

    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.lintIssueList}>
                {issuesByBook.map((group) => (
                    <LintIssueGroup
                        key={group.bookCode}
                        bookCode={group.bookCode}
                        title={bookCodeToProjectLocalizedTitle({
                            bookCode: group.bookCode,
                        })}
                        issues={group.issues}
                        onFixIssue={actions.fixLintError}
                        onOpenIssue={(bookCode, chapter) =>
                            actions.switchBookOrChapter(bookCode, chapter)
                        }
                    />
                ))}
            </div>
        </div>
    );
}

function groupLintIssuesByBook(messages: LintIssue[]) {
    const grouped = new Map<string, LintIssue[]>();
    for (const issue of messages) {
        const parsed = issue.sid ? parseSid(issue.sid) : null;
        const bookCode = parsed?.book ?? "UNKNOWN";
        const current = grouped.get(bookCode) ?? [];
        current.push(issue);
        grouped.set(bookCode, current);
    }
    return Array.from(grouped.entries()).map(([bookCode, issues]) => ({
        bookCode,
        issues,
    }));
}

function LintIssueGroup(props: {
    bookCode: string;
    title: string;
    issues: LintIssue[];
    onFixIssue: (issue: LintIssue) => void;
    onOpenIssue: (bookCode: string, chapter: number) => void;
}) {
    return (
        <section className={styles.lintIssueGroup}>
            <header className={styles.lintIssueGroupHeader}>
                <span className={styles.bottomPanelGroupChevron}>
                    <ChevronDown size={14} />
                </span>
                <span className={styles.bottomPanelGroupTitle}>
                    {props.title}
                </span>
                <span className={styles.bottomPanelGroupLocation}>
                    {props.bookCode}
                </span>
                <span className={styles.bottomPanelGroupCount}>
                    {props.issues.length}
                </span>
            </header>
            <div className={styles.lintIssueList}>
                {props.issues.map((issue) => (
                    <LintIssueRow
                        key={`${issue.code}:${issue.sid ?? "unknown"}`}
                        issue={issue}
                        onFixIssue={props.onFixIssue}
                        onOpenIssue={props.onOpenIssue}
                    />
                ))}
            </div>
        </section>
    );
}

function LintIssueRow(props: {
    issue: LintIssue;
    onFixIssue: (issue: LintIssue) => void;
    onOpenIssue: (bookCode: string, chapter: number) => void;
}) {
    const { project, actions } = useWorkspaceContext();
    const parsed = props.issue.sid ? parseSid(props.issue.sid) : null;
    const locationLabel = parsed
        ? `${parsed.book} ${parsed.chapter}${parsed.isBookChapOnly ? "" : `:${parsed.verseStart}${parsed.verseStart !== parsed.verseEnd ? `-${parsed.verseEnd}` : ""}`}`
        : (props.issue.sid ?? "Unknown location");

    const handleNavigate = () => {
        if (!props.issue.sid) return;
        const sidParsed = parseSid(props.issue.sid);
        if (!sidParsed) return;

        const currentBook = project.pickedFile.bookCode;
        const currentChapter =
            project.pickedChapter?.chapterNumber ?? project.currentChapter;

        if (
            sidParsed.book === currentBook &&
            sidParsed.chapter === currentChapter
        ) {
            const tokenId = props.issue.tokenId ?? props.issue.relatedTokenId;
            if (tokenId) {
                const el = document.querySelector(
                    `[data-id="${tokenId}"]`,
                ) as HTMLElement | null;
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("selected");
                }
            }
        } else {
            actions.switchBookOrChapter(sidParsed.book, sidParsed.chapter);
            const tokenId = props.issue.tokenId ?? props.issue.relatedTokenId;
            if (tokenId) {
                const tryScroll = () => {
                    const el = document.querySelector(
                        `[data-id="${tokenId}"]`,
                    ) as HTMLElement | null;
                    if (el) {
                        el.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                        });
                        el.classList.add("selected");
                        return true;
                    }
                    return false;
                };
                let attempts = 0;
                const maxAttempts = 50;
                const interval = setInterval(() => {
                    attempts++;
                    if (tryScroll() || attempts >= maxAttempts) {
                        clearInterval(interval);
                    }
                }, 100);
            }
        }
    };

    return (
        <div
            className={styles.lintIssueCard}
            data-token-id={
                props.issue.tokenId ?? props.issue.relatedTokenId ?? undefined
            }
            data-sid={props.issue.sid ?? undefined}
            onClick={handleNavigate}
            style={{ cursor: "pointer" }}
        >
            <div className={styles.lintIssueCardBody}>
                <div className={styles.lintIssueCardMessage}>
                    {props.issue.message}
                </div>
                <div className={styles.lintIssueCardMeta}>
                    <span>{locationLabel}</span>
                    <span>{props.issue.code}</span>
                    <span>{props.issue.severity}</span>
                </div>
            </div>
            <div className={styles.lintIssueActions}>
                {parsed ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onOpenIssue(parsed.book, parsed.chapter);
                        }}
                    >
                        Open chapter
                    </Button>
                ) : null}
                {props.issue.fix ? (
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onFixIssue(props.issue);
                        }}
                    >
                        Fix
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
