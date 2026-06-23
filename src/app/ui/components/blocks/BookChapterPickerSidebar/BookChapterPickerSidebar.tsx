import { ScrollArea } from "@base-ui/react/scroll-area";
import { useLingui } from "@lingui/react/macro";
import {
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { DATA_JS } from "@/app/data/constants.ts";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

import * as styles from "./bookChapterPickerSidebar.css.ts";

type SidebarBook = {
  title: string;
  bookCode: string;
  chapters: Array<{ chapterNumber: number }>;
  sortedChapters: Array<{ chapterNumber: number }>;
};

type SidebarChapter = {
  chapterNumber: number;
};

export function BookChapterPickerSidebar() {
  const { t } = useLingui();
  const { actions, bookCodeToProjectLocalizedTitle, project, search } =
    useWorkspaceContext();
  const [screen, setScreen] = useState<"books" | "chapters">("books");
  const [selectedBookCode, setSelectedBookCode] = useState(
    project.pickedFile.bookCode,
  );

  const books = useMemo<SidebarBook[]>(() => {
    return project.workingFiles.map((file) => ({
      title: bookCodeToProjectLocalizedTitle({
        bookCode: file.bookCode,
      }),
      bookCode: file.bookCode,
      chapters: file.chapters,
      sortedChapters: file.chapters
        .slice()
        .sort((a, b) => a.chapterNumber - b.chapterNumber),
    }));
  }, [bookCodeToProjectLocalizedTitle, project.workingFiles]);

  const activeBook =
    books.find((file) => file.bookCode === selectedBookCode) ?? books[0];

  useEffect(() => {
    setSelectedBookCode(project.pickedFile.bookCode);
  }, [project.pickedFile.bookCode]);

  function handleSelectBook(bookCode: string) {
    setSelectedBookCode(bookCode);
    setScreen("chapters");
  }

  function handleSelectChapter(chapterNumber: number) {
    if (!activeBook) return;
    actions.switchBookOrChapter(activeBook.bookCode, chapterNumber);
  }

  // Open the search pane and focus its input. The pane mounts on the next
  // frame (driven by `isSearchPaneOpen`), so the focus is deferred — same
  // pattern as the Cmd/Ctrl+F shortcut in `useEditorInput`.
  function handleOpenSearch() {
    if (!search.isSearchPaneOpen) {
      search.setIsSearchPaneOpen(true);
    }
    requestAnimationFrame(() => {
      const input = document.querySelector(
        `[data-js="${DATA_JS.searchInput}"]`,
      );
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    });
  }

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.findButton}
        onClick={handleOpenSearch}
      >
        <SearchIcon size={16} className={styles.findButtonIcon} />
        <span>{t`Find`}</span>
      </button>
      <div className={styles.viewport}>
        <BooksPanel
          books={books}
          currentBookCode={project.pickedFile.bookCode}
          isVisible={screen === "books"}
          onSelectBook={handleSelectBook}
        />

        <ChaptersPanel
          activeBook={activeBook}
          currentBookCode={project.pickedFile.bookCode}
          currentChapterNumber={
            project.pickedChapter?.chapterNumber ?? project.currentChapter
          }
          isVisible={screen === "chapters"}
          backLabel={t`Back to books`}
          chooseChapterLabel={t`Choose a chapter`}
          emptyStateLabel={t`No chapters available.`}
          introLabel={t`Intro`}
          onBack={() => setScreen("books")}
          onSelectChapter={handleSelectChapter}
        />
      </div>
    </div>
  );
}

function BooksPanel(props: {
  books: SidebarBook[];
  currentBookCode: string;
  isVisible: boolean;
  onSelectBook: (bookCode: string) => void;
}) {
  const rows = props.books.map((book) => (
    <BookRow
      key={book.bookCode}
      book={book}
      isActive={book.bookCode === props.currentBookCode}
      onSelect={props.onSelectBook}
    />
  ));

  return (
    <SidebarPanel
      isVisible={props.isVisible}
      hiddenClassName={styles.panelHiddenLeft}
    >
      <SidebarScrollArea>
        <div className={styles.bookList}>{rows}</div>
      </SidebarScrollArea>
    </SidebarPanel>
  );
}

