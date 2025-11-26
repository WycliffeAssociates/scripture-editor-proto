import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  rem,
  ScrollArea,
  Text,
  Tooltip,
} from "@mantine/core";
import type { Change } from "diff";
import { BookIcon, RotateCw, Save } from "lucide-react";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import type { ProjectDiff } from "@/app/ui/hooks/useSave.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

type HighlightedDiffProps = {
  changes: Change[];
  viewType: "original" | "current";
};

function HighlightedDiffText({ changes, viewType }: HighlightedDiffProps) {
  return (
    <pre className={styles.diffPre}>
      {changes.map((change, index) => {
        let spanClass = "";
        if (change.added && viewType === "current") {
          spanClass = styles.diffHighlightAdded;
        } else if (change.removed && viewType === "original") {
          spanClass = styles.diffHighlightRemoved;
        } else if (change.added || change.removed) {
          return null;
        }

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: <only id we have>
          <span key={index} className={spanClass}>
            {change.value}
          </span>
        );
      })}
    </pre>
  );
}

type DiffItemProps = {
  diff: ProjectDiff;
  revertDiff: (diffToRevert: ProjectDiff) => void;
  switchBookOrChapter: (fileBibleIdentifier: string, chapter: number) => void;
  toggleDiffModal: () => void;
};

export function DiffItem({
  diff,
  revertDiff,
  switchBookOrChapter,
  toggleDiffModal,
}: DiffItemProps) {
  const { isSm, isLg } = useWorkspaceMediaQuery();
  const isAddition = diff.original === null;
  const isDeletion = diff.current === null;
  const isModification = !isAddition && !isDeletion;

  function scrollToClickedRef(diff: ProjectDiff) {
    switchBookOrChapter(diff.bookCode, diff.chapterNum);
    toggleDiffModal();

    setTimeout(() => {
      const domEls = [
        ...document.querySelectorAll(`[data-sid="${diff.semanticSid}"]`),
      ] as HTMLElement[];
      const first = domEls[0];
      if (domEls.length > 0) {
        domEls.forEach((el) => {
          el.style.backgroundColor = "yellow";
        });
      }
      first?.scrollIntoView({
        behavior: "smooth",
      });
      setTimeout(() => {
        if (domEls.length > 0) {
          domEls.forEach((el) => {
            el.style.backgroundColor = "";
          });
        }
      }, 2000);
    }, 500);
  }

  // Helper to generate class string without clsx
  const getPaperClass = (isHighlighted: boolean, highlightClass: string) => {
    return `${styles.paperMinHeight} ${isHighlighted ? highlightClass : styles.paperBgDefault}`;
  };

  const renderActions = () => (
    <Group>
      {isSm ? (
        <>
          <Tooltip
            label={<Trans>Switch to this chapter</Trans>}
            withArrow
            position="top"
          >
            <ActionIconSimple
              onClick={() => scrollToClickedRef(diff)}
              aria-label={t`Switch to this chapter`}
              title={t`Switch to this chapter`}
            >
              <BookIcon size={16} />
            </ActionIconSimple>
          </Tooltip>
          <Tooltip label={<Trans>Undo Change</Trans>} withArrow position="top">
            <ActionIconSimple
              onClick={() => revertDiff(diff)}
              aria-label={t`Undo Change`}
              title={t`Undo Change`}
            >
              <RotateCw size={16} />
            </ActionIconSimple>
          </Tooltip>
        </>
      ) : (
        <>
          <Button
            variant="outline"
            size="compact-xs"
            onClick={() => scrollToClickedRef(diff)}
          >
            <Trans>Switch to this chapter</Trans>
          </Button>
          <Button
            variant="outline"
            size="compact-xs"
            onClick={() => revertDiff(diff)}
          >
            <Trans>Undo Change</Trans>
          </Button>
        </>
      )}
    </Group>
  );

  return (
    <div className={styles.diffItem}>
      <Group justify="space-between" p="xs">
        <Text className={styles.diffSidHeader}>{diff.semanticSid}</Text>
        {diff.detail && (
          <Text className={styles.diffDetailWarning}>{diff.detail}</Text>
        )}
      </Group>

      {isLg ? (
        <Grid
          gutter="md"
          classNames={{
            inner: styles.diffGrid,
          }}
        >
          {/* --- ORIGINAL (LEFT) COLUMN --- */}
          <Grid.Col>
            <Group justify="space-between" mb="xs" mih={rem(30)}>
              <Text className={styles.diffLabel}>
                <Trans>Original</Trans>
              </Text>
              {renderActions()}
            </Group>
            <Paper
              p="xs"
              className={getPaperClass(isDeletion, styles.paperBgDeletion)}
            >
              {isAddition && (
                <Text className={styles.versePlaceholder}>
                  <Trans>(New verse)</Trans>
                </Text>
              )}
              {isDeletion && (
                <pre className={styles.diffPre}>{diff.originalDisplayText}</pre>
              )}
              {isModification && diff.wordDiff && (
                <HighlightedDiffText
                  changes={diff.wordDiff}
                  viewType="original"
                />
              )}
            </Paper>
          </Grid.Col>

          {/* --- CURRENT (RIGHT) COLUMN --- */}
          <Grid.Col>
            <Group justify="space-between" mb="xs" mih={rem(30)}>
              <Text className={styles.diffLabel} mb="xs">
                <Trans>Current</Trans>
              </Text>
            </Group>
            <Paper
              p="xs"
              className={getPaperClass(isAddition, styles.paperBgAddition)}
            >
              {isDeletion && (
                <Text className={styles.versePlaceholder}>
                  <Trans>(Verse deleted)</Trans>
                </Text>
              )}
              {isAddition && (
                <pre className={styles.diffPre}>{diff.currentDisplayText}</pre>
              )}
              {isModification && diff.wordDiff && (
                <HighlightedDiffText
                  changes={diff.wordDiff}
                  viewType="current"
                />
              )}
            </Paper>
          </Grid.Col>
        </Grid>
      ) : (
        // Stacked vertical layout for smaller screens
        <div className={styles.diffStacked} style={{ padding: "12px" }}>
          <div>
            <Group justify="space-between" mb="xs">
              <Text className={styles.diffLabel}>
                <Trans>Original</Trans>
              </Text>
              {renderActions()}
            </Group>
            <Paper
              p="xs"
              className={getPaperClass(isDeletion, styles.paperBgDeletion)}
            >
              {isAddition && (
                <Text className={styles.versePlaceholder}>
                  <Trans>(New verse)</Trans>
                </Text>
              )}
              {isDeletion && (
                <pre className={styles.diffPre}>{diff.originalDisplayText}</pre>
              )}
              {isModification && diff.wordDiff && (
                <HighlightedDiffText
                  changes={diff.wordDiff}
                  viewType="original"
                />
              )}
            </Paper>
          </div>

          <div>
            <Text className={styles.diffLabel} mb="xs">
              <Trans>Current</Trans>
            </Text>
            <Paper
              p="xs"
              className={getPaperClass(isAddition, styles.paperBgAddition)}
            >
              {isDeletion && (
                <Text className={styles.versePlaceholder}>
                  <Trans>(Verse deleted)</Trans>
                </Text>
              )}
              {isAddition && (
                <pre className={styles.diffPre}>{diff.currentDisplayText}</pre>
              )}
              {isModification && diff.wordDiff && (
                <HighlightedDiffText
                  changes={diff.wordDiff}
                  viewType="current"
                />
              )}
            </Paper>
          </div>
        </div>
      )}
    </div>
  );
}

