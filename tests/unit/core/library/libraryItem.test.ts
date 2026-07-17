import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  LibraryItem,
  UsfmScriptureItem,
  TranslationNotesItem,
  LibraryItemType,
  ContainerFormat,
  LibraryItemBase,
  RemoteSyncCapability,
  AnchorNavigationCapability,
} from "@/core/library/LibraryItem.ts";
import {
  isUsfmScriptureItem,
  isTranslationNotesItem,
  isEditableItem,
  isRemoteSyncCapable,
  isAnchorNavigationCapable,
} from "@/core/library/LibraryItem.ts";

function makeScriptureItem(
  overrides: Partial<UsfmScriptureItem> = {},
): UsfmScriptureItem {
  return {
    folderName: "en_ult",
    displayName: "English Ultra Literal",
    projectPath: "/library/en_ult",
    projectId: "en_ult",
    projectType: "resource-container",
    books: [],
    language: { code: "en", name: "English", direction: "ltr" },
    listBooks: async () => [],
    getBook: async () => ({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: "/library/en_ult/41-MAT.usfm",
      contents: "\\id MAT\n",
    }),
    saveBook: async () => {},
    addBook: async () => ({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: "/library/en_ult/41-MAT.usfm",
    }),
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "abc123" }),
    id: "en_ult",
    managedPath: "/library/en_ult",
    containerFormat: "resource-container",
    capabilities: { editableWith: "usfmScripture" },
    type: "usfmScripture",
    readWorkspace: async () => ({ bookCode: "MAT", usfmContents: "" }),
    readBook: async () => null,
    ...overrides,
    removeBook: overrides.removeBook ?? (async () => {}),
  };
}

function makeTranslationNotesItem(
  overrides: Partial<TranslationNotesItem> = {},
): TranslationNotesItem {
  return {
    id: "en_tn",
    displayName: "English Translation Notes",
    managedPath: "/library/en_tn",
    containerFormat: "resource-container",
    language: { code: "en", name: "English", direction: "ltr" },
    capabilities: {},
    type: "translationNotes",
    listBookCodes: async () => [],
    readBook: async () => null,
    readChapter: async () => null,
    ...overrides,
  };
}

