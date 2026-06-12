import type {
  ImportBrowserDirectorySource,
  ImportBrowserFileSource,
  ImportPathSource,
  ImportProjectOptions,
  ImportProjectResult,
  ImportService,
  NativeImportSelectionOptions,
} from "@/core/library/ImportService.ts";

/**
 * UI-facing import adapter for the create route.
 *
 * The route should not need to know about browser `FileList` details, native
 * path imports, or post-import refresh mechanics. This module converts raw UI
 * events into `ImportService` calls and handles the "refresh the app catalog
 * after import" step in one place.
 */

type OpenDirArgs = {
  importService: ImportService;
  invalidateRouterAndReload: () => void;
  onProgress?: ImportProjectOptions["onProgress"];
};

type OpenFileArgs = {
  importService: ImportService;
  invalidateRouterAndReload: () => void;
  onProgress?: ImportProjectOptions["onProgress"];
};

type CreateProjectImportFacadeArgs = {
  importService: ImportService;
  invalidateRouterAndReload: () => void;
};

function resolveDirectorySource(
  event: React.ChangeEvent<HTMLInputElement>,
): ImportBrowserDirectorySource | null {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return null;
  }

  const folderName = files[0]?.webkitRelativePath.split("/")[0];
  if (!folderName) {
    return null;
  }

  return {
    kind: "files",
    folderName,
    files,
  };
}

function resolveZipSource(
  event: React.ChangeEvent<HTMLInputElement>,
): ImportBrowserFileSource | null {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return null;
  }

  const file = files[0];
  if (!file) {
    return null;
  }

  return {
    kind: "file",
    file,
  };
}

/**
 * Browser directory entrypoint used by the create screen.
 *
 * By the time this function runs, the user has already chosen a folder. Its
 * job is only to normalize the browser event into the shared import contract
 * and then trigger the post-import app refresh.
 */
export async function handleOpenDirectory(
  event: React.ChangeEvent<HTMLInputElement>,
  { importService, invalidateRouterAndReload, onProgress }: OpenDirArgs,
): Promise<ImportProjectResult | null> {
  const source = resolveDirectorySource(event);
  if (!source) {
    return null;
  }

  const importedProject = await importService.importFolder(source, {
    onProgress,
  });
  await Promise.resolve(invalidateRouterAndReload());
  return importedProject;
}

/**
 * Shared file import helper used by both browser zip selection and drag/drop-
 * like flows that already hold a `File`.
 */
export async function processFile(
  file: File,
  { importService, invalidateRouterAndReload, onProgress }: OpenFileArgs,
): Promise<ImportProjectResult> {
  const source = {
    kind: "file",
    file,
  } satisfies ImportBrowserFileSource;

  const importedProject = await importService.importZip(source, {
    onProgress,
  });
  await Promise.resolve(invalidateRouterAndReload());
  return importedProject;
}

/**
 * Browser zip-selection entrypoint used by the create screen.
 */
export async function handleOpenFile(
  event: React.ChangeEvent<HTMLInputElement>,
  args: OpenFileArgs,
): Promise<ImportProjectResult | null> {
  const source = resolveZipSource(event);
  if (!source) {
    return null;
  }

  return await processFile(source.file, args);
}

interface ProjectImportFacade {
  download(
    url: string,
    options?: {
      onProgress?: ImportProjectOptions["onProgress"];
    },
  ): Promise<ImportProjectResult>;
  importDirectorySelection(
    event: React.ChangeEvent<HTMLInputElement>,
    options?: {
      onProgress?: ImportProjectOptions["onProgress"];
    },
  ): Promise<ImportProjectResult | null>;
  importZipSelection(
    event: React.ChangeEvent<HTMLInputElement>,
    options?: {
      onProgress?: ImportProjectOptions["onProgress"];
    },
  ): Promise<ImportProjectResult | null>;
  pickDirectory(options?: NativeImportSelectionOptions): Promise<string | null>;
  pickZip(options?: NativeImportSelectionOptions): Promise<string | null>;
  importNativeDirectoryPath(
    directoryPath: string,
    options?: {
      onProgress?: ImportProjectOptions["onProgress"];
    },
  ): Promise<ImportProjectResult>;
  importNativeZipPath(
    filePath: string,
    options?: {
      onProgress?: ImportProjectOptions["onProgress"];
    },
  ): Promise<ImportProjectResult>;
}

/**
 * Create the UI import facade consumed by the create route.
 *
 * This keeps route components intentionally thin: they call noun-level methods
 * like "download", "import directory selection", or "import native zip path"
 * instead of recreating import branching logic or remembering when to refresh
 * router state afterward.
 */
export function createProjectImportFacade(
  args: CreateProjectImportFacadeArgs,
): ProjectImportFacade {
  const refreshAfterImport = async <T>(result: T): Promise<T> => {
    await Promise.resolve(args.invalidateRouterAndReload());
    return result;
  };

  return {
    download: async (
      url: string,
      options?: {
        onProgress?: ImportProjectOptions["onProgress"];
      },
    ) => {
      const importedProject = await args.importService.importRemoteZip(
        {
          type: "fromGitRepo",
          url,
        },
        {
          onProgress: options?.onProgress,
        },
      );
      return await refreshAfterImport(importedProject);
    },
    importDirectorySelection: (
      event: React.ChangeEvent<HTMLInputElement>,
      options?: {
        onProgress?: ImportProjectOptions["onProgress"];
      },
    ) =>
      handleOpenDirectory(event, {
        importService: args.importService,
        invalidateRouterAndReload: args.invalidateRouterAndReload,
        onProgress: options?.onProgress,
      }),
    importZipSelection: (
      event: React.ChangeEvent<HTMLInputElement>,
      options?: {
        onProgress?: ImportProjectOptions["onProgress"];
      },
    ) =>
      handleOpenFile(event, {
        importService: args.importService,
        invalidateRouterAndReload: args.invalidateRouterAndReload,
        onProgress: options?.onProgress,
      }),
    pickDirectory: (
      options?: NativeImportSelectionOptions,
    ): Promise<string | null> =>
      args.importService.pickDirectory?.(options) ?? Promise.resolve(null),
    pickZip: (options?: NativeImportSelectionOptions): Promise<string | null> =>
      args.importService.pickZip?.(options) ?? Promise.resolve(null),
    importNativeDirectoryPath: async (
      directoryPath: string,
      options?: {
        onProgress?: ImportProjectOptions["onProgress"];
      },
    ) => {
      const result = await args.importService.importFolder(
        {
          kind: "path",
          path: directoryPath,
        } satisfies ImportPathSource,
        {
          onProgress: options?.onProgress,
        },
      );
      return await refreshAfterImport(result);
    },
    importNativeZipPath: async (
      filePath: string,
      options?: {
        onProgress?: ImportProjectOptions["onProgress"];
      },
    ) => {
      const result = await args.importService.importZip(
        {
          kind: "path",
          path: filePath,
        } satisfies ImportPathSource,
        {
          onProgress: options?.onProgress,
        },
      );
      return await refreshAfterImport(result);
    },
  };
}
