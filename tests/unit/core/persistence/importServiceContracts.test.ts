import { describe, expect, expectTypeOf, it } from "vitest";

import type { RouterContext } from "@/app/entrypoint.tsx";
import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import {
  createImportProgressUpdate,
  ImportProgressPhase,
  isTerminalImportProgressPhase,
  type ImportFolderSource,
  type ImportProgressPhase as ImportProgressPhaseValue,
  type ImportZipSource,
  type ImportProgressUpdate,
  type ImportProjectOptions,
  type ImportProjectResult,
  type ImportService,
} from "@/core/library/ImportService.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

describe("import service contracts", () => {
  it("pins the phase-oriented progress surface", () => {
    expect(ImportProgressPhase).toEqual({
      SELECT_SOURCE: "select-source",
      READ_SOURCE: "read-source",
      COPY_CONTENT: "copy-content",
      EXTRACT_ARCHIVE: "extract-archive",
      RESHAPE_RESOURCE: "reshape-resource",
      INSPECT_RESOURCE: "inspect-resource",
      INDEX_RESOURCE: "index-resource",
      COMPLETE: "complete",
      FAILED: "failed",
    });

    expectTypeOf<ImportProgressUpdate>().toMatchTypeOf<{
      phase: ImportProgressPhaseValue;
      message: string;
      current?: number;
      total?: number;
      itemType?: IndexedLibraryItemType;
    }>();

    expect(
      createImportProgressUpdate(
        ImportProgressPhase.INDEX_RESOURCE,
        "Indexing imported resource...",
        {
          current: 3,
          total: 9,
        },
      ),
    ).toEqual({
      phase: "index-resource",
      message: "Indexing imported resource...",
      current: 3,
      total: 9,
    });
    expect(isTerminalImportProgressPhase(ImportProgressPhase.COMPLETE)).toBe(
      true,
    );
    expect(isTerminalImportProgressPhase(ImportProgressPhase.READ_SOURCE)).toBe(
      false,
    );
  });

  it("pins the source result and service method shapes", () => {
    expectTypeOf<ImportProjectResult>().toMatchTypeOf<{
      project: ProjectListItem;
      gitReady: boolean;
      isEditableProject: boolean;
      warning?: string;
    }>();

    expectTypeOf<ImportService["importFolder"]>().parameters.toEqualTypeOf<
      [source: ImportFolderSource, options?: ImportProjectOptions]
    >();
    expectTypeOf<ImportService["importZip"]>().parameters.toEqualTypeOf<
      [source: ImportZipSource, options?: ImportProjectOptions]
    >();
    expectTypeOf<ImportService["importRemoteZip"]>().parameters.toEqualTypeOf<
      [source: ImportSource, options?: ImportProjectOptions]
    >();
    expectTypeOf<ImportService["importFolder"]>().returns.toEqualTypeOf<
      Promise<ImportProjectResult>
    >();
  });

  it("allows app context to carry the import service", () => {
    expectTypeOf<
      RouterContext["importService"]
    >().toEqualTypeOf<ImportService>();
  });
});
