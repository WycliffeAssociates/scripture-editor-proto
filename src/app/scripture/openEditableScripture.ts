import type { LibraryService } from "@/app/library/LibraryService.ts";
import {
  isEditableItem,
  isUsfmScriptureItem,
  type UsfmScriptureItem,
} from "@/core/library/LibraryItem.ts";

/**
 * Scripture-specific narrowing helper at the app boundary.
 *
 * The top-level library seam stays generic. Scripture routes and helpers use
 * this function to narrow once into the editable scripture noun they need.
 */
export async function openEditableScripture(args: {
  libraryService: LibraryService;
  itemRef: string;
}): Promise<{
  project: UsfmScriptureItem | null;
  rejectionReason?: "not-found" | "not-editable";
}> {
  const item = await args.libraryService.openItem(args.itemRef);
  if (!item) {
    return { project: null, rejectionReason: "not-found" };
  }
  if (!isUsfmScriptureItem(item) || !isEditableItem(item)) {
    return { project: null, rejectionReason: "not-editable" };
  }
  return { project: item };
}
