import { Tooltip } from "@base-ui/react/tooltip";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { $getSelection, $isRangeSelection } from "lexical";
import {
    AlertCircle,
    BookCopy,
    ChevronLeft,
    ChevronRight,
    ClipboardPaste,
    Copy,
    Redo2,
    Save,
    Scissors,
    Search,
    Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import {
    CloudStatusButton,
    type CloudStatusButtonState,
} from "@/app/ui/components/primitives/CloudStatusButton/index.ts";
import { ToolbarOverflowMenu } from "@/app/ui/components/primitives/ToolbarOverflowMenu/index.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
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
    isLintDockOpen: boolean;
    onToggleLintDock: () => void;
    onOpenCloudDock: () => void;
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
        save,
    } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const undoLabel = history.peekUndoLabel();
    const redoLabel = history.peekRedoLabel();
    const referenceLabel = props.isReferencePaneOpen
        ? t`Hide reference panel`
        : t`Open reference panel`;
    const cloudStatus = getCloudStatusPresentation(
        remote.status,
        remote.isRefreshing,
        t,
    );

    const handleCut = () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        try {
            document.execCommand("cut");
        } catch {
            // The editor still keeps its own keyboard cut path; toolbar cut is best-effort.
        }
    };

    const handleCopy = () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        try {
            document.execCommand("copy");
        } catch {
            // Best-effort fallback below.
            const selectedText = window.getSelection()?.toString() ?? "";
            if (selectedText) {
                void navigator.clipboard.writeText(selectedText);
            }
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

    const handleOpenPreviousVersions = () => {
        void save.versions.open(actions.saveCurrentDirtyLexical);
    };

    const handleOpenSaveReview = () => {
        actions.toggleDiffModal();
    };

    return (
        <div className={styles.root}>
            <div className={joinClassNames(styles.cluster, styles.leftCluster)}>
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
                <div className={styles.toolbarDivider} />
                <ToolbarTooltipButton
                    label={t`Cut`}
                    onClick={handleCut}
                    icon={<Scissors size={16} />}
                />
                <ToolbarTooltipButton
                    label={t`Copy`}
                    onClick={handleCopy}
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
                <ToolbarTooltipButton
                    label={referenceLabel}
                    onClick={props.onToggleReferencePane}
                    active={props.isReferencePaneOpen}
                    icon={<BookCopy size={16} />}
                />
                <ToolbarTooltipButton
                    label={
                        props.isLintDockOpen
                            ? t`Close lint dock`
                            : t`Open lint dock`
                    }
                    onClick={props.onToggleLintDock}
                    active={props.isLintDockOpen}
                    icon={<AlertCircle size={16} />}
                />
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
                <ToolbarOverflowMenu
                    onCopyEditorJson={() => void handleCopyEditorJson()}
                    onOpenPreviousVersions={handleOpenPreviousVersions}
                    onOpenDeveloperTools={
                        import.meta.env.DEV
                            ? () => {
                                  console.debug(
                                      "Editor toolbar developer tools",
                                  );
                              }
                            : undefined
                    }
                />
            </div>

            <div className={styles.rightCluster}>
                <CloudStatusButton
                    state={cloudStatus.state}
                    tooltipLabel={cloudStatus.label}
                    tooltipDescription={cloudStatus.description}
                    ariaLabel={cloudStatus.ariaLabel}
                    onClick={props.onOpenCloudDock}
                />
            </div>
        </div>
    );
}

function getCloudStatusPresentation(
    status: GitRemoteProjectStatus | null,
    isRefreshing: boolean,
    t: (strings: TemplateStringsArray, ...args: Array<unknown>) => string,
) {
    if (isRefreshing) {
        return {
            state: "syncing" as CloudStatusButtonState,
            label: t`Syncing`,
            description: t`Cloud status is refreshing. Open the git status dock.`,
            ariaLabel: t`Syncing cloud status`,
        };
    }

    if (!status) {
        return {
            state: "connected" as CloudStatusButtonState,
            label: t`Cloud`,
            description: t`Open the git status dock.`,
            ariaLabel: t`Open cloud dock`,
        };
    }

    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return {
                state: "connected" as CloudStatusButtonState,
                label: t`Connected`,
                description: t`Cloud is connected. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return {
                state: "syncing" as CloudStatusButtonState,
                label: t`Syncing`,
                description: t`Cloud status is refreshing. Open the git status dock.`,
                ariaLabel: t`Syncing cloud status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return {
                state: "behind" as CloudStatusButtonState,
                label: t`Behind`,
                description: t`Local changes are ahead of cloud. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return {
                state: "behind" as CloudStatusButtonState,
                label: t`Behind`,
                description: t`Cloud changes are waiting to be reviewed. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return {
                state: "diverged" as CloudStatusButtonState,
                label: t`Diverged`,
                description: t`Local and cloud changes need review. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return {
                state: "behind" as CloudStatusButtonState,
                label: t`Behind`,
                description: t`Cloud is currently unavailable. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return {
                state: "diverged" as CloudStatusButtonState,
                label: t`Reconnect`,
                description: t`Reconnect your account to resume cloud sync. Open the git status dock.`,
                ariaLabel: t`Open cloud dock`,
            };
    }
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
                <Tooltip.Positioner side="top" align="center">
                    <Tooltip.Popup className={styles.tooltipPopup}>
                        {props.label}
                    </Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
