import { Trans, useLingui } from "@lingui/react/macro";
import { GripHorizontal, Move, RotateCcw, X } from "lucide-react";
import type { CSSProperties, HTMLAttributes, RefObject } from "react";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { PopoverDropdown } from "@/app/ui/components/primitives/Popover/Popover.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";
import { SearchControls } from "./SearchControls.tsx";

type SearchPopoverControlsProps = {
    dropdownRef?: RefObject<HTMLDivElement | null>;
    dropdownStyle?: CSSProperties;
    dragHandleProps?: HTMLAttributes<HTMLElement>;
    resizeHandleProps?: HTMLAttributes<HTMLElement>;
    onResetPosition?: () => void;
    isMoved?: boolean;
    isDragging?: boolean;
    isResizing?: boolean;
    onHeaderDoubleClickReset?: () => void;
};

export function SearchPopoverControls({
    dropdownRef,
    dropdownStyle,
    dragHandleProps,
    resizeHandleProps,
    onResetPosition,
    isMoved = false,
    isDragging = false,
    isResizing = false,
    onHeaderDoubleClickReset,
}: SearchPopoverControlsProps = {}) {
    const { search, project, bookCodeToProjectLocalizedTitle } =
        useWorkspaceContext();
    const { t } = useLingui();
    const activeBookCode =
        search.pickedResult?.bibleIdentifier ?? project.pickedFile.bookCode;
    const activeChapter =
        search.pickedResult?.chapNum ??
        project.pickedChapter?.chapterNumber ??
        project.currentChapter;
    const chapterResults = search.results.filter(
        (result) =>
            result.bibleIdentifier === activeBookCode &&
            result.chapNum === activeChapter,
    );
    const chapterTotalMatches = chapterResults.length;
    const chapterMatchIndex = search.pickedResult
        ? chapterResults.findIndex(
              (result) =>
                  result.sid === search.pickedResult?.sid &&
                  result.source === search.pickedResult?.source &&
                  result.sidOccurrenceIndex ===
                      search.pickedResult?.sidOccurrenceIndex,
          )
        : -1;
    const chapterMatchNumber =
        chapterMatchIndex >= 0 ? chapterMatchIndex + 1 : 0;
    const activeBookTitle = bookCodeToProjectLocalizedTitle({
        bookCode: activeBookCode,
    });
    const chapterLabel =
        activeChapter === 0 ? t`Introduction` : String(activeChapter);

    return (
        <PopoverDropdown className={styles.searchPopoverDropdown}>
            <div ref={dropdownRef} style={dropdownStyle}>
                <div
                    data-testid={TESTING_IDS.searchPopoverHeader}
                    className={styles.searchPopoverHeader}
                >
                    <button
                        type="button"
                        aria-label={t`Drag search panel`}
                        className={`${styles.searchPopoverHeaderInfo} ${styles.searchPopoverDragHandle} ${isDragging ? styles.searchPopoverDragging : ""}`}
                        onDoubleClick={onHeaderDoubleClickReset}
                        {...dragHandleProps}
                    >
                        <GripHorizontal
                            size={14}
                            className={styles.searchPopoverGripIcon}
                        />
                        <span className={styles.searchPopoverTitle}>
                            <Trans>Search</Trans>
                        </span>
                        <span className={styles.searchPopoverHelpText}>
                            <Trans>
                                Match {chapterMatchNumber} of{" "}
                                {chapterTotalMatches} in {activeBookTitle}{" "}
                                {chapterLabel}
                            </Trans>
                        </span>
                    </button>
                    <div className={styles.searchPopoverHeaderActions}>
                        {isMoved ? (
                            <button
                                type="button"
                                data-testid={
                                    TESTING_IDS.searchResetPositionButton
                                }
                                data-no-drag="true"
                                className={styles.searchPopoverAction}
                                onClick={onResetPosition}
                                aria-label={t`Reset position`}
                            >
                                <RotateCcw size={16} />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            data-no-drag="true"
                            className={styles.searchPopoverAction}
                            onClick={() => search.setIsSearchPaneOpen(false)}
                            aria-label={t`Close search`}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div
                    data-js={DATA_JS.searchPopoverContent}
                    className={styles.searchPopoverBody}
                >
                    <SearchControls />
                    <button
                        type="button"
                        data-testid={TESTING_IDS.searchResizeHandle}
                        data-no-drag="true"
                        aria-label={t`Resize search panel`}
                        className={`${styles.searchPopoverResizeHandle} ${isResizing ? styles.searchPopoverResizeHandleActive : ""}`}
                        {...resizeHandleProps}
                    >
                        <Move
                            size={11}
                            className={styles.searchPopoverResizeIcon}
                        />
                    </button>
                </div>
            </div>
        </PopoverDropdown>
    );
}