function BookRow(props: {
  book: SidebarBook;
  isActive: boolean;
  onSelect: (bookCode: string) => void;
}) {
  const className = joinClassNames(
    styles.bookRow,
    props.isActive ? styles.bookRowActive : undefined,
  );

  function handleBookSelect() {
    props.onSelect(props.book.bookCode);
  }

  return (
    <button type="button" className={className} onClick={handleBookSelect}>
      <span className={styles.bookRowLead}>
        <span className={styles.bookIcon}>
          <BookIcon size={16} />
        </span>
        <span className={styles.bookTitle}>{props.book.title}</span>
      </span>
      <ChevronRightIcon size={16} className={styles.chevron} />
    </button>
  );
}

function ChaptersPanel(props: {
  activeBook?: SidebarBook;
  currentBookCode: string;
  currentChapterNumber: number;
  isVisible: boolean;
  backLabel: string;
  chooseChapterLabel: string;
  emptyStateLabel: string;
  introLabel: string;
  onBack: () => void;
  onSelectChapter: (chapterNumber: number) => void;
}) {
  const rows = buildChapterRows({
    activeBook: props.activeBook,
    currentBookCode: props.currentBookCode,
    currentChapterNumber: props.currentChapterNumber,
    introLabel: props.introLabel,
    onSelectChapter: props.onSelectChapter,
  });

  return (
    <SidebarPanel
      isVisible={props.isVisible}
      hiddenClassName={styles.panelHiddenRight}
    >
      <ChapterHeader
        title={props.activeBook?.title ?? ""}
        backLabel={props.backLabel}
        subtitle={props.chooseChapterLabel}
        onBack={props.onBack}
      />

      <SidebarScrollArea>
        <div className={styles.chapterList}>
          {rows.length ? (
            rows
          ) : (
            <div className={styles.emptyState}>{props.emptyStateLabel}</div>
          )}
        </div>
      </SidebarScrollArea>
    </SidebarPanel>
  );
}

function ChapterHeader(props: {
  title: string;
  subtitle: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className={styles.chapterHeader}>
      <IconTooltip label={props.backLabel}>
        <button
          type="button"
          className={styles.backButton}
          onClick={props.onBack}
          aria-label={props.backLabel}
        >
          <ChevronLeftIcon size={16} />
        </button>
      </IconTooltip>
      <div className={styles.chapterHeaderText}>
        <div className={styles.chapterHeaderTitle}>{props.title}</div>
        <div className={styles.chapterHeaderMeta}>{props.subtitle}</div>
      </div>
    </div>
  );
}

function ChapterRow(props: {
  title: string;
  chapter: SidebarChapter;
  isActive: boolean;
  introLabel: string;
  onSelect: (chapterNumber: number) => void;
}) {
  const className = joinClassNames(
    styles.chapterRow,
    props.isActive ? styles.chapterRowActive : undefined,
  );
  const chapterLabel =
    props.chapter.chapterNumber === 0
      ? props.introLabel
      : props.chapter.chapterNumber;

  function handleChapterSelect() {
    props.onSelect(props.chapter.chapterNumber);
  }

  return (
    <button type="button" className={className} onClick={handleChapterSelect}>
      <span className={styles.chapterRowBook}>{props.title}</span>
      <span className={styles.chapterRowNumber}>{chapterLabel}</span>
    </button>
  );
}

function SidebarPanel(props: {
  isVisible: boolean;
  hiddenClassName: string;
  children: ReactNode;
}) {
  const className = joinClassNames(
    styles.panel,
    props.isVisible ? styles.panelVisible : props.hiddenClassName,
  );

  return (
    <section className={className} aria-hidden={!props.isVisible}>
      {props.children}
    </section>
  );
}

function SidebarScrollArea(props: { children: ReactNode }) {
  return (
    <ScrollArea.Root className={styles.scrollAreaRoot}>
      <ScrollArea.Viewport className={styles.scrollAreaViewport}>
        <ScrollArea.Content className={styles.scrollAreaContent}>
          {props.children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className={styles.scrollAreaScrollbar}
      >
        <ScrollArea.Thumb className={styles.scrollAreaThumb} />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

function buildChapterRows(input: {
  activeBook?: SidebarBook;
  currentBookCode: string;
  currentChapterNumber: number;
  introLabel: string;
  onSelectChapter: (chapterNumber: number) => void;
}) {
  const { activeBook } = input;

  if (!activeBook) {
    return [];
  }

  return activeBook.sortedChapters.map((chapter) => (
    <ChapterRow
      key={chapter.chapterNumber}
      title={activeBook.title}
      chapter={chapter}
      isActive={
        activeBook.bookCode === input.currentBookCode &&
        chapter.chapterNumber === input.currentChapterNumber
      }
      introLabel={input.introLabel}
      onSelect={input.onSelectChapter}
    />
  ));
}
