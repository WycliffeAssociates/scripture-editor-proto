import type { Platform } from "@tauri-apps/plugin-os";

export type PlatformAndWeb = Platform | "web";

export const TESTING_IDS = {
    import: {
        importer: "file-importer",
        dirImporter: "dir-importer",
    },
    project: {
        list: "project-list",
        rowLink: "project-row-link",
        nameInput: "project-name-input",
        saveName: "save-project-name",
        delete: "delete-project",
        deleteConfirm: "delete-project-confirm",
        listItemButton: "project-list-item-button",
        editButton: "edit-project-btn",
    },
    language: {
        apiImporter: "language-api-importer",
        importerDownload: "language-importer-download",
        importerClear: "language-importer-clear",
    },
    mainEditorContainer: "main-editor-container",
    referenceProjectPanel: "reference-project-panel",
    referenceProjectTrigger: "reference-project-trigger",
    referenceProjectDropdown: "reference-project-dropdown",
    referenceProjectClear: "reference-project-clear",
    referenceProjectItem: "reference-project-item",
    refEditorContainer: "ref-editor-container",
    referencePicker: "reference-picker",
    searchInput: "search-input",
    searchRunButton: "search-run-button",
    searchPrevButton: "search-prev-button",
    searchNextButton: "search-next-button",
    matchCaseCheckbox: "search-match-case-checkbox",
    matchWholeWordCheckbox: "search-match-whole-word-checkbox",
    includeUSFMMarkersCheckbox: "search-include-usfm-markers-checkbox",
    replaceInput: "search-replace-input",
    replaceButton: "search-replace-button",
    replaceAllButton: "search-replace-all-button",
    sortToggleButton: "search-sort-toggle-button",
    searchResultsContainer: "search-results-container",
    searchResultItem: "search-result-item",
    searchTrigger: "search-trigger",
    searchStats: "search-stats",
    searchCaseMismatchLabel: "search-case-mismatch-label",
    searchInlineReplaceTrigger: "search-inline-replace-trigger",
    searchInlineReplaceButton: "search-inline-replace-button",
    searchReferenceToggle: "search-reference-toggle",
    searchResetPositionButton: "search-reset-position-button",
    searchPopoverHeader: "search-popover-header",
    searchResizeHandle: "search-resize-handle",
    appDrawer: {
        projectsList: "app-drawer-projects-list",
        itemExport: "project-list-item-export",
        itemOpen: "project-list-item-open",
        newProject: "project-list-item-new",
    },
    save: {
        trigger: "save-review-trigger",
        modal: "save-diff-modal",
        saveAllButton: "save-all-changes-button",
        noChangesMessage: "save-no-changes-message",
        diffList: "save-diff-list",
        diffItem: "save-diff-item",
        diffSidHeader: "save-diff-sid-header",
        diffOriginalPanel: "save-diff-original-panel",
        diffCurrentPre: "save-diff-current-pre",
        diffCurrentPanel: "save-diff-current-panel",
        goToChapterButton: "save-diff-go-to-button",
        revertButton: "save-diff-revert-button",
        toggleRowUsfmButton: "save-diff-toggle-row-usfm-button",
        chapterPanel: "save-diff-chapter-panel",
        chapterHunkAction: "save-diff-chapter-hunk-action",
        revertAllButton: "revert-all-button",
        newVerseLabel: "save-diff-new-verse-label",
        deletedVerseLabel: "save-diff-deleted-verse-label",
    },
    versions: {
        trigger: "versions-trigger",
        modal: "versions-modal",
        row: "versions-row",
        backToLatest: "versions-back-to-latest",
        loadMore: "versions-load-more",
        dirtyPrompt: "versions-dirty-prompt",
        dirtyPromptSave: "versions-dirty-save",
        dirtyPromptDiscard: "versions-dirty-discard",
        dirtyPromptCancel: "versions-dirty-cancel",
    },
    settings: {
        drawerOpenButton: "drawer-open-button",
        accordionControlProjects: "settings-accordion-control-projects",
        accordionControlSettings: "settings-accordion-settings",
        themeToggle: "display-theme-toggle",
        fontSizeInput: "font-size-input",
        fontSizeIncrement: "font-size-increment",
        fontSizeDecrement: "font-size-decrement",
        languageSelector: "language-selector",
        languageSelectorLabel: "language-selector-label",
    },
    contextMenu: {
        container: "context-menu-container",
        searchInput: "context-menu-search-input",
        searchAction: "context-menu-search-action",
    },
    lintPopover: {
        container: "lint-popover-container",
        triggerButton: "lint-popover-trigger-button",
        errorItem: "lint-popover-error-item",
        errorMessage: "lint-popover-error-message",
        errorSid: "lint-popover-error-sid",
    },
    mobile: {
        mainEditorTab: "mobile-main-editor-tab",
        referenceEditorTab: "mobile-reference-editor-tab",
    },
    navigation: {
        prevChapterButton: "prev-chapter-button",
        prevChapterButtonHidden: "prev-chapter-button-hidden",
        nextChapterButton: "next-chapter-button",
        nextChapterButtonHidden: "next-chapter-button-hidden",
    },
    reference: {
        booksAccordion: "reference-books-accordion",
        bookControl: "book-control",
        chapterAccordionButton: "chapter-accordion-button",
        pickerSearchInput: "reference-picker-search-input",
        stickyNav: "reference-sticky-nav",
        stickyPicker: "reference-sticky-picker",
        syncNavigationToggle: "reference-sync-navigation-toggle",
        syncScrollingToggle: "reference-sync-scrolling-toggle",
        prevButton: "reference-prev-button",
        nextButton: "reference-next-button",
    },
    onboarding: {
        mainLayout: "main-layout",
        sidebar: "sidebar",
        fileBrowserButton: "file-browser-button",
        recentProjectsList: "recent-projects-list",
        newProjectButton: "new-project-button",
        editorArea: "editor-area",
        toolbar: "toolbar",
        formattingPalette: "formatting-palette",
        searchButton: "search-button",
        replaceButton: "replace-button",
        saveButton: "save-button",
        exportButton: "export-button",
    },
    prettify: {
        projectButton: "prettify-project-button",
    },
} as const;

// Dynamic test ID generators
export const TEST_ID_GENERATORS = {
    projectListItem: (name: string) =>
        `project-list-item-${name.toLowerCase().replace(/\s+/g, "-")}`,

    bookChapterBtn: (book: string, chap: number) =>
        `book-control-${book.toLowerCase()}-${chap}`,

    projectListGroup: (langName: string) =>
        `project-list-${langName.toLowerCase()}`,

    bookChapterPanel: (bookCode: string) =>
        `book-${bookCode.toLowerCase()}-chapters`,

    bookTitle: (bookCode: string) =>
        `book-control-title-${bookCode.toLowerCase()}`,

    diffCurrentPre: (viewType: "original" | "current") =>
        `save-diff-current-pre-${viewType}`,
} as const;
