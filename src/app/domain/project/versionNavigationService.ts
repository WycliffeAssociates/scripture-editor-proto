import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { applyIncomingChapterAll } from "@/app/domain/project/compare/compareService.ts";
import { markFilesAsSaved } from "@/app/domain/project/saveAndRevertService.ts";

export function applyVersionSnapshotToWorkingFiles(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
}) {
    applyIncomingChapterAll({
        workingFiles: args.workingFiles,
        sourceFiles: args.sourceFiles,
    });
    // Version navigation should establish a clean baseline at the selected snapshot.
    markFilesAsSaved(args.workingFiles);
}
