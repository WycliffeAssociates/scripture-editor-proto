import { Trans } from "@lingui/react/macro";
import { FileArchive, FolderOpen } from "lucide-react";
import type React from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import LanguageApiImporter from "@/app/ui/components/import/LanguageApiImporter.tsx";
import * as styles from "@/app/ui/styles/modules/newProjectSearch.css.ts";

type ProjectCreatorProps = {
    onDownload: (url: string) => void;
    onDirectoryAction: () => void;
    onZipAction: () => void;
    onDirectorySelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onZipSelected?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    directoryInputRef?: React.RefObject<HTMLInputElement | null>;
    zipInputRef?: React.RefObject<HTMLInputElement | null>;
    isDownloadDisabled?: boolean;
    isImporting?: boolean;
    className?: string;
};

/**
 * Import-entry surface shown on the create route.
 *
 * This is the UI front door to the import pipeline: remote lookup, local folder,
 * or local zip. It does not decide how items are stored or loaded; it just
 * gathers the user's chosen source and hands it to the import actions upstream.
 */
export default function ProjectCreator({
    onDownload,
    onDirectoryAction,
    onZipAction,
    onDirectorySelected,
    onZipSelected,
    directoryInputRef,
    zipInputRef,
    isDownloadDisabled = false,
    isImporting = false,
    className = "",
}: ProjectCreatorProps) {
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
                            onClick={onDirectoryAction}
                            disabled={isImporting}
                        >
                            <FolderOpen size={18} />
                            <Trans>Folder</Trans>
                        </button>

                        <button
                            type="button"
                            className={styles.topActionButton}
                            onClick={onZipAction}
                            disabled={isImporting}
                        >
                            <FileArchive size={18} />
                            <Trans>ZIP</Trans>
                        </button>

                        {onDirectorySelected ? (
                            <input
                                data-testid={TESTING_IDS.import.dirImporter}
                                ref={directoryInputRef}
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
                                onChange={onDirectorySelected}
                                disabled={isImporting}
                            />
                        ) : null}

                        {onZipSelected ? (
                            <input
                                data-testid={TESTING_IDS.import.importer}
                                ref={zipInputRef}
                                type="file"
                                accept=".zip"
                                className={styles.hiddenInput}
                                style={{
                                    position: "absolute",
                                    opacity: 0,
                                    width: 1,
                                    height: 1,
                                }}
                                onChange={onZipSelected}
                                disabled={isImporting}
                            />
                        ) : null}
                    </>
                }
            />
        </section>
    );
}
