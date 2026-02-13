import { Trans } from "@lingui/react/macro";
import { FileArchive, FolderOpen } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import LanguageApiImporter from "@/app/ui/components/import/LanguageApiImporter.tsx";
import * as styles from "@/app/ui/styles/modules/newProjectSearch.css.ts";

type ProjectCreatorProps = {
    onDownload: (url: string) => void;
    onOpenDirectory: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onOpenFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isDownloadDisabled?: boolean;
    isImporting?: boolean;
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
    isImporting = false,
    className = "",
}: ProjectCreatorProps) {
    const dirInputRef = useRef<HTMLInputElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    return (
        <section className={`${className}`}>
            <LanguageApiImporter
                onDownload={onDownload}
                isDownloadDisabled={isDownloadDisabled || isImporting}
                headerActions={
                    <>
                        <button
                            type="button"
                            className={styles.topActionButton}
                            onClick={() => dirInputRef.current?.click()}
                            disabled={isImporting}
                        >
                            <FolderOpen size={18} />
                            <Trans>Folder</Trans>
                        </button>

                        <button
                            type="button"
                            className={styles.topActionButton}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                        >
                            <FileArchive size={18} />
                            <Trans>ZIP</Trans>
                        </button>

                        <input
                            data-testid={TESTING_IDS.import.dirImporter}
                            ref={dirInputRef}
                            type="file"
                            webkitdirectory="true"
                            multiple
                            className={styles.hiddenInput}
                            style={{
                                position: "absolute",
                                opacity: 0,
                                width: 1,
                                height: 1,
                            }}
                            onChange={onOpenDirectory}
                            disabled={isImporting}
                        />

                        <input
                            data-testid={TESTING_IDS.import.importer}
                            ref={fileInputRef}
                            type="file"
                            accept=".zip"
                            className={styles.hiddenInput}
                            style={{
                                position: "absolute",
                                opacity: 0,
                                width: 1,
                                height: 1,
                            }}
                            onChange={onOpenFile}
                            disabled={isImporting}
                        />
                    </>
                }
            />
        </section>
    );
}