describe("LibraryItem type definitions", () => {
  it("defines LibraryItemType as the discriminated union", () => {
    const scriptureType: LibraryItemType = "usfmScripture";
    const tnType: LibraryItemType = "translationNotes";

    expect(scriptureType).toBe("usfmScripture");
    expect(tnType).toBe("translationNotes");
  });

  it("defines ContainerFormat as storage metadata only", () => {
    const rcFormat: ContainerFormat = "resource-container";
    const sbFormat: ContainerFormat = "scripture-burrito";

    expect(rcFormat).toBe("resource-container");
    expect(sbFormat).toBe("scripture-burrito");
  });

  it("defines LibraryItemBase with all required fields", () => {
    const base: LibraryItemBase = {
      id: "en_ult",
      displayName: "English Ultra Literal",
      managedPath: "/library/en_ult",
      containerFormat: "resource-container",
      language: {
        code: "en",
        name: "English",
        direction: "ltr",
      },
      capabilities: {},
    };

    expectTypeOf(base).toEqualTypeOf<LibraryItemBase>();
    expect(base.id).toBe("en_ult");
    expect(base.containerFormat).toBe("resource-container");
  });

  it("defines UsfmScriptureItem with type-specific verbs", () => {
    const scriptureItem: UsfmScriptureItem = makeScriptureItem({
      readWorkspace: async () => ({
        bookCode: "MAT",
        usfmContents: "\\id MAT\n\\c 1\n",
      }),
      readBook: async (bookCode) => {
        expect(bookCode).toBe("MAT");
        return { bookCode: "MAT", usfmContents: "\\id MAT\n" };
      },
    });

    expectTypeOf(scriptureItem).toEqualTypeOf<UsfmScriptureItem>();
    expect(scriptureItem.type).toBe("usfmScripture");
    expectTypeOf(scriptureItem.readBook).parameters.toEqualTypeOf<
      [bookCode: string]
    >();
  });

  it("defines TranslationNotesItem with TN-specific verbs", () => {
    const tnItem: TranslationNotesItem = makeTranslationNotesItem({
      listBookCodes: async () => ["MAT", "MRK"],
      readBook: async (bookCode) => {
        expect(bookCode).toBe("MAT");
        return {
          bookCode: "MAT",
          chapters: [
            {
              chapterNumber: 1,
              verses: [
                { verseNumber: 1, rawMarkdown: "The **birth** of Jesus." },
              ],
            },
          ],
        };
      },
      readChapter: async (bookCode, chapterNumber) => {
        expect(bookCode).toBe("MAT");
        expect(chapterNumber).toBe(1);
        return { "1": "The **birth** of Jesus." };
      },
    });

    expectTypeOf(tnItem).toEqualTypeOf<TranslationNotesItem>();
    expect(tnItem.type).toBe("translationNotes");
    expectTypeOf(tnItem.readChapter).parameters.toEqualTypeOf<
      [bookCode: string, chapterNumber: number]
    >();
  });

  it("creates a valid LibraryItem discriminated union", () => {
    const scriptureItem: LibraryItem = makeScriptureItem();
    const tnItem: LibraryItem = makeTranslationNotesItem();

    expectTypeOf(scriptureItem).toMatchTypeOf<LibraryItem>();
    expectTypeOf(tnItem).toMatchTypeOf<LibraryItem>();
  });

  it("type guards correctly narrow the union", () => {
    const scriptureItem: LibraryItem = makeScriptureItem();
    const tnItem: LibraryItem = makeTranslationNotesItem();

    expect(isUsfmScriptureItem(scriptureItem)).toBe(true);
    expect(isUsfmScriptureItem(tnItem)).toBe(false);
    expect(isTranslationNotesItem(tnItem)).toBe(true);
    expect(isTranslationNotesItem(scriptureItem)).toBe(false);
  });

  it("capability model supports remote sync", () => {
    const remoteSyncCap: RemoteSyncCapability = {
      kind: "remoteSync",
      source: {
        kind: "git",
        identifier: "https://github.com/example/repo.git",
        ref: "main",
      },
      applyUpdate: async () => {},
    };

    expectTypeOf(remoteSyncCap).toEqualTypeOf<RemoteSyncCapability>();
    expect(remoteSyncCap.kind).toBe("remoteSync");
    expect(remoteSyncCap.source.kind).toBe("git");
  });

  it("capability model supports anchor navigation", () => {
    const anchorCap: AnchorNavigationCapability = {
      kind: "anchorNavigation",
    };

    expectTypeOf(anchorCap).toEqualTypeOf<AnchorNavigationCapability>();
    expect(anchorCap.kind).toBe("anchorNavigation");
  });

  it("capabilities compose on LibraryItemBase", () => {
    const fullyCapableItem: UsfmScriptureItem = makeScriptureItem({
      capabilities: {
        editableWith: "usfmScripture",
        remoteSync: {
          kind: "remoteSync",
          source: { kind: "git", identifier: "repo.git" },
          applyUpdate: async () => {},
        },
        anchorNavigation: { kind: "anchorNavigation" },
      },
    });

    expect(fullyCapableItem.capabilities.editableWith).toBe("usfmScripture");
    expect(fullyCapableItem.capabilities.remoteSync?.kind).toBe("remoteSync");
    expect(fullyCapableItem.capabilities.anchorNavigation?.kind).toBe(
      "anchorNavigation",
    );
  });

  it("UsfmScriptureItem verbs are type-specific (not on TN)", () => {
    const tnItem: TranslationNotesItem = makeTranslationNotesItem();

    expectTypeOf(tnItem).not.toMatchTypeOf<{ readWorkspace?: unknown }>();
    expectTypeOf(tnItem).not.toMatchTypeOf<{ saveBook?: unknown }>();
    expectTypeOf(tnItem).not.toMatchTypeOf<{ addBook?: unknown }>();
  });

  it("TranslationNotesItem verbs are type-specific (not on scripture)", () => {
    const scriptureItem: UsfmScriptureItem = makeScriptureItem();

    expectTypeOf(scriptureItem).not.toMatchTypeOf<{
      listBookCodes?: unknown;
    }>();
    expectTypeOf(scriptureItem).not.toMatchTypeOf<{ readChapter?: unknown }>();
  });

  it("only type is the app-facing discriminant, not containerFormat", () => {
    const burritoItem: UsfmScriptureItem = makeScriptureItem({
      id: "es_burrito",
      folderName: "es_burrito",
      displayName: "Spanish Burrito",
      managedPath: "/library/es_burrito",
      projectPath: "/library/es_burrito",
      containerFormat: "scripture-burrito",
      language: { code: "es", name: "Spanish", direction: "ltr" },
      capabilities: {},
    });

    expect(burritoItem.containerFormat).toBe("scripture-burrito");
    expect(burritoItem.type).toBe("usfmScripture");
    expectTypeOf(burritoItem).toEqualTypeOf<UsfmScriptureItem>();
  });

  it("RTL language direction is supported", () => {
    const rtlItem: TranslationNotesItem = makeTranslationNotesItem({
      id: "ar_rtl_tn",
      displayName: "Arabic Translation Notes",
      managedPath: "/library/ar_rtl_tn",
      containerFormat: "resource-container",
      language: { code: "ar", name: "Arabic", direction: "rtl" },
    });

    expect(rtlItem.language.direction).toBe("rtl");
  });

  it("isEditableItem returns true for scripture with editableWith capability", () => {
    const scriptureItem: LibraryItem = makeScriptureItem();

    expect(isEditableItem(scriptureItem)).toBe(true);
  });

  it("isEditableItem returns false for translation notes", () => {
    const tnItem: LibraryItem = makeTranslationNotesItem();

    expect(isEditableItem(tnItem)).toBe(false);
  });

  it("isEditableItem returns false for scripture without editable capability", () => {
    const readOnlyScripture: LibraryItem = makeScriptureItem({
      capabilities: {},
    });

    expect(isEditableItem(readOnlyScripture)).toBe(false);
  });

  it("isRemoteSyncCapable detects remote sync capability", () => {
    const syncCapableItem: LibraryItem = makeTranslationNotesItem({
      capabilities: {
        remoteSync: {
          kind: "remoteSync",
          source: {
            kind: "git",
            identifier: "https://github.com/example/tn.git",
            ref: "main",
          },
          applyUpdate: async () => {},
        },
      },
    });

    expect(isRemoteSyncCapable(syncCapableItem)).toBe(true);
  });

  it("isRemoteSyncCapable returns false when capability is absent", () => {
    const noSyncItem: LibraryItem = makeTranslationNotesItem();

    expect(isRemoteSyncCapable(noSyncItem)).toBe(false);
  });

  it("isAnchorNavigationCapable detects anchor navigation capability", () => {
    const anchorCapableItem: LibraryItem = makeScriptureItem({
      capabilities: {
        editableWith: "usfmScripture",
        anchorNavigation: { kind: "anchorNavigation" },
      },
    });

    expect(isAnchorNavigationCapable(anchorCapableItem)).toBe(true);
  });

  it("isAnchorNavigationCapable returns false when capability is absent", () => {
    const noAnchorItem: LibraryItem = makeTranslationNotesItem();

    expect(isAnchorNavigationCapable(noAnchorItem)).toBe(false);
  });

  it("capability guards narrow types correctly for type-specific operations", () => {
    const syncCapableTn: LibraryItem = makeTranslationNotesItem({
      capabilities: {
        remoteSync: {
          kind: "remoteSync",
          source: { kind: "git", identifier: "repo.git" },
          applyUpdate: async () => {},
        },
      },
      listBookCodes: async () => ["MAT", "MRK"],
    });

    if (isRemoteSyncCapable(syncCapableTn)) {
      expectTypeOf(
        syncCapableTn.capabilities.remoteSync,
      ).toMatchTypeOf<RemoteSyncCapability>();
      expect(syncCapableTn.capabilities.remoteSync.applyUpdate).toBeDefined();
    }
  });

  it("composes multiple capabilities on a single item", () => {
    const fullyCapableItem: LibraryItem = makeScriptureItem({
      capabilities: {
        editableWith: "usfmScripture",
        remoteSync: {
          kind: "remoteSync",
          source: { kind: "git", identifier: "repo.git" },
          applyUpdate: async () => {},
        },
        anchorNavigation: { kind: "anchorNavigation" },
      },
    });

    expect(isEditableItem(fullyCapableItem)).toBe(true);
    expect(isRemoteSyncCapable(fullyCapableItem)).toBe(true);
    expect(isAnchorNavigationCapable(fullyCapableItem)).toBe(true);
  });

  it("capabilities are optional and independently absent", () => {
    const minimalItem: LibraryItem = makeTranslationNotesItem();

    expect(isEditableItem(minimalItem)).toBe(false);
    expect(isRemoteSyncCapable(minimalItem)).toBe(false);
    expect(isAnchorNavigationCapable(minimalItem)).toBe(false);
  });
});
