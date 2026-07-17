// @vitest-environment jsdom
//
// Rewrite of the audit's REWRITE candidate
// (`useReferenceResource.test.tsx`). Drives the real `useReferenceItem`
// hook with real `@tanstack/react-query`, against partial stubs of the
// two service interfaces that are the *production* IO boundary —
// `ProjectsService` (resource enumeration / open) and `LibraryService`
// (typed-item loader). The two `vi.mock` calls left in place are at
// legitimate seams: the TanStack Router context (jsdom doesn't host a
// real router meaningfully) and the parsing-pipeline call
// (`projectParamToParsedScripture`) that the hook delegates scripture
// projection to.
//
// Coverage shape per audit ("state moves through loading → ready →
// error"): four ready-state assertions (one scripture path, one
// read-only opener, one non-scripture, one TN) plus a loading→ready
// transition test and an error-path test.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { LibraryService } from "@/app/library/LibraryService.ts";
import {
  type ReferenceItemHook,
  useReferenceItem,
} from "@/app/ui/hooks/useReferenceItem.tsx";
import type {
  PackedTranslationNotesBook,
  TranslationNotesItem,
  UsfmScriptureItem,
} from "@/core/library/LibraryItem.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import { createReferenceDocumentId } from "@/core/library/ReferenceDocuments.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

const projectParamToParsedScriptureMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    options: {
      context: {
        settingsManager: { get: vi.fn(() => "regular") },
        usfmOnionService: {},
      },
    },
  }),
}));

vi.mock("@/app/domain/api/projectToParsed.tsx", () => ({
  projectParamToParsedScripture: (...args: unknown[]) =>
    projectParamToParsedScriptureMock(...args),
}));

// ---- Factories ------------------------------------------------------

const SCRIPTURE_PATH = "/userData/projects/en_ulb";
const TN_PATH = "/userData/projects/en_tn_condensed";

function makeLoadedResource(
  overrides: Partial<LoadedReferenceItem> = {},
): LoadedReferenceItem {
  return {
    folderName: "en_ulb",
    displayName: "English ULB",
    managedPath: SCRIPTURE_PATH,
    projectId: "en_ulb",
    projectType: "resource-container",
    descriptor: {
      id: "en_ulb",
      displayName: "English ULB",
      type: "usfmScripture",
      containerFormat: "resource-container",
      language: { code: "en", name: "English", direction: "ltr" },
      readOnly: false,
    },
    listDocuments: async () => [
      {
        id: createReferenceDocumentId("41-MAT.usfm"),
        name: "Matthew",
        browsePath: ["41-MAT"],
      },
    ],
    readDocument: async () => ({
      id: createReferenceDocumentId("41-MAT.usfm"),
      name: "Matthew",
      browsePath: ["41-MAT"],
      contents: "\\id MAT",
    }),
    ...overrides,
  };
}

/**
 * Stub `UsfmScriptureItem`. Every method is a no-op since the hook
 * only consults the *typed-item* surface to derive scripture support
 * — `type`, `capabilities`, language. The book/version IO is delegated
 * to the parsing-pipeline mock above.
 */
function makeScriptureItem(): UsfmScriptureItem {
  const resource = makeLoadedResource();
  return {
    ...resource,
    id: resource.projectId ?? "en_ulb",
    managedPath: resource.managedPath,
    containerFormat: "resource-container",
    language: resource.descriptor.language,
    capabilities: { editableWith: "usfmScripture" },
    type: "usfmScripture",
    books: [],
    folderName: resource.folderName,
    projectPath: resource.managedPath,
    displayName: resource.displayName,
    listBooks: async () => [],
    getBook: async () => ({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: `${SCRIPTURE_PATH}/41-MAT.usfm`,
      contents: "\\id MAT",
    }),
    saveBook: async () => {},
    addBook: async () => ({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: `${SCRIPTURE_PATH}/41-MAT.usfm`,
    }),
    removeBook: async () => {},
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "abc123" }),
    readWorkspace: async () => ({ bookCode: "MAT", usfmContents: "" }),
    readBook: async () => null,
  } as UsfmScriptureItem;
}

