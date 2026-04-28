import { Tooltip } from "@base-ui/react/tooltip";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { $getSelection, $isRangeSelection } from "lexical";
import {
    AlignLeft,
    BookCopy,
    ChevronLeft,
    ChevronRight,
    ClipboardPaste,
    Copy,
    Hash,
    MessageSquare,
    Pilcrow,
    Quote,
    Redo2,
    Save,
    Scissors,
    Search,
    Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { insertUsfmMarkerAtCursor } from "@/app/domain/editor/utils/insertUsfmMarkerAtCursor.ts";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { CloudStatusPopover } from "@/app/ui/components/blocks/CloudStatusPopover.tsx";
import { LintIssuesPopover } from "@/app/ui/components/blocks/LintIssuesPopover.tsx";
import { VersionsPopover } from "@/app/ui/components/blocks/VersionsPopover.tsx";
import type { CloudStatusButtonState } from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { ToolbarOverflowMenu } from "@/app/ui/components/primitives/ToolbarOverflowMenu/index.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { getLocalizedUsfmMarkerLabel } from "@/app/ui/i18n/usfmMarkerLocalization.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_PROJECT_STATUS_SYNCING,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import * as styles from "./editorToolbar.css.ts";

function joinClassNames(...classNames: Array<string | undefined>) {
    return classNames.filter(Boolean).join(" ");
}

type EditorToolbarProps = {
    isReferencePaneOpen: boolean;
    onToggleReferencePane: () => void;
    isSearchPaneOpen?: boolean;
    onToggleSearchPane?: () => void;
};

export function EditorToolbar(props: EditorToolbarProps) {
    const { t } = useLingui();
    const {
        actions,
        editorRef,
        history,
        remote,
        project,
        projectLanguageDirection,
        bookCodeToProjectLocalizedTitle,
    } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const undoLabel = history.peekUndoLabel();
    const redoLabel = history.peekRedoLabel();
    const currentBookLabel = bookCodeToProjectLocalizedTitle({
        bookCode: project.pickedFile.bookCode,
    });
    const cloudStatus = getCloudStatusPresentation(
        remote.status,
        remote.isRefreshing,
        t,
    );

    const handleCut = async () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const selectedText = window.getSelection()?.toString() ?? "";
        if (!selectedText) return;
        try {
            await navigator.clipboard.writeText(selectedText);
        } catch {
            return;
        }
        editor.update(
            () => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;
                selection.removeText();
            },
            { discrete: true },
        );
    };

    const handleCopy = async () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const selectedText = window.getSelection()?.toString() ?? "";
        if (!selectedText) return;
        try {
            await navigator.clipboard.writeText(selectedText);
        } catch {
            // Clipboard API may be denied; nothing else to fall back to.
        }
    };

    const handlePaste = async () => {
        const editor = editorRef.current;
        if (!editor) return;

        let clipboardText = "";
        try {
            clipboardText = await navigator.clipboard.readText();
        } catch {
            return;
        }
        if (!clipboardText) return;

        editor.focus();

        if (isUsfmLikePaste(clipboardText)) {
            const parsed = await parseClipboardUsfmToTokens({
                text: clipboardText,
                bookCode: project.pickedFile.bookCode,
                direction: projectLanguageDirection,
                usfmOnionService,
            });

            if (parsed.ok) {
                editor.update(
                    () => {
                        const selection = $getSelection();
                        if (!$isRangeSelection(selection)) return;
                        selection.insertNodes(
                            parsedUsfmTokensToInsertableNodes(parsed.tokens),
                        );
                    },
                    { discrete: true },
                );
                return;
            }
        }

        editor.update(
            () => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;
                selection.insertText(clipboardText);
            },
            { discrete: true },
        );
    };

    const handleCopyEditorJson = async () => {
        const editor = editorRef.current;
        if (!editor) return;
        const json = JSON.stringify(editor.getEditorState().toJSON(), null, 2);
        await navigator.clipboard.writeText(json);
    };

    const handleOpenSaveReview = () => {
        actions.toggleDiffModal();
    };

    const handleInsertUsfm = (marker: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        insertUsfmMarkerAtCursor({
            editor,
            marker,
            languageDirection: projectLanguageDirection,
            editorMode: project.appSettings.editorMode,
        });
    };

    const markerButtonLabel = (marker: string) =>
        getLocalizedUsfmMarkerLabel(marker);

    return (
        <div className={styles.root}>
            <div className={styles.toolbarRow}>
                <div className={styles.clusterRow}>
                    <div className={styles.cluster}>
                        <ToolbarTooltipButton
                            label={t`Previous chapter`}
                            onClick={actions.prevChapter.go}
                            disabled={!actions.prevChapter.hasPrev}
                            icon={<ChevronLeft size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={t`Next chapter`}
                            onClick={actions.nextChapter.go}
                            disabled={!actions.nextChapter.hasNext}
                            icon={<ChevronRight size={16} />}
                        />
                    </div>

                    <div
                        className={styles.locationSeparator}
                        aria-hidden="true"
                    />

                    <div className={styles.currentLocation}>
                        <span className={styles.currentLocationBook}>
                            {currentBookLabel}
                        </span>
                    </div>

                    <div
                        className={styles.locationSeparator}
                        aria-hidden="true"
                    />

                    <div className={styles.cluster}>
                        <ToolbarTooltipButton
                            label={markerButtonLabel("p")}
                            onClick={() => handleInsertUsfm("p")}
                            icon={<Pilcrow size={15} />}
                        />
                        <ToolbarTooltipButton
                            label={markerButtonLabel("m")}
                            onClick={() => handleInsertUsfm("m")}
                            icon={<AlignLeft size={15} />}
                        />
                        <ToolbarTooltipButton
                            label={markerButtonLabel("q1")}
                            onClick={() => handleInsertUsfm("q1")}
                            icon={<QuoteLevelIcon level={1} />}
                        />
                        <ToolbarTooltipButton
                            label={markerButtonLabel("q2")}
                            onClick={() => handleInsertUsfm("q2")}
                            icon={<QuoteLevelIcon level={2} />}
                        />
                    </div>

                    <div
                        className={styles.locationSeparator}
                        aria-hidden="true"
                    />

                    <div className={styles.cluster}>
                        <ToolbarTooltipButton
                            label={markerButtonLabel("v")}
                            onClick={() => handleInsertUsfm("v")}
                            icon={<Hash size={14} />}
                        />
                        <ToolbarTooltipButton
                            label={markerButtonLabel("f")}
                            onClick={() => handleInsertUsfm("f")}
                            icon={<MessageSquare size={14} />}
                        />
                    </div>

                    <div
                        className={styles.locationSeparator}
                        aria-hidden="true"
                    />

                    <div className={styles.cluster}>
                        <ToolbarTooltipButton
                            label={t`Cut`}
                            onClick={() => {
                                void handleCut();
                            }}
                            icon={<Scissors size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={t`Copy`}
                            onClick={() => {
                                void handleCopy();
                            }}
                            icon={<Copy size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={t`Paste`}
                            onClick={() => {
                                void handlePaste();
                            }}
                            icon={<ClipboardPaste size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={t`Save`}
                            onClick={handleOpenSaveReview}
                            icon={<Save size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={undoLabel ? t`Undo — ${undoLabel}` : t`Undo`}
                            onClick={history.undo}
                            disabled={!history.canUndo}
                            icon={<Undo2 size={16} />}
                        />
                        <ToolbarTooltipButton
                            label={redoLabel ? t`Redo — ${redoLabel}` : t`Redo`}
                            onClick={history.redo}
                            disabled={!history.canRedo}
                            icon={<Redo2 size={16} />}
                        />
                    </div>

                    <div
                        className={styles.locationSeparator}
                        aria-hidden="true"
                    />

                    <div className={styles.cluster}>
                        <ToolbarTooltipButton
                            label={
                                props.isReferencePaneOpen
                                    ? t`Hide reference panel`
                                    : t`Open reference panel`
                            }
                            onClick={props.onToggleReferencePane}
                            active={props.isReferencePaneOpen}
                            icon={<BookCopy size={16} />}
                        />
                        <LintIssuesPopover />
                        <ToolbarTooltipButton
                            label={
                                props.isSearchPaneOpen
                                    ? t`Close search`
                                    : t`Open search`
                            }
                            onClick={props.onToggleSearchPane ?? (() => {})}
                            active={props.isSearchPaneOpen}
                            icon={<Search size={16} />}
                        />
                        <VersionsPopover />
                        <ToolbarOverflowMenu
                            onCopyEditorJson={() => void handleCopyEditorJson()}
                        />
                        <CloudStatusPopover
                            buttonState={cloudStatus.state}
                            buttonLabel={cloudStatus.label}
                            buttonDescription={cloudStatus.description}
                            buttonAriaLabel={cloudStatus.ariaLabel}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

type CloudStatusPresentation = {
    state: CloudStatusButtonState;
    label: string;
    description: string;
    ariaLabel: string;
};

function getCloudStatusPresentation(
    status: GitRemoteProjectStatus | null,
    isRefreshing: boolean,
    t: (strings: TemplateStringsArray, ...args: Array<unknown>) => string,
): CloudStatusPresentation {
    if (isRefreshing) {
        return {
            state: "syncing",
            label: t`Syncing`,
            description: t`Cloud status is refreshing.`,
            ariaLabel: t`Syncing cloud status`,
        };
    }

    if (!status) {
        return {
            state: "connected",
            label: t`Cloud`,
            description: t`Open cloud status.`,
            ariaLabel: t`Open cloud status`,
        };
    }

    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return {
                state: "connected",
                label: t`Connected`,
                description: t`Cloud is connected.`,
                ariaLabel: t`Open cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return {
                state: "syncing",
                label: t`Syncing`,
                description: t`Cloud status is refreshing.`,
                ariaLabel: t`Syncing cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return {
                state: "behind",
                label: t`Behind`,
                description: t`Local changes are ahead of cloud.`,
                ariaLabel: t`Open cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return {
                state: "behind",
                label: t`Behind`,
                description: t`Cloud changes are waiting to be reviewed.`,
                ariaLabel: t`Open cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return {
                state: "diverged",
                label: t`Diverged`,
                description: t`Local and cloud changes need review.`,
                ariaLabel: t`Open cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return {
                state: "behind",
                label: t`Behind`,
                description: t`Cloud is currently unavailable.`,
                ariaLabel: t`Open cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return {
                state: "diverged",
                label: t`Reconnect`,
                description: t`Reconnect your account to resume cloud sync.`,
                ariaLabel: t`Open cloud status`,
            };
    }
}

function QuoteLevelIcon({ level }: { level: 1 | 2 }) {
    return (
        <span className={styles.quoteLevelIcon}>
            <Quote size={12} />
            <span className={styles.quoteLevelBadge}>{level}</span>
        </span>
    );
}

function ToolbarTooltipButton(props: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
}) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger
                render={
                    <button
                        type="button"
                        className={joinClassNames(
                            styles.iconButton,
                            props.active ? styles.iconButtonActive : undefined,
                        )}
                        aria-label={props.label}
                        onClick={props.onClick}
                        disabled={props.disabled}
                    >
                        {props.icon}
                    </button>
                }
            />
            <Tooltip.Portal>
                <Tooltip.Positioner
                    side="top"
                    align="center"
                    sideOffset={6}
                    style={{ zIndex: zLayer.toolbarTooltip }}
                >
                    <Tooltip.Popup className={styles.tooltipPopup}>
                        {props.label}
                    </Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
