import { Trans } from "@lingui/macro";
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
      <h2 className={styles.title}>
        <Trans>Create a new project</Trans>
      </h2>

      <div className={styles.layout}>
        {/* Left column: remote repo importer */}
        <div className={styles.leftCol}>
          <h3 className={styles.leftHeading}>
            <Trans>Search for a scripture repository</Trans>
          </h3>

          <div className={styles.repoContainer}>
            <RepoDownload
              onDownload={onDownload}
              isDownloadDisabled={isDownloadDisabled}
            />
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
        </aside>
      </div>
    </section>
  );
}