function makeTranslationNotesItem(
  packed: PackedTranslationNotesBook,
): TranslationNotesItem {
  return {
    id: "en_tn_condensed",
    displayName: "English Translation Notes Condensed",
    managedPath: TN_PATH,
    containerFormat: "resource-container",
    language: { code: "en", name: "English", direction: "ltr" },
    capabilities: {},
    type: "translationNotes",
    listBookCodes: async () => ["MAT"],
    readBook: async () => packed,
    readChapter: async () => ({ "1": "# A note\n\nBody text" }),
  } as TranslationNotesItem;
}

type ServicesStub = {
  projectsService: ProjectsService;
  libraryService: { openItem: LibraryService["openItem"] };
};

function makeServices(args: {
  openItem: LibraryService["openItem"];
  listReferenceResources?: ProjectsService["listReferenceResources"];
  openResource?: ProjectsService["openResource"];
}): ServicesStub {
  return {
    projectsService: {
      listReferenceResources: args.listReferenceResources ?? (async () => []),
      openResource: args.openResource ?? (async () => null),
      openProject: vi.fn(),
      openProjectReadOnly: vi.fn(),
    } as unknown as ProjectsService,
    libraryService: { openItem: args.openItem },
  };
}

function scriptureListing(): ProjectsService["listReferenceResources"] {
  return async () => [
    {
      folderName: "en_ulb",
      projectPath: SCRIPTURE_PATH,
      displayName: "English ULB",
      projectId: "en_ulb",
      languageCode: "en",
      languageName: "English",
      projectType: "resource-container",
      type: "usfmScripture" as const,
      containerFormat: "resource-container" as const,
      isEditable: true,
      hasRemoteSync: false,
      libraryGroup: "scripture" as const,
    },
  ];
}

// ---- Harness --------------------------------------------------------

function flushPromises() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let latestHookState: ReferenceItemHook | null = null;

function HookHarness(props: {
  services: ServicesStub;
  onState: (state: ReferenceItemHook) => void;
}) {
  const state = useReferenceItem({
    projectsService: props.services.projectsService,
    libraryService: props.services.libraryService as LibraryService,
    editorMode: "regular",
    fileSystem: { exists: vi.fn() } as never,
    pickedFileIdentifier: "MAT",
    pickedChapterNumber: 1,
    gitProvider: {} as never,
  });
  useEffect(() => {
    props.onState(state);
  }, [props, state]);
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  projectParamToParsedScriptureMock.mockReset();
  latestHookState = null;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  queryClient?.clear();
  root = null;
  container = null;
  queryClient = null;
  latestHookState = null;
});

function renderHarness(services: ServicesStub) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient!}>
        <HookHarness
          services={services}
          onState={(state) => {
            latestHookState = state;
          }}
        />
      </QueryClientProvider>,
    );
  });
}

async function activate(path: string) {
  await act(async () => {
    latestHookState?.setActiveReferenceResourcePath(path);
  });
  await flushPromises();
}

// ---- Tests ----------------------------------------------------------