// ... The rest of the file (DiffViewerModal, SaveAndReviewChanges) remains mostly unchanged
// except for applying styles.modalScrollPaper, styles.stickyHeader etc.
// which simply replace the style={{...}} props.

type DiffViewerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  diffs: ProjectDiff[] | null;
  isCalculating: boolean;
  revertDiff: (diffToRevert: ProjectDiff) => void;
};

function DiffViewerModal({
  isOpen,
  onClose,
  diffs,
  isCalculating,
  revertDiff,
}: DiffViewerModalProps) {
  const hasChanges = diffs && diffs.length > 0;
  const { actions, saveDiff } = useWorkspaceContext();

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t`Review Changes Before Saving`}
      size="95%"
      centered
    >
      <Paper p="sm" className={styles.modalScrollPaper}>
        <div className={styles.stickyHeader}>
          <Button
            variant="light"
            size="xs"
            onClick={saveDiff.saveProjectToDisk}
            className={styles.saveAllButtonMargin}
          >
            <Trans>Save all changes</Trans>
          </Button>
        </div>

        <ScrollArea className={styles.diffScrollArea}>
          <div className={styles.fullHeight}>
            {isCalculating && (
              <Center className={styles.fullHeight}>
                <Loader />
              </Center>
            )}

            {!isCalculating && !hasChanges && (
              <Center className={styles.fullHeight}>
                <Text>
                  <Trans>No changes detected.</Trans>
                </Text>
              </Center>
            )}

            {!isCalculating && hasChanges && (
              <div>
                {diffs.map((diff) => (
                  <DiffItem
                    key={diff.semanticSid}
                    diff={diff}
                    revertDiff={revertDiff}
                    switchBookOrChapter={actions.switchBookOrChapter}
                    toggleDiffModal={actions.toggleDiffModal}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </Paper>
    </Modal>
  );
}

export function SaveAndReviewChanges() {
  const { t } = useLingui();
  const { saveDiff, actions } = useWorkspaceContext();
  const { isXs, isSm } = useWorkspaceMediaQuery();

  return (
    <>
      <DiffViewerModal
        isOpen={saveDiff.openDiffModal}
        onClose={saveDiff.closeModal}
        diffs={saveDiff.diffs}
        isCalculating={false}
        revertDiff={saveDiff.handleRevert}
      />

      {isXs || isSm ? (
        <Tooltip
          label={<Trans>Review and save changes</Trans>}
          withArrow
          position="top"
        >
          <ActionIconSimple
            onClick={actions.toggleDiffModal}
            aria-label={t`Review and save changes`}
            title={t`Review and save changes`}
          >
            <Save size={16} />
          </ActionIconSimple>
        </Tooltip>
      ) : (
        <Button color="primary.7" onClick={actions.toggleDiffModal}>
          <Trans>Review &amp; Save</Trans>
        </Button>
      )}
    </>
  );
}
