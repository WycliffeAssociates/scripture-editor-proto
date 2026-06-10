import { Tooltip } from "@base-ui/react/tooltip";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { $getSelection, $isRangeSelection } from "lexical";
import {
    AlignLeft,
    BookCopy,
    ChevronLeft,
    ChevronRight,
    Hash,
    Loader2,
    MessageSquare,
    Pilcrow,
    Quote,
    Redo2,
    Save,
    Undo2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { editorModeToShape } from "@/app/data/editor.ts";
import { insertUsfmMarkerAtCursor } from "@/app/domain/editor/utils/insertUsfmMarkerAtCursor.ts";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { presentSharedProjectStatus } from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import { CloudStatusPopover } from "@/app/ui/components/blocks/CloudStatusPopover.tsx";
import { FindingsPopover } from "@/app/ui/components/blocks/FindingsPopover.tsx";
import { ReferencePicker } from "@/app/ui/components/blocks/ReferencePicker.tsx";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { showNotificationInfo } from "@/app/ui/components/primitives/notifications.ts";
import { ToolbarOverflowMenu } from "@/app/ui/components/primitives/ToolbarOverflowMenu/index.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { getLocalizedUsfmMarkerLabel } from "@/app/ui/i18n/usfmMarkerLocalization.ts";
import * as dialogStyles from "@/app/ui/styles/modules/ProjectRow.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import * as styles from "./editorToolbar.css.ts";

type EditorToolbarProps = {
    isReferencePaneOpen: boolean;
    onToggleReferencePane: () => void;
    isSearchPaneOpen?: boolean;
    onToggleSearchPane?: () => void;
};

//todo: This is probably rye for decomposition. There's a mixture of state, a good number of dependent and dependency injection of the workspace context. especially the stuff like handle cut, handle copy, handle paste. Just kind of distracts from seeing the return body and feels like a lot of logic before and most of these functions feel like we could probably, you know, extract some of this out, move some of it to some other spots potentially. I'm open to your suggestions on it ON HOW YOU'D DEOMCPOSE HERE.
export function EditorToolbar(props: EditorToolbarProps) {
    const { t, i18n } = useLingui();
    const {
        actions,
        editorRef,
        history,
        remote,
        project,
        referenceResource,
        projectLanguageDirection,
        bookCodeToProjectLocalizedTitle,
    } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const undoLabel = history.peekUndoLabel();
    const redoLabel = history.peekRedoLabel();
    const currentBookLabel = bookCodeToProjectLocalizedTitle({
        bookCode: project.pickedFile.bookCode,
    });
    const cloudStatus = presentSharedProjectStatus({
        status: remote.status,
        isRefreshing: remote.isRefreshing,
        i18n,
    });

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
                            parsedUsfmTokensToInsertableNodes(
                                parsed.tokens,
                                editorModeToShape(
                                    project.appSettings.editorMode,
                                ),
                            ),
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

    const [pickReferenceDialogOpen, setPickReferenceDialogOpen] =
        useState(false);
    const handleMatchFormattingToSource = async () => {
        if (!referenceResource.activeReferenceResourcePath) {
            setPickReferenceDialogOpen(true);
            return;
        }
        if (!referenceResource.referenceChapter) {
            showNotificationInfo({
                notification: {
                    title: t`Reference is loading`,
                    message: t`Try matching formatting again once the reference chapter is visible.`,
                },
            });
            return;
        }
        await actions.matchFormattingChapter();
    };
    const dialogReferenceReady =
        Boolean(referenceResource.activeReferenceResourcePath) &&
        Boolean(referenceResource.referenceChapter);
    const dialogReferenceLoading =
        Boolean(referenceResource.activeReferenceResourcePath) &&
        !referenceResource.referenceChapter;
    const handleConfirmMatchFormatting = async () => {
        if (!dialogReferenceReady) return;
        setPickReferenceDialogOpen(false);
        if (!props.isReferencePaneOpen) {
            props.onToggleReferencePane();
        }
        await actions.matchFormattingChapter();
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

    // The "Content" section of the kebab. Icons + localized labels are minted
    // here because the toolbar owns the marker vocabulary; the kebab is just a
    // renderer. Order mirrors the old top-level marker clusters.
    const markerActions = [
        {
            marker: "p",
            label: markerButtonLabel("p"),
            icon: <Pilcrow size={15} />,
            onSelect: () => handleInsertUsfm("p"),
        },
        {
            marker: "m",
            label: markerButtonLabel("m"),
            icon: <AlignLeft size={15} />,
            onSelect: () => handleInsertUsfm("m"),
        },
        {
            marker: "q1",
            label: markerButtonLabel("q1"),
            icon: <QuoteLevelIcon level={1} />,
            onSelect: () => handleInsertUsfm("q1"),
        },
        {
            marker: "q2",
            label: markerButtonLabel("q2"),
            icon: <QuoteLevelIcon level={2} />,
            onSelect: () => handleInsertUsfm("q2"),
        },
        {
            marker: "v",
            label: markerButtonLabel("v"),
            icon: <Hash size={14} />,
            onSelect: () => handleInsertUsfm("v"),
        },
        {
            marker: "f",
            label: markerButtonLabel("f"),
            icon: <MessageSquare size={14} />,
            onSelect: () => handleInsertUsfm("f"),
        },
    ];

    return (
        <div className={styles.root}>
            <div className={styles.toolbarRow}>
                <div className={styles.leftGroup}>
                    <div
                        className={styles.currentLocation}
                        data-testid={TESTING_IDS.currentLocation}
                    >
                        <span className={styles.currentLocationBook}>
                            {currentBookLabel}
                        </span>
                        <span>{project.pickedChapter?.chapterNumber}</span>
                    </div>
                </div>

                <div className={styles.rightGroup}>
                    {/* Chapter-nav chevrons sit immediately left of the kebab
                        (intentional deviation from the figma). */}
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

                    <ToolbarOverflowMenu
                        onCut={() => {
                            void handleCut();
                        }}
                        onCopy={() => {
                            void handleCopy();
                        }}
                        onPaste={() => {
                            void handlePaste();
                        }}
                        markerActions={markerActions}
                        onMatchFormattingToSource={
                            handleMatchFormattingToSource
                        }
                        onCopyEditorJson={
                            import.meta.env.DEV
                                ? () => void handleCopyEditorJson()
                                : undefined
                        }
                    />

                    <div className={styles.cluster}>
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

                    <div className={styles.cluster}>
                        <FindingsPopover />
                        <CloudStatusPopover
                            buttonState={cloudStatus.buttonState}
                            buttonLabel={cloudStatus.chipLabel}
                            buttonDescription={cloudStatus.detail}
                            buttonAriaLabel={cloudStatus.headline}
                        />
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
                    </div>

                    <button
                        type="button"
                        className={styles.saveButton}
                        onClick={handleOpenSaveReview}
                    >
                        <Save size={16} />
                        <span>{t`Save`}</span>
                    </button>
                </div>
            </div>
            {pickReferenceDialogOpen && typeof document !== "undefined"
                ? createPortal(
                      // biome-ignore lint/a11y/noStaticElementInteractions: dialog overlay
                      <div
                          className={dialogStyles.dialogOverlay}
                          onMouseDown={() => setPickReferenceDialogOpen(false)}
                      >
                          <div
                              className={dialogStyles.dialog}
                              role="alertdialog"
                              aria-modal="true"
                              onMouseDown={(event) => event.stopPropagation()}
                          >
                              <h3
                                  className={dialogStyles.dialogTitle}
                              >{t`Pick a reference text`}</h3>
                              <p className={dialogStyles.dialogBody}>
                                  {t`Choose a scripture reference before matching formatting.`}
                                  <span className={dialogStyles.dialogHint}>
                                      {t`Match formatting can replace paragraph and poetry markers in the current chapter.`}
                                  </span>
                              </p>
                              <ReferencePicker />
                              <div className={dialogStyles.dialogActions}>
                                  <Button
                                      variant="secondary"
                                      onClick={() =>
                                          setPickReferenceDialogOpen(false)
                                      }
                                  >
                                      {t`Cancel`}
                                  </Button>
                                  <Button
                                      variant="primary"
                                      onClick={handleConfirmMatchFormatting}
                                      disabled={!dialogReferenceReady}
                                  >
                                      <span
                                          className={styles.dialogButtonContent}
                                      >
                                          {dialogReferenceLoading ? (
                                              <span
                                                  className={
                                                      styles.dialogSpinner
                                                  }
                                              >
                                                  <Loader2 size={14} />
                                              </span>
                                          ) : null}
                                          {t`Match formatting`}
                                      </span>
                                  </Button>
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </div>
    );
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
