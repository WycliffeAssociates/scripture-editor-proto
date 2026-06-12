import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

import type { ScriptureBurritoMetadata } from "./scriptureBurritoSchemas.ts";

/**
 * Build the Burrito `ingredient` metadata entry for one scripture file.
 *
 * When the editor saves a book back to a Burrito-backed workspace, the metadata
 * file has to keep its checksum and title information in sync with the rewritten
 * USFM file on disk.
 */
export async function createBurritoIngredient(
  filePath: string,
  contents: string,
  md5Service: IMd5Service,
  localizedBookTitle?: string,
  bookCode?: string,
) {
  const md5Checksum = await md5Service.calculateMd5(contents);
  return {
    checksum: {
      md5: md5Checksum,
    },
    size: contents.length,
    mimeType: "text/usfm",
    title: localizedBookTitle || bookCode || filePath,
  };
}

/**
 * Persist one updated ingredient entry back into the Burrito metadata file after
 * a save operation changes a scripture book on disk.
 */
export async function updateBurritoMetadataFile(args: {
  fs: FileSystem;
  metadataPath: string;
  metadata: ScriptureBurritoMetadata;
  filePath: string;
  // biome-ignore lint/suspicious/noExplicitAny: ingredient payload is schema-shaped and varied
  ingredientData: any;
}): Promise<void> {
  args.metadata.ingredients = args.metadata.ingredients || {};
  args.metadata.ingredients[args.filePath] = args.ingredientData;
  await args.fs.writeText(
    args.metadataPath,
    JSON.stringify(args.metadata, null, 2),
  );
}
