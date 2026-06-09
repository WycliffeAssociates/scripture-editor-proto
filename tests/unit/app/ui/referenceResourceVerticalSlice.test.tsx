// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { ReferenceEditor } from "@/app/ui/components/blocks/ReferenceEditor.tsx";
import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";
import type { WorkSpaceContextType } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { useReferenceItem } from "@/app/ui/hooks/useReferenceItem.tsx";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { isRemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { seedEnTnCondensedFixture } from "@tests/helpers/mockData/enTnCondensed.ts";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    options: {
      context: {
        settingsManager: {
          get: vi.fn(() => "regular"),
        },
        usfmOnionService: {},
      },
    },
  }),
}));

const PROJECT_ROOT_PATH = "/projects/en_tn_condensed";

function TestProviders(props: { children: React.ReactNode; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <I18nProvider i18n={i18n}>{props.children}</I18nProvider>
    </QueryClientProvider>
  );
}

function flushPromises() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.body.textContent?.includes(text)) {
      return;
    }
    await flushPromises();
  }

  throw new Error(`Timed out waiting for text: ${text}`);
}

function VerticalSliceHarness(props: {
  projectsService: ProjectsService;
  libraryService: Pick<LibraryService, "openItem">;
  fileSystem: InMemoryFileSystem;
}) {
  const referenceEditorRef = useRef(null);
  const referenceResource = useReferenceItem({
    projectsService: props.projectsService,
    libraryService: props.libraryService as LibraryService,
    fileSystem: props.fileSystem,
    pickedFileIdentifier: "LUK",
    pickedChapterNumber: 22,
    editorMode: "regular",
    gitProvider: {} as never,
  });

  useEffect(() => {
    if (referenceResource.activeReferenceResourcePath) return;
    referenceResource.setActiveReferenceResourcePath(PROJECT_ROOT_PATH);
  }, [
    referenceResource.activeReferenceResourcePath,
    referenceResource.setActiveReferenceResourcePath,
  ]);

  const value = {
    referenceEditorRef,
    search: { isSearchPaneOpen: false },
    referenceResource,
  } as WorkSpaceContextType;

  return (
    <WorkspaceContext.Provider value={value}>
      <ReferenceEditor />
    </WorkspaceContext.Provider>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("min-width"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
});

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
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
  document.body.innerHTML = "";
});

function render(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<TestProviders queryClient={queryClient!}>{ui}</TestProviders>);
  });
}

describe("reference-resource vertical slice", () => {
  it("renders TN content end to end through the reference-resource seam and keeps remote sync model-only", async () => {
    const fileSystem = new InMemoryFileSystem();
    await seedEnTnCondensedFixture(fileSystem, PROJECT_ROOT_PATH);

    const loader = new ResourceContainerProjectLoader();
    const resource = await loader.openResource({
      fs: fileSystem,
      projectRootPath: PROJECT_ROOT_PATH,
      folderName: "en_tn_condensed",
      displayName: "English Translation Notes Condensed",
    });
    if (!resource) {
      throw new Error("Expected seeded TN fixture to load as a resource");
    }

    expect(isRemoteSyncCapable(resource)).toBe(false);

    const projectsService = {
      listProjects: vi.fn(async () => []),
      listReferenceResources: vi.fn(async () => [
        {
          folderName: "en_tn_condensed",
          projectPath: PROJECT_ROOT_PATH,
          displayName: "English Translation Notes Condensed",
          projectId: "en_tn_condensed",
          languageCode: "en",
          languageName: "English",
          projectType: "resource-container",
          type: "translationNotes" as const,
          containerFormat: "resource-container" as const,
          isEditable: false,
          hasRemoteSync: false,
          libraryGroup: "translation-notes" as const,
        },
      ]),
      openResource: vi.fn(async (projectRef: string) =>
        projectRef === PROJECT_ROOT_PATH ? resource : null,
      ),
      openProject: vi.fn(async () => null),
      openProjectReadOnly: vi.fn(async () => null),
      openEditableProject: vi.fn(async () => ({
        project: null,
        rejectionReason: "not-found" as const,
      })),
      importProject: vi.fn(),
      deleteProject: vi.fn(),
      renameDisplayName: vi.fn(),
      reconcileIndex: vi.fn(),
    } as unknown as ProjectsService;
    const libraryService = {
      openItem: vi.fn(async (projectRef: string) =>
        projectRef === PROJECT_ROOT_PATH
          ? ({
              id: "en_tn_condensed",
              displayName: "English Translation Notes Condensed",
              managedPath: PROJECT_ROOT_PATH,
              containerFormat: "resource-container",
              language: {
                code: "en",
                name: "English",
                direction: "ltr",
              },
              capabilities: {},
              type: "translationNotes",
              listBookCodes: async () => ["LUK"],
              readBook: async () => ({
                bookCode: "LUK",
                chapters: [
                  {
                    chapterNumber: 22,
                    verses: [
                      {
                        verseNumber: 71,
                        rawMarkdown:
                          '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
                      },
                    ],
                  },
                ],
              }),
              readChapter: async () => ({
                "71": '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
              }),
            } as const)
          : null,
      ),
    };

    render(
      <VerticalSliceHarness
        projectsService={projectsService}
        libraryService={libraryService}
        fileSystem={fileSystem}
      />,
    );

    await waitForText("Verse 71");
    await waitForText("Why do we still need a witness?");

    expect(document.body.textContent).toContain('"We have no further need for witnesses!"');
    expect(
      document.querySelector(`[data-testid="${TESTING_IDS.reference.syncNavigationToggle}"]`),
    ).not.toBeNull();
    expect(document.querySelector(`[data-testid="${TESTING_IDS.referencePicker}"]`)).toBeNull();
    expect(document.body.textContent).not.toContain("Check for updates");
    expect(document.body.textContent).not.toContain("Apply updates");
    expect(libraryService.openItem).toHaveBeenCalledWith(PROJECT_ROOT_PATH);
  });
});
