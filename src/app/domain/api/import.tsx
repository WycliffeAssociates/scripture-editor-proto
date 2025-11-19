import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

type HandleDownloadArgs = {
  directoryProvider: IDirectoryProvider;
  invalidateRouterAndReload: () => void;
};
export async function handleDownload(
  { directoryProvider, invalidateRouterAndReload }: HandleDownloadArgs,
  url: string,
): Promise<void> {
  const importer = new WacsRepoImporter(directoryProvider);
  const didImport = await importer.import(url);
  if (didImport) {
    invalidateRouterAndReload();
  }
}

type OpenDirArgs = {
  directoryProvider: IDirectoryProvider;
  invalidateRouterAndReload: () => void;
};
export async function handleOpenDirectory(
  event: React.ChangeEvent<HTMLInputElement>,
  { directoryProvider, invalidateRouterAndReload }: OpenDirArgs,
) {
  console.log("Opening directory...");
  const files = event.target.files;
  if (!files || files.length === 0) {
    console.log("No directory selected.");
    return;
  }

  const tempDirectory = await directoryProvider.tempDirectory;
  const tempDirName = `dir-import-${Date.now()}`;
  const tempProjectDir = await tempDirectory.getDirectoryHandle(tempDirName, {
    create: true,
  });

  // Copy selected directory contents to the temporary directory
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = file.webkitRelativePath.split("/").slice(1).join("/"); // Get path relative to the selected directory
    const filePathParts = relativePath.split("/");
    const fileName = filePathParts.pop();
    const dirPath = filePathParts.join("/");

    let currentDirHandle: IDirectoryHandle = tempProjectDir;
    if (dirPath) {
      const intermediateDirs = dirPath.split("/");
      for (const dirPart of intermediateDirs) {
        currentDirHandle = await currentDirHandle.getDirectoryHandle(dirPart, {
          create: true,
        });
      }
    }

    if (fileName) {
      const fileHandle = await currentDirHandle.getFileHandle(fileName, {
        create: true,
      });
      const writer = await fileHandle.createWriter();
      await writer.write(await file.arrayBuffer());
      await writer.close();
    }
  }

  const importer = new ProjectDirectoryImporter(directoryProvider);
  await importer.importDirectory(tempProjectDir);
  // Clean up the temporary directory after import
  await tempDirectory.removeEntry(tempDirName, { recursive: true });
  invalidateRouterAndReload();
}

type OpenFileArgs = {
  directoryProvider: IDirectoryProvider;
  invalidateRouterAndReload: () => void;
};

export async function processFile(
  file: File,
  { directoryProvider, invalidateRouterAndReload }: OpenFileArgs,
): Promise<void> {
  console.log(
    `[processFile] Selected file name: ${file.name}, size: ${file.size} bytes`,
  );

  const tempDirectory = await directoryProvider.tempDirectory;
  const tempFileName = `${Date.now()}-${file.name}`;
  const tempFileHandle = await tempDirectory.getFileHandle(tempFileName, {
    create: true,
  });

  const content = await file.arrayBuffer();
  console.log(
    `[processFile] Read ArrayBuffer content size: ${content.byteLength} bytes`,
  );

  const writer = await tempFileHandle.createWriter();
  await writer.write(content);
  await writer.close();
  console.log(
    `[processFile] Content written to temporary file: ${tempFileHandle.name}`,
  );

  const importer = new ProjectFileImporter(directoryProvider);
  await importer.importFile(tempFileHandle);
  console.log("Selected ZIP File Handle:", tempFileHandle);

  // Clean up the temporary file after import
  await tempDirectory.removeEntry(tempFileName, { recursive: false });
  invalidateRouterAndReload();
}
export async function handleOpenFile(
  event: React.ChangeEvent<HTMLInputElement>,
  args: OpenFileArgs,
) {
  console.log("Opening file...");
  const files = event.target.files;
  if (!files || files.length === 0) {
    console.log("No file selected.");
    return;
  }
  const file = files[0];
  await processFile(file, args);
}
