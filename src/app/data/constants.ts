import type { Platform } from "@tauri-apps/plugin-os";

export type PlatformAndWeb = Platform | "web";

export const TESTING_IDS = {
    import: {
        importer: "file-importer",
    },
    project: {
        list: "project-list",
    },
    mainEditorContainer: "main-editor-container",
    referenceProjectPanel: "reference-project-panel",
    referenceProjectTrigger: "reference-project-trigger",
    referenceProjectDropdown: "reference-project-dropdown",
    referenceProjectClear: "reference-project-clear",
    referenceProjectItem: "reference-project-item",
    refEditorContainer: "ref-editor-container",
    searchInput: "search-input",
    searchPrevButton: "search-prev-button",
    searchNextButton: "search-next-button",
    matchCaseCheckbox: "search-match-case-checkbox",
    matchWholeWordCheckbox: "search-match-whole-word-checkbox",
    replaceInput: "search-replace-input",
    replaceButton: "search-replace-button",
    replaceAllButton: "search-replace-all-button",
    sortToggleButton: "search-sort-toggle-button",
    searchResultsContainer: "search-results-container",
    searchResultItem: "search-result-item",
    searchTrigger: "search-trigger",
    searchStats: "search-stats",
    searchCaseMismatchLabel: "search-case-mismatch-label",
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
        newVerseLabel: "save-diff-new-verse-label",
        deletedVerseLabel: "save-diff-deleted-verse-label",
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
} as const;
