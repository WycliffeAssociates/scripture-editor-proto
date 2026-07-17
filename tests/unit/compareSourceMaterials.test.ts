import { describe, expect, it } from "vitest";

import {
  createSavedCompareSourceDescriptor,
  createWorkingCompareSourceDescriptor,
} from "@/app/domain/project/compare/sourceMaterials.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

function token(id: string, source: string): Token {
  return { id, kind: "text", source };
}

function files(args: {
  source: readonly Token[];
  current: readonly Token[];
  dirty: boolean;
}): ScriptureBookState[] {
  return [
    {
      bookCode: "GEN",
      path: "GEN.usfm",
      title: "Genesis",
      nextBookId: null,
      prevBookId: null,
      chapters: [
        {
          chapterNumber: 1,
          direction: "ltr",
          eol: "\n",
          sourceTokens: [...args.source],
          currentTokens: [...args.current],
          dirty: args.dirty,
        },
      ],
    },
  ];
}

function project(): Project {
  return {
    folderName: "gen-project",
    displayName: "Genesis project",
    projectPath: "/projects/gen-project",
    projectId: "gen-project-id",
    projectType: "resource-container",
    language: { code: "en", name: "English", direction: "ltr" },
    books: [],
    listBooks: async () => [],
    getBook: async () => {
      throw new Error("not needed");
    },
    saveBook: async () => {},
    addBook: async () => {
      throw new Error("not needed");
    },
    removeBook: async () => {},
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "head" }),
  };
}

describe("working and saved compare sources", () => {
  it("loads the current working tokens from an ordinary store argument", async () => {
    const savedToken = token("saved", "saved");
    const workingToken = token("working", "working");
    const store = new WorkingFilesStore(
      files({ source: [savedToken], current: [workingToken], dirty: true }),
    );
    const descriptor = createWorkingCompareSourceDescriptor({
      workingFilesStore: store,
      project: project(),
    });

    const material = await descriptor.reload();
    const chapter = material.files[0]?.chapters[0];

    expect(descriptor).toMatchObject({
      id: "working:gen-project-id",
      label: "Working copy",
      locator: { kind: "working", projectId: "gen-project-id" },
      writable: true,
    });
    expect(chapter?.sourceTokens).toEqual([savedToken]);
    expect(chapter?.currentTokens).toEqual([workingToken]);
    expect(chapter?.dirty).toBe(true);
    expect(material.metadata).toEqual({
      projectId: "gen-project-id",
      languageId: "en",
      languageDirection: "ltr",
    });
  });

  it("projects saved source tokens as the comparison's current tokens", async () => {
    const savedToken = token("saved", "saved");
    const store = new WorkingFilesStore(
      files({
        source: [savedToken],
        current: [token("working", "working")],
        dirty: true,
      }),
    );
    const descriptor = createSavedCompareSourceDescriptor({
      workingFilesStore: store,
      project: project(),
    });

    const material = await descriptor.reload();
    const chapter = material.files[0]?.chapters[0];

    expect(descriptor).toMatchObject({
      id: "saved:gen-project-id",
      label: "Saved copy",
      locator: { kind: "saved", projectId: "gen-project-id" },
      writable: false,
    });
    expect(chapter?.currentTokens).toBe(chapter?.sourceTokens);
    expect(chapter?.currentTokens).toEqual([savedToken]);
    expect(chapter?.dirty).toBe(false);
    expect(Object.isFrozen(chapter?.currentTokens)).toBe(true);
  });

  it("reloads from the latest store state without changing an earlier material", async () => {
    const initial = files({
      source: [token("saved", "saved")],
      current: [token("working-1", "first")],
      dirty: true,
    });
    const store = new WorkingFilesStore(initial);
    const descriptor = createWorkingCompareSourceDescriptor({
      workingFilesStore: store,
      project: project(),
    });
    const first = await descriptor.reload();

    store.reset(
      files({
        source: [token("saved", "saved")],
        current: [token("working-2", "second")],
        dirty: true,
      }),
    );
    const refreshed = await descriptor.reload();

    expect(first.files[0]?.chapters[0]?.currentTokens[0]?.source).toBe("first");
    expect(refreshed.files[0]?.chapters[0]?.currentTokens[0]?.source).toBe(
      "second",
    );
    expect(first.files).not.toBe(refreshed.files);
  });
});
