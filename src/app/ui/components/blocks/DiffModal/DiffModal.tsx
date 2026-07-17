import { DiffViewerModal } from "@/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx";
import { navigateEditorToSid } from "@/app/ui/hooks/navigateEditorToSid.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { parseSid } from "@/core/data/bible/bible.ts";

/** Bind the workspace's symmetric comparison session to the Option C shell. */
export function SaveAndReviewChangesOverlay() {
  const { save, actions, editorRef } = useWorkspaceContext();

  return (
    <DiffViewerModal
      state={save.diff.state}
      onClose={save.diff.close}
      onRefresh={save.diff.refresh}
      onApply={save.diff.apply}
      onUnitDecision={save.diff.setUnitDecision}
      onPresenceDecision={save.diff.setPresenceDecision}
      onChapterDecision={save.diff.stampChapter}
      onGlobalDecision={save.diff.stampAll}
      onNavigate={({ address, sid }) => {
        void save.diff.close();
        const parsed = parseSid(sid);
        const isOwnedSingleVerse =
          parsed !== null &&
          !parsed.isBookChapOnly &&
          parsed.book === address.bookCode &&
          parsed.chapter === address.chapterNum &&
          parsed.verseStart === parsed.verseEnd &&
          parsed.verseStart > 0;

        if (isOwnedSingleVerse) {
          navigateEditorToSid({
            editorRef,
            switchBookOrChapter: actions.switchBookOrChapter,
            sid,
          });
        } else {
          actions.switchBookOrChapter(address.bookCode, address.chapterNum);
        }
      }}
      availableProjects={save.compare.availableProjects}
      versionOptions={save.compare.versionOptions}
      onSelectWorking={save.compare.selectWorking}
      onSelectSaved={save.compare.selectSaved}
      onSelectProject={save.compare.selectProject}
      onSelectVersion={save.compare.selectVersion}
      onSelectRemote={save.compare.selectRemote}
      onSelectZip={save.compare.selectZip}
      onSelectDirectory={save.compare.selectDirectory}
      buildPrintChanges={save.compare.buildPrintChanges}
      printCheckpoints={save.compare.printCheckpoints}
    />
  );
}
