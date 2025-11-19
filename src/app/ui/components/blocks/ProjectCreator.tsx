import type React from "react";
import RepoDownload from "@/app/ui/components/import/RepoDownload.tsx";
import {
  DirImporter,
  FileImporter,
} from "@/app/ui/components/primitives/DirImporter.tsx";
import * as styles from "@/app/ui/styles/modules/projectCreate.css.ts";

type ProjectCreatorProps = {
  onDownload: (url: string) => void;
  onOpenDirectory: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isDownloadDisabled?: boolean;
  className?: string;
};

/**
 * ProjectCreator block
 *
 * Composes the three small primitives:
 * - WacsImporter (remote repo / search)
 * - DirImporter (select folder)
 * - FileImporter (select zip)
 *
 * Uses vanilla-extract styles from projectCreate.css.ts so this block can be
 * re-used in modals or other layouts without Tailwind.
 */
export default function ProjectCreator({
  onDownload,
  onOpenDirectory,
  onOpenFile,
  isDownloadDisabled = false,
  className = "",
}: ProjectCreatorProps) {
  return (
    <section className={`${styles.container} ${className}`}>
      <h2 className={styles.title}>Create a new project</h2>

      <div className={styles.layout}>
        {/* Left column: remote repo importer */}
        <div className={styles.leftCol}>
          <h3 className={styles.leftHeading}>
            Search for a scripture repository
          </h3>

          <div className={styles.repoContainer}>
            <RepoDownload
              onDownload={onDownload}
              isDownloadDisabled={isDownloadDisabled}
            />
          </div>

          <div className={styles.repoHelper}>
            You can search or provide a remote repository to import into the
            editor. Use the input above to specify a URL or repo identifier,
            then click Download.
          </div>
        </div>

        {/* Right column: local upload controls */}
        <aside className={styles.rightCol}>
          <div className={styles.compactControls}>
            <DirImporter
              onOpenDirectory={onOpenDirectory}
              label="Upload a folder"
            />

            <FileImporter
              onOpenFile={onOpenFile}
              accept=".zip"
              label="Or select a ZIP file"
            />
          </div>

          <div className={styles.tipText}>
            Tip: To import a local project folder, use the folder selector. For
            archived exports, use a ZIP file.
          </div>
        </aside>
      </div>
    </section>
  );
}