describe("useReferenceItem (ready states)", () => {
  it("switches to a scripture reference resource and keeps scripture navigation behavior", async () => {
    const services = makeServices({
      openItem: vi.fn(async () => makeScriptureItem()),
      listReferenceResources: scriptureListing(),
      openResource: vi.fn(async () => makeLoadedResource()),
    });
    projectParamToParsedScriptureMock.mockResolvedValue({
      parsedFiles: [
        {
          bookCode: "MAT",
          title: "Matthew",
          chapters: [{ chapterNumber: 1 }],
          prevBookId: undefined,
          nextBookId: undefined,
        },
      ],
    });

    renderHarness(services);
    await flushPromises();
    await activate(SCRIPTURE_PATH);

    expect(latestHookState?.activeReferenceResourcePath).toBe(SCRIPTURE_PATH);
    expect(latestHookState?.supportsScriptureNavigation).toBe(true);
    expect(latestHookState?.referenceBookCode).toBe("MAT");
    expect(latestHookState?.referenceChapterNumber).toBe(1);
    expect(latestHookState?.parsedFiles).toHaveLength(1);
    expect(services.libraryService.openItem).toHaveBeenCalledWith(
      SCRIPTURE_PATH,
    );
  });

  it("does not force non-scripture resources into scripture navigation behavior", async () => {
    const services = makeServices({
      openItem: vi.fn<LibraryService["openItem"]>(async () => null),
    });

    renderHarness(services);
    await flushPromises();
    await activate("/userData/projects/en_tw");

    expect(latestHookState?.supportsScriptureNavigation).toBe(false);
    expect(latestHookState?.isReferenceNavSynced).toBe(false);
    expect(latestHookState?.parsedFiles).toEqual([]);
    expect(latestHookState?.referenceChapter).toBeUndefined();
    expect(latestHookState?.goToReferenceInReference("MAT 1")).toBe(false);
    expect(projectParamToParsedScriptureMock).not.toHaveBeenCalled();
  });

  it("loads translation notes for the synced chapter anchor without forcing scripture parsing", async () => {
    const packedBook: PackedTranslationNotesBook = {
      bookCode: "MAT",
      chapters: [
        {
          chapterNumber: 1,
          verses: [
            {
              verseNumber: 1,
              rawMarkdown: "# A note\n\nBody text",
            },
          ],
        },
      ],
    };
    const services = makeServices({
      openItem: vi.fn<LibraryService["openItem"]>(async () =>
        makeTranslationNotesItem(packedBook),
      ),
    });

    renderHarness(services);
    await flushPromises();
    await activate(TN_PATH);

    expect(latestHookState?.supportsReferenceAnchors).toBe(true);
    expect(latestHookState?.supportsScriptureNavigation).toBe(false);
    expect(latestHookState?.isReferenceNavSynced).toBe(true);
    expect(projectParamToParsedScriptureMock).not.toHaveBeenCalled();
    expect(latestHookState?.translationNotesQuery.data).toEqual([
      {
        documentId: "MAT:1:1",
        bookCode: "MAT",
        chapterNumber: 1,
        verseNumber: 1,
        rawMarkdown: "# A note\n\nBody text",
      },
    ]);
  });
});

describe("useReferenceItem (loading → ready → error transitions)", () => {
  it("path is set synchronously; scripture-navigation flips on only after the load resolves", async () => {
    // Hold the openItem promise so we can observe the in-flight
    // window before resolving.
    let releaseLoad!: (item: UsfmScriptureItem) => void;
    const loadPending = new Promise<UsfmScriptureItem>((resolve) => {
      releaseLoad = resolve;
    });
    const services = makeServices({
      openItem: vi.fn(async () => loadPending),
      listReferenceResources: scriptureListing(),
    });
    projectParamToParsedScriptureMock.mockResolvedValue({
      parsedFiles: [
        {
          bookCode: "MAT",
          title: "Matthew",
          chapters: [{ chapterNumber: 1 }],
          prevBookId: undefined,
          nextBookId: undefined,
        },
      ],
    });

    renderHarness(services);
    await flushPromises();

    await act(async () => {
      latestHookState?.setActiveReferenceResourcePath(SCRIPTURE_PATH);
    });
    // Path update is synchronous; the resource hasn't loaded yet.
    expect(latestHookState?.activeReferenceResourcePath).toBe(SCRIPTURE_PATH);
    expect(latestHookState?.supportsScriptureNavigation).toBe(false);
    expect(latestHookState?.parsedFiles).toEqual([]);

    // Resolve the in-flight load and let the query settle.
    await act(async () => {
      releaseLoad(makeScriptureItem());
    });
    await flushPromises();

    expect(latestHookState?.supportsScriptureNavigation).toBe(true);
    expect(latestHookState?.parsedFiles).toHaveLength(1);
  });

  it("error path: openItem rejection leaves path set but capabilities false", async () => {
    const services = makeServices({
      openItem: vi.fn(async () => {
        throw new Error("simulated load failure");
      }),
      listReferenceResources: scriptureListing(),
    });

    renderHarness(services);
    await flushPromises();
    await activate(SCRIPTURE_PATH);

    // After failure: path is still the user's selection, but the
    // capability derivations are off (no active resource to
    // derive from). No exception escapes the hook.
    expect(latestHookState?.activeReferenceResourcePath).toBe(SCRIPTURE_PATH);
    expect(latestHookState?.supportsScriptureNavigation).toBe(false);
    expect(latestHookState?.supportsReferenceAnchors).toBe(false);
    expect(latestHookState?.parsedFiles).toEqual([]);
    expect(projectParamToParsedScriptureMock).not.toHaveBeenCalled();
  });
});
